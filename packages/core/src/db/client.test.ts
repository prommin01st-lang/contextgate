import { pool } from "./client";

// Basic connection test — run manually or with a test runner when available
export async function testConnection(): Promise<void> {
  const result = await pool.query("SELECT 1");
  if (!result || !result.rows.length) {
    throw new Error("Database connection test failed");
  }
  console.log("✅ DB connection OK:", result.rows[0]);
}

// If using vitest (or another test runner), uncomment below:
// import { describe, it, expect } from "vitest";
// describe("database client", () => {
//   it("should connect and run a basic query", async () => {
//     const result = await pool.query("SELECT 1");
//     expect(result).toBeTruthy();
//     expect(result.rows[0]["?column?"]).toBe(1);
//   });
// });

