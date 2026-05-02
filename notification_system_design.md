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

***

# Stage 3: Query Optimization

## Analyzing the Slow Query
**The Query:**
`SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC;`

* **Is it accurate?** Yes, the query is functionally accurate and will return the correct unread notifications.
* **Why is it slow?** With 5,000,000 records, the database engine is likely performing a "Full Table Scan" (or inefficient index scan if only `studentID` is indexed). It has to manually check every row to see if `isRead` is false and then sort the results in memory.
* **What to change:** I would add a **Composite B-Tree Index** on `(studentID, isRead, createdAt)`. 
* **Computation Cost:** By adding the composite index, the time complexity drops from O(N) (scanning 5 million rows) to O(log N) (navigating the B-tree). The database can jump directly to the exact student, instantly filter by the boolean, and fetch the pre-sorted results.

## Evaluating "Index Everything"
Adding an index to *every* column is **terrible advice**. 
* **Why it fails:** While indexes speed up READ operations, they heavily penalize WRITE operations (INSERT, UPDATE, DELETE). Every time a new notification is created or marked as read, the database would have to update multiple B-Trees. Furthermore, indexing every column causes massive database bloat, consuming unnecessary disk space and memory. Indexes should be applied strategically based on query patterns, not blindly.

## Target Query: Recent Placement Notifications
Write a query to find all students who got a placement notification in the last 7 days:
```sql
SELECT DISTINCT student_id 
FROM notifications 
WHERE notification_type = 'Placement' 
AND created_at >= NOW() - INTERVAL '7 days'; 
```

# Stage 4: High-Load Read Optimization
### The Problem
Fetching notifications (or even just the unread count) synchronously from a relational database on every single page load for 50,000 students will immediately exhaust database connection pools and cause CPU bottlenecks.

### The Solution: Distributed Caching
To protect the primary database and improve user experience, we must implement an in-memory caching layer using Redis.

### Implementation Strategy:
* **Cache the Unread Count:** Store the unread count as a simple Key-Value pair in Redis (e.g., user:{id}:unread_count). On page load, the frontend hits an API that reads from Redis (sub-millisecond response) instead of querying PostgreSQL.
* **Cache Invalidation:** When a new notification is generated, the backend increments the Redis counter. When a user reads a notification, the backend decrements it.
* **Event-Driven UI:** As established in Stage 1, use Server-Sent Events (SSE) to push the new unread count to the client in real-time, eliminating the need for the frontend to request data on page load entirely.

## Tradeoffs
### Strategy 1: Read-Through Redis Caching
* **Pros:** Drastically reduces DB load; sub-millisecond read times; highly scalable.
* **Cons:** Introduces "Cache Invalidation" complexity (the hardest problem in computer science). If the server crashes between updating the DB and updating Redis, users might see stale data (e.g., phantom unread badges).

### Strategy 2: Server-Sent Events (SSE) / WebSockets
* **Pros:** Zero polling. The database is only queried once upon initial connection.
* **Cons:** Maintaining persistent connections for 50,000 concurrent students requires careful load balancing and specialized infrastructure to handle open file descriptors.

***

# Stage 5: System Reliability & Fault Tolerance

## Shortcomings of the Proposed Implementation
1. **Synchronous & Blocking:** Iterating through 50,000 students sequentially is extremely slow. If `send_email` takes just 200ms per API call, this loop will take ~2.7 hours to complete. The HTTP request will timeout long before it finishes.
2. **Lack of Fault Tolerance:** If the loop crashes on student #25,000, the remaining 25,000 students get nothing.
3. **Coupled Failures:** If the 3rd-party Email API goes down and throws an error, the code never reaches `save_to_db` or `push_to_app`. A failure in one external service breaks the entire system.

## Handling the "Failed for 200 students" Scenario
Because the current pseudocode lacks a dead-letter queue or transaction logging, fixing the 200 failures is a nightmare. You would have to manually write a script to cross-reference the HR roster against the database to figure out exactly who was skipped, and then manually re-trigger those specific emails. 

## Redesign for Reliability & Speed
To make this reliable and fast, we must decouple the process using an **Asynchronous Message Queue** (like RabbitMQ, Kafka, or AWS SQS) and Background Workers. 

The initial API call should simply accept the payload, bulk insert the records into the database (so we have an immediate permanent record), and push messages into a queue. Separate worker nodes will consume that queue independently.

## Should Saving to DB and Sending Email Happen Together?
**No, they should be decoupled.** 
Writing to our own database is an internal, highly reliable, and fast operation. Sending an email relies on an external 3rd-party service (like AWS SES or SendGrid) which is prone to rate limits, network latency, and outages. They have completely different failure domains. We should always secure the data in our DB first, and handle the unreliable email sending asynchronously.

## Revised Pseudocode
```python
# 1. Main API Handler (Fast Response)
function notify_all(student_ids: array, message: string):
    # Perform a single bulk insert (Highly efficient)
    bulk_save_to_db(student_ids, message) 
    
    # Push tasks to an asynchronous message broker
    for student_id in student_ids:
        message_queue.publish(
            queue_name="delivery_queue", 
            payload={ "student_id": student_id, "message": message }
        )
        
    return "202 Accepted: Notifications are processing in the background"

# 2. Background Worker (Scalable & Fault Tolerant)
# Multiple instances of this worker run independently
function worker_process_delivery(payload):
    try:
        # Push to app via SSE (Fast)
        push_to_app(payload.student_id, payload.message)
        
        # Send Email (Slow/Unreliable)
        send_email(payload.student_id, payload.message)
        
    except ExternalAPIError as e:
        # If email fails, push it to a retry queue with exponential backoff
        message_queue.retry_later(payload, attempt_count += 1)