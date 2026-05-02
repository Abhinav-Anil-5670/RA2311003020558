# Stage 1

## Core Actions Identified
To support a robust campus notification platform, the following core actions are required for logged-in users:
1. **Fetch Notifications:** Retrieve a paginated list of notifications for the user.
2. **Mark as Read:** Update the status of a specific notification to indicate it has been read.
3. **Mark All as Read:** Bulk update all unread notifications for the user to a read state.
4. **Real-time Connection:** Establish a persistent connection to receive incoming notifications instantly.

---

## REST API Endpoints & Contracts

### 1. Fetch Notifications

Retrieves a paginated list of notifications for the authenticated user.

* **Endpoint:** `GET /api/v1/notifications`
* **Headers:**
  * `Authorization: Bearer <user_access_token>`
  * `Accept: application/json`
* **Query Parameters:**
  * `page` (integer, default: 1)
  * `limit` (integer, default: 20)
  * `status` (string, optional): "unread" | "read" | "all"
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
        "type": "Placement",
        "message": "AFFORDMED has scheduled an interview for tomorrow.",
        "isRead": false,
        "createdAt": "2024-05-24T10:30:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 95
    }
  }
}
```

### 2. Mark Notification as Read

Updates a single notification's status.

* **Endpoint:** `PATCH /api/v1/notifications/:id/read`
* **Headers:**
  * `Authorization: Bearer <user_access_token>`
  * `Content-Type: application/json`
* **Request Body:** `{}` (Empty, action is implied by the URL)
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Notification marked as read successfully."
}
```

### 3. Mark All Notifications as Read

Bulk updates all unread notifications for the user.

* **Endpoint:** `PATCH /api/v1/notifications/read-all`
* **Headers:**
  * `Authorization: Bearer <user_access_token>`
  * `Content-Type: application/json`
* **Request Body:** `{}`
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "All notifications marked as read."
}
```

## Real-Time Notification Mechanism

For real-time delivery of updates (Placements, Events, Results), I propose using Server-Sent Events (SSE).

### Why SSE over WebSockets?

Notifications are inherently a unidirectional data flow (Server -> Client). Unlike chat applications that require bi-directional communication, a campus notification system only needs the server to push events to the student's browser. SSE operates over standard HTTP, is native to the browser, automatically handles reconnections, and has significantly less overhead than establishing a full WebSocket connection.

---

# Stage 2

## Persistent Storage Choice

I suggest using a Relational Database like **PostgreSQL**.

While NoSQL (like MongoDB) is often praised for high-write logging systems, a campus notification system has highly structured data with clear relationships (Students -> Notifications). PostgreSQL provides robust ACID compliance ensuring no notifications are "lost" during bulk writes, and its native support for JSONB allows flexibility if we need to attach dynamic metadata to specific event types in the future.

## Database Schema

**Table:** `notifications`

* `id` (UUID, Primary Key)
* `student_id` (VARCHAR, Indexed, Foreign Key mapping to Users)
* `notification_type` (ENUM: 'Event', 'Result', 'Placement')
* `message` (TEXT)
* `is_read` (BOOLEAN, Default: false)
* `created_at` (TIMESTAMP, Default: CURRENT_TIMESTAMP)

## Scaling Challenges & Solutions

As data volume increases to millions of rows, the following problems will arise:

1. **Slow Read Queries:** Fetching paginated unread notifications for a user will scan too many rows.
   * **Solution:** Implement composite B-Tree indexing on `(student_id, is_read, created_at DESC)`.

2. **Database Bloat:** Millions of historical (read) notifications will consume memory and slow down writes.
   * **Solution:** Implement Table Partitioning by month/year. Furthermore, implement a cron-job to archive notifications older than 6 months to cold storage (e.g., AWS S3) and delete them from the primary operational table.

3. **High Load on Page Load:** Fetching unread counts on every single page load will overwhelm the DB.
   * **Solution:** Introduce a caching layer like Redis to store the `unread_count` for active sessions, invalidating it only when a new notification is pushed or marked as read.

## SQL Queries

### 1. Fetch paginated notifications based on REST API (Stage 1):
```sql
SELECT id, notification_type, message, is_read, created_at 
FROM notifications 
WHERE student_id = '12345' 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 0;
```

### 2. Mark specific notification as read:
```sql
UPDATE notifications 
SET is_read = true 
WHERE id = 'd146095a-0d86-4a34-9e69-3900a14576bc' AND student_id = '12345';
```

### 3. Mark all as read:
```sql
UPDATE notifications 
SET is_read = true 
WHERE student_id = '12345' AND is_read = false;
```
