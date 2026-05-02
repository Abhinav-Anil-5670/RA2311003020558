import { Log } from '../logging_middleware/logger';
import * as dotenv from 'dotenv';
dotenv.config();

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const BASE_URL = "http://20.207.122.201/evaluation-service";

interface Notification {
    ID: string;
    Type: "Placement" | "Result" | "Event";
    Message: string;
    Timestamp: string;
}

// Weight dictionary: Placement is highest priority, Event is lowest
const PRIORITY_WEIGHTS: Record<string, number> = {
    "Placement": 3,
    "Result": 2,
    "Event": 1
};

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ACCESS_TOKEN}`
};

// 1. Fetch Notifications from API
async function fetchNotifications(): Promise<Notification[]> {
    try {
        const response = await fetch(`${BASE_URL}/notifications`, { headers });
        const data: any = await response.json();

        if (!response.ok) {
            console.error("❌ NOTIFICATION API ERROR:", data);
            return [];
        }

        await Log("backend", "info", "service", "Successfully fetched notifications data.");
        return data.notifications || [];
    } catch (error) {
        await Log("backend", "error", "service", "Failed to fetch notifications data.");
        return [];
    }
}

// 2. The Priority Sorting Algorithm
function getPriorityInbox(notifications: Notification[], topN: number): Notification[] {
    return notifications.sort((a, b) => {
        const weightA = PRIORITY_WEIGHTS[a.Type] || 0;
        const weightB = PRIORITY_WEIGHTS[b.Type] || 0;

        // Rule 1: Sort by Weight (Descending)
        if (weightA !== weightB) {
            return weightB - weightA;
        }

        // Rule 2: If Weights are equal, Sort by Recency (Descending)
        const timeA = new Date(a.Timestamp).getTime();
        const timeB = new Date(b.Timestamp).getTime();
        return timeB - timeA;
    }).slice(0, topN); // Return only the Top 'n'
}

// 3. Main Execution
async function generateInbox() {
    console.log("Fetching notifications to generate Priority Inbox...\n");
    await Log("backend", "info", "service", "Initializing Priority Inbox generation.");

    const notifications = await fetchNotifications();

    if (!notifications.length) {
        console.error("No notifications found or token expired.");
        return;
    }

    // Get Top 10 Priority Notifications
    const top10Inbox = getPriorityInbox(notifications, 10);

    console.log("🔔 --- PRIORITY INBOX (TOP 10) --- 🔔\n");
    top10Inbox.forEach((notif, index) => {
        console.log(`[${index + 1}] TYPE: ${notif.Type.toUpperCase()} | TIME: ${notif.Timestamp}`);
        console.log(`    MSG: ${notif.Message}`);
        console.log(`    ID:  ${notif.ID}\n`);
    });

    console.log("Priority Inbox generated successfully!");
    await Log("backend", "info", "service", "Priority Inbox generated and displayed to user.");
}

// Run the script
generateInbox();