// schema/moderatorSchema.ts
import { pgTable, text, boolean, timestamp, serial, integer } from "drizzle-orm/pg-core";

// ✅ Invite Tokens Table from User DB
export const inviteTokens = pgTable("invite_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  createdById: integer("created_by_moderator_id"), // foreign key in User DB, no need to resolve in Moderator App
  usedById: integer("used_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
  isValid: boolean("is_valid").default(true).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  isBot: boolean("is_bot"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sessionId: text("session_id"),
  category: text("category"),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionId: text("session_id"),
  comment: text("comment"),
  rating: integer("rating").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ✅ Types
export type InviteToken = typeof inviteTokens.$inferSelect;
export type InsertInviteToken = {
  token: string;
  createdById: number;
};
export type Message = typeof messages.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;