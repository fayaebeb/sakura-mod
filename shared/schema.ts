import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ✅ **Users Table**
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(true), // Set to true by default for all users
});

// ✅ **Invite Tokens Table**
export const inviteTokens = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  createdById: integer("created_by_id")
    .references(() => users.id),
  usedById: integer("used_by_id")
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
  isValid: boolean("is_valid").notNull().default(true),
});

// ✅ **Sessions Table**
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  sessionId: text("session_id").notNull(), // ✅ Ensure it's unique
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ✅ **Files Table (Now Stores Extracted Text)**
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull().default("processing"), // processing, completed, error
  createdAt: timestamp("created_at").defaultNow().notNull(),
  vectorizedContent: text("vectorized_content"), // ✅ Stores extracted text from OpenAI
  dbid: text("dbid"),
});

// ✅ **Messages Table**
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  isBot: boolean("is_bot").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sessionId: text("session_id").notNull().references(() => sessions.id), // ✅ Now references `sessions.sessionId`
  fileId: integer("file_id").references(() => files.id),
  dbid: text("dbid"),
});

// ✅ **Schemas for Input Validation**
// Add password validation to the insert schema
export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true
  })
  .extend({
    password: z.string().min(6, "パスワードは6文字以上でなければなりません"),
    inviteToken: z.string().min(1, "招待トークンが必要です").optional(),
    isAdmin: z.boolean().default(true).optional() // All users are treated as admins by default
  });

// Login schema (doesn't need invite token)
export const loginSchema = z.object({
  username: z.string().email("有効なメールアドレスを入力してください"),
  password: z.string().min(1, "パスワードを入力してください"),
});

// Schema for invite tokens
export const insertInviteTokenSchema = createInsertSchema(inviteTokens)
  .pick({
    token: true,
    createdById: true,
  });

export const insertSessionSchema = createInsertSchema(sessions).pick({
  userId: true,
  sessionId: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  content: true,
  isBot: true,
  sessionId: true,
  fileId: true,
  dbid: true,
});

export const insertFileSchema = createInsertSchema(files).pick({
  filename: true,
  originalName: true,
  contentType: true,
  size: true,
  sessionId: true,
  status: true,
  vectorizedContent: true, // ✅ Now supports storing extracted text
  dbid: true,
});

// ✅ **Type Definitions**
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type InsertInviteToken = z.infer<typeof insertInviteTokenSchema>;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;