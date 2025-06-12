//server/ModeratorStorage.ts

import { eq, desc } from "drizzle-orm";
import { moderatorDb } from "./moderatorDb";
import {
  messages,
  feedback,
  inviteTokens,
  type Message,
  type Feedback,
  type InviteToken,
} from "@shared/moderatorSchema";
import { randomBytes } from "crypto";

export class ModeratorStorage {
  // ─── Session / Messages ────────────────────────────

  async getAllSessionIds(): Promise<string[]> {
    const results = await moderatorDb
      .select({ sessionId: messages.sessionId })
      .from(messages)
      .groupBy(messages.sessionId)
      .orderBy(messages.sessionId);

    return results
      .map((row) => row.sessionId)
      .filter((id): id is string => id !== null);
  }

  async getAllMessages(): Promise<Message[]> {
    return await moderatorDb
      .select()
      .from(messages)
      .orderBy(messages.timestamp);
  }

  async getMessagesBySessionId(sessionId: string): Promise<Message[]> {
    return await moderatorDb
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.timestamp);
  }

  // ─── Feedback ──────────────────────────────────────

  async getAllFeedback(): Promise<Feedback[]> {
    return await moderatorDb
      .select()
      .from(feedback)
      .orderBy(feedback.createdAt);
  }

  async getFeedbackBySessionId(sessionId: string): Promise<Feedback[]> {
    return await moderatorDb
      .select()
      .from(feedback)
      .where(eq(feedback.sessionId, sessionId))
      .orderBy(feedback.createdAt);
  }

  async getFeedbackByUserId(userId: number): Promise<Feedback[]> {
    return await moderatorDb
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(feedback.createdAt);
  }

  // ─── Invite Tokens ─────────────────────────────────

  async getUserAppInviteTokens(): Promise<InviteToken[]> {
    return await moderatorDb
      .select()
      .from(inviteTokens)
      .where(eq(inviteTokens.isValid, true))
      .orderBy(desc(inviteTokens.createdAt));
  }

  async createUserAppInviteToken(createdById: number): Promise<InviteToken> {
    const tokenString = randomBytes(32).toString("hex");
    const [newToken] = await moderatorDb
      .insert(inviteTokens)
      .values({
        token: tokenString,
        createdById,
        isValid: true,
      })
      .returning();
    return newToken;
  }
}