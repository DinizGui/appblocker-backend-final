import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7: conexão vem do prisma.config.ts (não do schema.prisma).
// Use fallback para dev/CI quando DATABASE_URL não estiver definido.
const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl || env("DATABASE_URL"),
  },
  migrate: {
    datasource: "db",
  },
});
