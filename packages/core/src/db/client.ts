import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:Tong042772314.@localhost:5432/mcp_gateway";

export const pool = new Pool({ connectionString });

export const db = drizzle(pool);
