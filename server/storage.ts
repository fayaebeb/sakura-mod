import { users, messages, sessions, files, type User, type InsertUser, type Message, type InsertMessage, type Session, type File, type InsertFile } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getMessagesByUserAndSession(userId: number, sessionId: string): Promise<Message[]>;
  createMessage(userId: number, message: InsertMessage): Promise<Message>;
  getUserLastSession(userId: number): Promise<Session | undefined>;
  createUserSession(userId: number, sessionId: string): Promise<Session>;
  createFile(userId: number, file: InsertFile): Promise<File>;
  getFile(id: number): Promise<File | undefined>;
  updateFileStatus(id: number, status: string): Promise<File>;
  getFilesByUserId(userId: number): Promise<File[]>;
  getAllFiles(): Promise<(File & { user: { username: string } | null })[]>; // Add method to get all files
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getMessagesByUserAndSession(userId: number, sessionId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          eq(messages.sessionId, sessionId)
        )
      )
      .orderBy(messages.timestamp);
  }

  async createMessage(userId: number, message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        userId,
        ...message,
      })
      .returning();
    return newMessage;
  }

  async getUserLastSession(userId: number): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return session;
  }

  async createUserSession(userId: number, sessionId: string): Promise<Session> {
    const [session] = await db
      .insert(sessions)
      .values({
        userId,
        sessionId,
      })
      .returning();
    return session;
  }

  async createFile(userId: number, file: InsertFile): Promise<File> {
    const [newFile] = await db
      .insert(files)
      .values({
        userId,
        ...file,
      })
      .returning();
    return newFile;
  }

  async getFile(id: number): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }

  async updateFileStatus(id: number, status: string): Promise<File> {
    const [updatedFile] = await db
      .update(files)
      .set({ status })
      .where(eq(files.id, id))
      .returning();
    return updatedFile;
  }

  // Added method to get all files for a user
  async getFilesByUserId(userId: number): Promise<File[]> {
    return await db
      .select()
      .from(files)
      .where(eq(files.userId, userId))
      .orderBy(desc(files.createdAt));
  }

  // Method to get all files regardless of user with user info
  async getAllFiles(): Promise<(File & { user: { username: string } | null })[]> {
    const results = await db
      .select({
        id: files.id,
        status: files.status,
        userId: files.userId,
        sessionId: files.sessionId,
        createdAt: files.createdAt,
        filename: files.filename,
        originalName: files.originalName,
        contentType: files.contentType,
        size: files.size,
        vectorizedContent: files.vectorizedContent,
        user_username: users.username,  // Select username separately
      })
      .from(files)
      .leftJoin(users, eq(files.userId, users.id))
      .orderBy(desc(files.createdAt));

    // Transform results to match the expected type
    return results.map(row => ({
      id: row.id,
      status: row.status,
      userId: row.userId,
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      filename: row.filename,
      originalName: row.originalName,
      contentType: row.contentType,
      size: row.size,
      vectorizedContent: row.vectorizedContent,
      user: row.user_username ? { username: row.user_username } : null
    }));
}
}



export const storage = new DatabaseStorage();