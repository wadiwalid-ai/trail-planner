import {
  type User,
  type InsertUser,
  type AdminAuditLog,
  type InsertAdminAuditLog,
  users,
  adminAuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, count, ilike, asc, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined>;
  countAdmins(): Promise<number>;
  searchUsers(query: string, limit?: number): Promise<User[]>;
  recordAdminAudit(entry: InsertAdminAuditLog): Promise<AdminAuditLog>;
  listAdminAudit(limit?: number): Promise<AdminAuditLog[]>;
}

// Database-backed user storage (replaces the previous in-memory store so that
// accounts persist across restarts and are shared across all server instances).
export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async setUserAdmin(id: string, isAdmin: boolean): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isAdmin })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async countAdmins(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.isAdmin, true));
    return row?.value ?? 0;
  }

  // Admin account browser: return accounts ordered by username, optionally
  // filtered by a case-insensitive substring match. An empty/whitespace query
  // returns the first `limit` accounts so an admin can browse without searching.
  async searchUsers(query: string, limit = 50): Promise<User[]> {
    const trimmed = query.trim();
    const base = db.select().from(users);
    const rows = trimmed
      ? await base
          .where(ilike(users.username, `%${trimmed}%`))
          .orderBy(asc(users.username))
          .limit(limit)
      : await base.orderBy(asc(users.username)).limit(limit);
    return rows;
  }

  // Append an immutable audit entry for an admin-power change. Callers snapshot
  // the acting/target usernames so the record stays readable independent of the
  // users table.
  async recordAdminAudit(entry: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [row] = await db.insert(adminAuditLog).values(entry).returning();
    return row;
  }

  // Most-recent-first history of admin-power changes for the review screen.
  async listAdminAudit(limit = 50): Promise<AdminAuditLog[]> {
    return db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(limit);
  }
}

export const storage = new DbStorage();
