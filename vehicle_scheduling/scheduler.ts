import { Log } from '../logging_middleware/logger';
import * as dotenv from 'dotenv';
dotenv.config();
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const BASE_URL = "http://20.207.122.201/evaluation-service";

interface Depot {
    ID: number;
    MechanicHours: number;
}

interface Vehicle {
    TaskID: string;
    Duration: number;
    Impact: number;
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ACCESS_TOKEN}`
};

// 1. Fetch Depots
async function getDepots(): Promise<Depot[]> {
    try {
        const response = await fetch(`${BASE_URL}/depots`, { headers });
        const data: any = await response.json();
        if (!response.ok) {
            console.error("DEPOT API ERROR:", data);
            return [];
        }
        await Log("backend", "info", "service", "Successfully fetched depots data.");
        return data.depots;
    } catch (error) {
        await Log("backend", "error", "service", "Failed to fetch depots data.");
        return [];
    }
}

// 2. Fetch Vehicles
async function getVehicles(): Promise<Vehicle[]> {
    try {
        const response = await fetch(`${BASE_URL}/vehicles`, { headers });
        const data: any = await response.json();
        if (!response.ok) {
            console.error("DEPOT API ERROR:", data);
            return [];
        }
        await Log("backend", "info", "service", "Successfully fetched vehicles data.");
        return data.vehicles;
    } catch (error) {
        await Log("backend", "error", "service", "Failed to fetch vehicles data.");
        return [];
    }
}

// 3. The 0/1 Knapsack Algorithm
function optimizeSchedule(budget: number, vehicles: Vehicle[]) {
    const n = vehicles.length;
    // Create a 2D array for Dynamic Programming
    const dp: number[][] = Array(n + 1).fill(0).map(() => Array(budget + 1).fill(0));

    // Build the DP table
    for (let i = 1; i <= n; i++) {
        const v = vehicles[i - 1];
        for (let w = 0; w <= budget; w++) {
            if (v.Duration <= w) {
                dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - v.Duration] + v.Impact);
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }

    // Backtrack to find exactly WHICH vehicles were selected
    let maxImpact = dp[n][budget];
    let currentCapacity = budget;
    const selectedTaskIDs: string[] = [];
    let totalTimeUsed = 0;

    for (let i = n; i > 0 && maxImpact > 0; i--) {
        // If the value came from the row above, we didn't include this item
        if (maxImpact === dp[i - 1][currentCapacity]) {
            continue;
        } else {
            // We included this item
            const v = vehicles[i - 1];
            selectedTaskIDs.push(v.TaskID);
            maxImpact -= v.Impact;
            currentCapacity -= v.Duration;
            totalTimeUsed += v.Duration;
        }
    }

    return {
        maxImpact: dp[n][budget],
        totalTimeUsed,
        tasks: selectedTaskIDs
    };
}

// 4. Main Execution function
async function runScheduler() {
    console.log("Starting Vehicle Maintenance Scheduler...");
    await Log("backend", "info", "service", "Initializing Vehicle Maintenance Scheduler process.");

    const depots = await getDepots();
    const vehicles = await getVehicles();

    if (!depots.length || !vehicles.length) {
        console.error("Missing data, cannot proceed.");
        return;
    }

    console.log(`\nFound ${depots.length} depots and ${vehicles.length} tasks. Processing...\n`);

    // Process each depot
    for (const depot of depots) {
        const result = optimizeSchedule(depot.MechanicHours, vehicles);

        console.log(`--- Depot ID: ${depot.ID} ---`);
        console.log(`Budgeted Hours: ${depot.MechanicHours}`);
        console.log(`Max Impact Achieved: ${result.maxImpact}`);
        console.log(`Total Hours Used: ${result.totalTimeUsed}`);
        console.log(`Selected Task IDs (${result.tasks.length} tasks):`);
        console.dir(result.tasks, { maxArrayLength: null }); // Prints all IDs clearly
        console.log("-----------------------\n");

        await Log("backend", "info", "service", `Calculated optimal schedule for Depot ${depot.ID}. Max Impact: ${result.maxImpact}`);
    }

    console.log("Scheduling complete!");
    await Log("backend", "info", "service", "Vehicle Maintenance Scheduler process completed successfully.");
}

// Execute
runScheduler();