import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ✅ **Users Table**
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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
});

// ✅ **Schemas for Input Validation**
// Add password validation to the insert schema
export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true
  })
  .extend({
    password: z.string().min(6, "パスワードは6文字以上でなければなりません")
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
});

export const insertFileSchema = createInsertSchema(files).pick({
  filename: true,
  originalName: true,
  contentType: true,
  size: true,
  sessionId: true,
  status: true,
  vectorizedContent: true, // ✅ Now supports storing extracted text
});

// ✅ **Type Definitions**
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
