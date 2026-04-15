import "dotenv/config";

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: numberFromEnv("PORT", 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  googleClientId: process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
  /** Audience esperado no `identityToken` da Apple (normalmente o bundle id iOS / service id). */
  appleAudience: process.env.APPLE_AUDIENCE || process.env.APPLE_CLIENT_ID || "com.appblock",
};
