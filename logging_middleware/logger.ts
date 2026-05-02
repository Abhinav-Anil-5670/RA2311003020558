import * as dotenv from 'dotenv';
dotenv.config();
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const LOG_API_URL = "http://20.207.122.201/evaluation-service/logs";

/**
 * Reusable Logging Middleware
 * @param stack "backend" | "frontend"
 * @param level "debug" | "info" | "warn" | "error" | "fatal"
 * @param pkg "cache | controller | cron_job | db | domain | handler | repository | route | service"
 * @param message string
 */
export const Log = async (stack: string, level: string, pkg: string, message: string) => {
    try {
        const response = await fetch(LOG_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                stack: stack.toLowerCase(),
                level: level.toLowerCase(),
                package: pkg.toLowerCase(),
                message: message
            })
        });

        if (!response.ok) {
            console.error(`[Local Debug] Failed to send log: ${response.status} - ${response.statusText}`);
        } else {
            const data = await response.json();
            console.log(`Logged In - `, data);
        }
    } catch (error) {
        console.error("[Local Debug] Network error in Logging Middleware:", error);
    }
};