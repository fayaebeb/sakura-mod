import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import {
  processFile,
  storeInAstraDB,
  deleteFileFromAstraDB,
} from "./file-processor";
import { insertMessageSchema } from "@shared/schema";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { ModeratorStorage } from "./ModeratorStorage";
import userAppInviteTokensRoute from "./api/user-app-invite-tokens";


const moderatorStorage = new ModeratorStorage();

const client = new DataAPIClient(process.env.ASTRA_API_TOKEN || "");
const db = client.db(process.env.ASTRA_DB_URL || "");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024 * 1024, // 1GB limit
  },
  fileFilter: (req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, "latin1").toString(
      "utf8",
    );
    cb(null, true);
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // File Upload Endpoint
  app.post("/api/upload", upload.array("files", 10), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    const userId = req.user!.id;
    const { sessionId, db } = req.body;

    // Process each file and track results
    const results = [];

    for (const file of files) {
      // Validate file type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        results.push({
          filename: file.originalname,
          success: false,
          error: `Unsupported file type: ${file.mimetype}`,
        });
        continue;
      }

      try {
        // Create file record
        const fileRecord = await storage.createFile(userId, {
          filename: file.originalname,
          originalName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          sessionId,
          status: "processing",
          dbid: db,
        });

        results.push({
          filename: file.originalname,
          success: true,
          fileId: fileRecord.id,
        });

        // Process file asynchronously
        processFile(file, sessionId, db)
          .then(async () => {
            try {
              await storage.updateFileStatus(fileRecord.id, "completed");
              await storage.createMessage(userId, {
                content: `File processed successfully: ${file.originalname}`,
                isBot: true,
                sessionId,
                fileId: fileRecord.id,
                dbid: db,
              });
            } catch (storeError) {
              console.error("Error storing in AstraDB:", storeError);
              await storage.updateFileStatus(fileRecord.id, "completed");
              await storage.createMessage(userId, {
                content: `File processed but storage in AstraDB failed: ${file.originalname}`,
                isBot: true,
                sessionId,
                fileId: fileRecord.id,
                dbid: db,
              });
            }
          })
          .catch(async (error) => {
            console.error("Error processing file:", error);
            await storage.updateFileStatus(fileRecord.id, "error");
            await storage.createMessage(userId, {
              content: `Error processing file ${file.originalname}: ${error.message || "Unknown error"}`,
              isBot: true,
              sessionId,
              fileId: fileRecord.id,
              dbid: db,
            });
          });
      } catch (error) {
        console.error("Error creating file record:", error);
        results.push({
          filename: file.originalname,
          success: false,
          error: "Failed to create file record",
        });
      }
    }

    // Return the results of all file uploads
    res.json({ files: results });
  });

  // Chat API Route
  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const persistentSessionId = req.user!.username.split("@")[0];

    const result = insertMessageSchema.safeParse(req.body);
    if (!result.success) {
      console.error("Invalid request body:", result.error);
      return res.status(400).json({ error: "Invalid request data" });
    }

    const { content, dbid } = result.data;

    try {
      // Save the user message to local DB
      await storage.createMessage(req.user!.id, {
        content: content,
        isBot: false,
        sessionId: persistentSessionId,
        dbid: dbid,
      });

      console.log(`Sending request to FastAPI: ${content}`);

      const response = await fetch(
        "https://skapi-qkrap.ondigitalocean.app/skmod",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: content,
            session_id: persistentSessionId,
            db: dbid,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("FastAPI Error:", errorText);
        throw new Error(`FastAPI responded with status ${response.status}`);
      }

      const apiResponse = await response.json();
      console.log("FastAPI Response:", JSON.stringify(apiResponse, null, 2));

      const formattedResponse = apiResponse.reply?.trim();

      if (!formattedResponse) {
        throw new Error("No 'reply' in FastAPI response");
      }

      // Save the bot message
      const botMessage = await storage.createMessage(req.user!.id, {
        content: formattedResponse,
        isBot: true,
        sessionId: persistentSessionId,
        dbid: dbid,
      });

      res.json(botMessage);
    } catch (error) {
      console.error("Error in chat processing:", error);
      res.status(500).json({
        message: "Failed to process message",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messages = await storage.getAllMessagesWithUsers();
      res.json(messages);
    } catch (error) {
      console.error("Error retrieving all messages:", error);
      res.status(500).json({
        message: "Failed to retrieve messages",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/files", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const allFiles = await storage.getAllFiles();
      res.json(allFiles);
    } catch (error) {
      console.error("Error retrieving file history:", error);
      res.status(500).json({
        message: "Failed to retrieve file history",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add new DELETE endpoint for messages
  app.delete("/api/messages/:messageId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const messageId = parseInt(req.params.messageId);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    try {
      // Get the message to check if it's a bot message and get the message ID
      const message = await storage.getMessage(messageId);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Check if this message belongs to the authenticated user
      /*if (message.userId !== req.user!.id) {
        return res.status(403).json({ error: "Permission denied" });
      }*/

      // If it's a bot message, check for AstraDB content to delete
      if (message.isBot) {
        const msgIdMatch = message.content.match(/MSGID:\s*([a-f0-9-]+)/i);
        console.log(
          "Extracted MSGID:",
          msgIdMatch ? msgIdMatch[1] : "Not found",
        );

        if (msgIdMatch) {
          const astraMessageId = msgIdMatch[1];
          const dbid = message.dbid;

          const validDbids = ["files", "ktdb", "ibt"] as const;

          if (dbid && validDbids.includes(dbid as any)) {
            try {
              await db.collection(dbid).deleteMany({
                "metadata.msgid": astraMessageId,
              });
              console.log(
                `✅ Successfully deleted message with MSGID ${astraMessageId} from '${dbid}' collection`,
              );
            } catch (astraError) {
              console.error("❌ Error deleting from AstraDB:", astraError);
            }
          } else {
            console.warn(
              `⚠️ No valid dbid found for message. Skipping AstraDB deletion.`,
            );
          }
        } else {
          console.log("No MSGID found in message content:", message.content);
        }
      }

      // Delete from local database
      const deletedMessage = await storage.deleteMessage(messageId);
      console.log(`Successfully deleted message ${messageId} from PostgreSQL`);

      res.json(deletedMessage);
    } catch (error) {
      console.error("Error deleting message:", error);
      res.status(500).json({
        message: "Failed to delete message",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Add new DELETE endpoint for files
  app.delete("/api/files/:fileId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const fileId = parseInt(req.params.fileId);
    if (isNaN(fileId)) {
      return res.status(400).json({ error: "Invalid file ID" });
    }

    try {
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      try {
        if (file.dbid === null) {
          console.warn(
            `⚠️ File ${file.filename} has no dbid. Skipping AstraDB deletion.`,
          );
        } else if (["files", "ktdb", "ibt"].includes(file.dbid)) {
          await deleteFileFromAstraDB(
            file.filename,
            file.dbid as "files" | "ktdb" | "ibt",
          );
        } else {
          console.warn(
            `⚠️ Unrecognized dbid '${file.dbid}' for file ${file.filename}`,
          );
        }
      } catch (astraError) {
        console.error("Error deleting from AstraDB:", astraError);
      }

      const deletedFile = await storage.deleteFile(fileId);
      res.json(deletedFile);
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({
        message: "Failed to delete file",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all unique session IDs for the moderator dashboard
  app.get("/api/moderator/sessions", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const sessionIds = await moderatorStorage.getAllSessionIds();
      res.json(sessionIds);
    } catch (error) {
      console.error("Error retrieving session IDs:", error);
      res.status(500).json({
        message: "Failed to retrieve session IDs",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/moderator/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { category } = req.query;

      let allMessages = await moderatorStorage.getAllMessages();

      if (category && category !== "ALL") {
        allMessages = allMessages.filter((msg) => msg.category === category);
      }

      res.json(allMessages);
    } catch (error) {
      console.error("Error retrieving all messages:", error);
      res.status(500).json({
        message: "Failed to retrieve all messages",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all messages for a specific session ID
  app.get("/api/moderator/messages/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const sessionId = req.params.sessionId;
      const messages = await moderatorStorage.getMessagesBySessionId(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Error retrieving messages for session:", error);
      res.status(500).json({
        message: "Failed to retrieve messages for session",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all feedback entries
  app.get("/api/moderator/feedback", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const feedback = await moderatorStorage.getAllFeedback();
      res.json(feedback);
    } catch (error) {
      console.error("Error retrieving feedback entries:", error);
      res.status(500).json({
        message: "Failed to retrieve feedback entries",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get feedback for a specific session
  app.get("/api/moderator/feedback/session/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const sessionId = req.params.sessionId;
      const feedback = await moderatorStorage.getFeedbackBySessionId(sessionId);
      res.json(feedback);
    } catch (error) {
      console.error("Error retrieving feedback for session:", error);
      res.status(500).json({
        message: "Failed to retrieve feedback for session",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get feedback for a specific user
  app.get("/api/moderator/feedback/user/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const userId = parseInt(req.params.userId, 10);
      const feedback = await moderatorStorage.getFeedbackByUserId(userId);
      res.json(feedback);
    } catch (error) {
      console.error("Error retrieving feedback for user:", error);
      res.status(500).json({
        message: "Failed to retrieve feedback for user",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Generate AI Summary of Feedback (OpenAI API)
  app.post("/api/moderator/feedback/summary", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { comments } = req.body;

    if (!Array.isArray(comments) || comments.length === 0) {
      return res.status(400).json({ error: "No comments provided" });
    }

    const inputText = comments.map((c: string) => `- ${c}`).join("\n");

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "summarize user feedback into concise insights in Japanese.",
            },
            {
              role: "user",
              content: `次のユーザーフィードバックコメントを要約してください:\n${inputText}`,
            },
          ],
          temperature: 1.0,
        }),
      });

      const data = await openaiRes.json();

      if (!data.choices || !data.choices[0]?.message?.content) {
        throw new Error("Invalid OpenAI response");
      }

      res.json({ summary: data.choices[0].message.content });
    } catch (err) {
      console.error("Error generating summary:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  app.use("/api/user-app-invite-tokens", userAppInviteTokensRoute);

  const httpServer = createServer(app);
  return httpServer;
}