
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhYTM1NDRAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwMDI0NywiaWF0IjoxNzc3Njk5MzQ3LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiMDIyMDA4ODMtZTI4ZS00MzVjLWI0YjYtZWVmMGUxYTNhOTM5IiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiYWJoaW5hdiBhbmlsIiwic3ViIjoiYmEzMzFjMTAtMDc5OS00NDkxLTg3NWUtMTBjYzU3NzdmYjQwIn0sImVtYWlsIjoiYWEzNTQ0QHNybWlzdC5lZHUuaW4iLCJuYW1lIjoiYWJoaW5hdiBhbmlsIiwicm9sbE5vIjoicmEyMzExMDAzMDIwNTU4IiwiYWNjZXNzQ29kZSI6IlFrYnB4SCIsImNsaWVudElEIjoiYmEzMzFjMTAtMDc5OS00NDkxLTg3NWUtMTBjYzU3NzdmYjQwIiwiY2xpZW50U2VjcmV0IjoieUJOeWtSdm1VdlZXUE1WYSJ9.0GSlr_ECU-TRsfxwKvQvTpMTyQizK_x7AbovxEIgGWE";
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