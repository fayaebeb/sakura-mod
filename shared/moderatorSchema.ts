// schema/moderatorSchema.ts
import { pgTable, text, boolean, timestamp, serial, integer, foreignKey } from "drizzle-orm/pg-core";

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

export type Message = typeof messages.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;