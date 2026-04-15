import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "../lib/prisma.js";
import { createToken } from "../lib/auth.js";
import { asyncHandler } from "../lib/async.js";
import { config } from "../lib/config.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const userSelect = {
  id: true,
  name: true,
  handle: true,
  email: true,
  plan: true,
  photo: true,
  notificationsEnabled: true,
  dailyGoalMinutes: true,
  language: true,
  createdAt: true,
  updatedAt: true
};

function makeHandle(name: string, email: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const fallback = email.split("@")[0]?.toLowerCase() || "user";
  return "@" + (base || fallback).slice(0, 20);
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const handle = makeHandle(data.name, email);

    const user = await prisma.user.create({
      data: {
        name: data.name.trim(),
        handle,
        email,
        passwordHash,
        plan: "Premium (Annual)",
        notificationsEnabled: true,
        dailyGoalMinutes: 240,
        language: "pt-BR",
        timerSettings: {
          create: {}
        },
        projects: {
          createMany: {
            data: [
              { name: "Trabalho" },
              { name: "Estudos" },
              { name: "Pessoal" },
              { name: "Outro" }
            ]
          }
        }
      },
      select: userSelect
    });

    const token = createToken(user.id);
    res.status(201).json({ token, user });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const email = data.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = createToken(user.id);
    const safeUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: userSelect
    });

    res.json({ token, user: safeUser });
  })
);

const googleAuthSchema = z.object({
  idToken: z.string().min(1, "idToken é obrigatório"),
});

router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const { idToken } = googleAuthSchema.parse(req.body);

    if (!config.googleClientId) {
      return res.status(503).json({ error: "Google login not configured" });
    }

    const client = new OAuth2Client(config.googleClientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(400).json({ error: "Invalid Google token" });
    }

    const googleId = payload.sub;
    const email = payload.email.trim().toLowerCase();
    const name = payload.name?.trim() || payload.email.split("@")[0] || "Usuário";
    const picture = payload.picture ?? null;

    const handle = makeHandle(name, email);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    let user: { id: string; name: string; handle: string; email: string; plan: string; photo: string | null; notificationsEnabled: boolean; dailyGoalMinutes: number; language: string; createdAt: Date; updatedAt: Date };
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { googleId, name, photo: picture, updatedAt: new Date() },
      });
      const updated = await prisma.user.findUnique({
        where: { id: existing.id },
        select: userSelect,
      });
      if (!updated) throw new Error("User not found after update");
      user = updated;
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          name,
          handle,
          googleId,
          photo: picture,
          passwordHash: null,
          plan: "Premium (Annual)",
          notificationsEnabled: true,
          dailyGoalMinutes: 240,
          language: "pt-BR",
          timerSettings: { create: {} },
          projects: {
            createMany: {
              data: [
                { name: "Trabalho" },
                { name: "Estudos" },
                { name: "Pessoal" },
                { name: "Outro" },
              ],
            },
          },
        },
        select: userSelect,
      });
      user = created;
    }

    const token = createToken(user.id);
    res.json({ token, user });
  })
);

const appleAuthSchema = z.object({
  identityToken: z.string().min(1, "identityToken é obrigatório"),
});

const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

router.post(
  "/apple",
  asyncHandler(async (req, res) => {
    const { identityToken } = appleAuthSchema.parse(req.body);

    let payload: Record<string, unknown>;
    try {
      const verified = await jwtVerify(identityToken, appleJwks, {
        issuer: "https://appleid.apple.com",
        audience: config.appleAudience,
      });
      payload = verified.payload as unknown as Record<string, unknown>;
    } catch {
      return res.status(400).json({ error: "Invalid Apple token" });
    }

    const appleId = typeof payload.sub === "string" ? payload.sub : "";
    const emailRaw = typeof payload.email === "string" ? payload.email : "";
    const email = emailRaw.trim().toLowerCase();

    if (!appleId) return res.status(400).json({ error: "Invalid Apple token" });
    if (!email) return res.status(400).json({ error: "Apple token missing email" });

    const name =
      (typeof payload.name === "string" && payload.name.trim()) ||
      email.split("@")[0] ||
      "Usuário";
    const handle = makeHandle(name, email);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ appleId }, { email }] },
    });

    let user: { id: string; name: string; handle: string; email: string; plan: string; photo: string | null; notificationsEnabled: boolean; dailyGoalMinutes: number; language: string; createdAt: Date; updatedAt: Date };
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { appleId, name, updatedAt: new Date() },
      });
      const updated = await prisma.user.findUnique({
        where: { id: existing.id },
        select: userSelect,
      });
      if (!updated) throw new Error("User not found after update");
      user = updated;
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          name,
          handle,
          appleId,
          passwordHash: null,
          plan: "Premium (Annual)",
          notificationsEnabled: true,
          dailyGoalMinutes: 240,
          language: "pt-BR",
          timerSettings: { create: {} },
          projects: {
            createMany: {
              data: [
                { name: "Trabalho" },
                { name: "Estudos" },
                { name: "Pessoal" },
                { name: "Outro" },
              ],
            },
          },
        },
        select: userSelect,
      });
      user = created;
    }

    const token = createToken(user.id);
    res.json({ token, user });
  })
);

export { router as authRouter };
