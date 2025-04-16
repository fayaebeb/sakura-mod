// schema/moderatorSchema.ts
import { pgTable, text, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content"),
  isBot: boolean("is_bot"),
  timestamp: timestamp("timestamp"),
  sessionId: text("session_id"),
});

export type Message = typeof messages.$inferSelect;