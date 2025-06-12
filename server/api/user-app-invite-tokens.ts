// server/api/user-app-invite-tokens.ts

import { ModeratorStorage } from "../ModeratorStorage";
import { authMiddleware } from "../auth";

const storage = new ModeratorStorage();

export default authMiddleware(async (req, res, user) => {
  if (req.method === "GET") {
    try {
      const tokens = await storage.getUserAppInviteTokens();
      return res.status(200).json(tokens);
    } catch (error) {
      console.error("[INVITE TOKEN GET ERROR]", error);
      return res.status(500).json({ error: "Failed to fetch invite tokens" });
    }
  }

  if (req.method === "POST") {
    try {
      const token = await storage.createUserAppInviteToken(user.id);
      return res.status(200).json(token);
    } catch (error) {
      console.error("[INVITE TOKEN CREATE ERROR]", error);
      return res.status(500).json({ error: "Failed to create invite token" });
    }
  }

  return res.status(405).end(); // Method Not Allowed
});
