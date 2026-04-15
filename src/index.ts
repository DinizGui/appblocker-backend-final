import { createApp } from "./app.js";
import { config } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";

async function warmupDatabase() {
  // Forces early failure (and clear logs) if DB/tables aren't ready on deploy.
  await prisma.user.count();
}

async function main() {
  const app = createApp();

  try {
    await warmupDatabase();
    console.log("[BOOT] Database ready");
  } catch (e) {
    console.error("[BOOT] Database not ready", e);
    process.exit(1);
  }

  // 0.0.0.0 = aceita conexões do celular/emulador na rede (não só localhost)
  const host = process.env.HOST || "0.0.0.0";
  app.listen(config.port, host, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error("[BOOT] Fatal startup error", e);
  process.exit(1);
});
