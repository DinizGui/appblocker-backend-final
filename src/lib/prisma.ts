import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

function normalizeDatabaseUrl(raw: string | undefined): string {
  if (!raw || raw === "undefined") return "";
  const firstLine = raw.split("\n")[0].trim();
  let value = firstLine;
  if (value.startsWith("DATABASE_URL=")) {
    value = value.slice("DATABASE_URL=".length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
  }
  return value.trim();
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
if (!databaseUrl || !databaseUrl.startsWith("file:")) {
  throw new Error(
    'DATABASE_URL is not set or invalid. Set DATABASE_URL to a SQLite URL (e.g. DATABASE_URL="file:./dev.db").'
  );
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

export const prisma = new PrismaClient({ adapter });
