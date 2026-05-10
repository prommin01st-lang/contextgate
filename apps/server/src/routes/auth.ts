import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SignJWT } from "jose";
import bcryptjs from "bcryptjs";
import { db } from "@contextgate/core";
import { users } from "@contextgate/core";
import { eq } from "drizzle-orm";

const authRoutes = new Hono();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "contextgate-dev-secret-change-in-production"
);

async function createToken(userId: string, role: string): Promise<string> {
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(255).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// REGISTER
authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const body = c.req.valid("json");

  const existing = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = bcryptjs.hashSync(body.password, 10);

  const result = await db
    .insert(users)
    .values({
      email: body.email,
      passwordHash,
      name: body.name ?? null,
    })
    .returning();

  const user = result[0];
  const token = await createToken(user.id, user.role);

  return c.json(
    {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    },
    201
  );
});

// LOGIN
authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");

  const results = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
  if (results.length === 0) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const user = results[0];
  const valid = bcryptjs.compareSync(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = await createToken(user.id, user.role);

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

export { authRoutes };
