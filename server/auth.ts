import type { Request, Response, NextFunction } from "express";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { eq, lt } from "drizzle-orm";
import { db } from "./db";
import { users, sessions, type User } from "../shared/schema";

const scrypt = promisify(_scrypt);

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

// ── Password hashing (scrypt — built into Node, no extra deps) ────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashed] = stored.split(":");
  if (!salt || !hashed) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const hashedBuf = Buffer.from(hashed, "hex");
  if (hashedBuf.length !== derived.length) return false;
  return timingSafeEqual(hashedBuf, derived);
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function getUserForToken(token: string): Promise<User | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

/** Best-effort cleanup of expired sessions. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// ── Express integration ───────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      authToken?: string;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.header("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/** Attaches req.user when a valid token is present; never blocks. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (token) {
      const user = await getUserForToken(token);
      if (user) {
        req.user = user;
        req.authToken = token;
      }
    }
  } catch (err) {
    console.error("[auth] attachUser error:", err);
  }
  next();
}

/** Blocks the request with 401 unless a valid session is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Env-configured admin allowlist. Comma-separated usernames in ADMIN_USERNAMES
 * are treated as admins in addition to any user with the `isAdmin` DB flag. This
 * lets an operator bootstrap the first admin without direct DB access.
 */
function adminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_USERNAMES ?? "";
  return new Set(
    raw
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** True if the user is a DB-flagged admin or listed in ADMIN_USERNAMES. */
export function isAdminUser(user: User): boolean {
  if (user.isAdmin) return true;
  return adminAllowlist().has(user.username.toLowerCase());
}

/** True if at least one admin is configured via the ADMIN_USERNAMES allowlist. */
export function hasAllowlistAdmins(): boolean {
  return adminAllowlist().size > 0;
}

/**
 * Blocks the request with 401 (no session) or 403 (not an admin). Use for
 * privileged/destructive operations such as bulk OSM imports.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function publicUser(user: User) {
  return { id: user.id, username: user.username, isAdmin: isAdminUser(user) };
}
