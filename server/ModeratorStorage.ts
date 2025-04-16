import { eq } from "drizzle-orm";
import { moderatorDb } from "./moderatorDb";
import { messages, type Message } from "@shared/moderatorSchema";

export class ModeratorStorage {
  /**
   * Retrieves all unique session IDs from the messages table.
   * This is used to populate the moderator dashboard session list.
   */
  async getAllSessionIds(): Promise<string[]> {
    const results = await moderatorDb
      .select({ sessionId: messages.sessionId })
      .from(messages)
      .groupBy(messages.sessionId)
      .orderBy(messages.sessionId);

    return results
    .map(row => row.sessionId)
    .filter((id): id is string => id !== null);

  }

  /**
   * Retrieves all messages for a specific session ID, ordered by timestamp.
   * This enables moderators to view the full chronological history of a session.
   * 
   * @param sessionId - The session ID for which to fetch messages.
   */
  async getMessagesBySessionId(sessionId: string): Promise<Message[]> {
    return await moderatorDb
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.timestamp);
  }
}