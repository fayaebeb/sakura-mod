import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import { processFile, storeInAstraDB, deleteFileFromAstraDB } from "./file-processor";
import { insertMessageSchema } from "@shared/schema";
import { DataAPIClient } from "@datastax/astra-db-ts";
import { ModeratorStorage } from "./ModeratorStorage";
const moderatorStorage = new ModeratorStorage();


// Langflow API configuration
const LANGFLOW_API = process.env.LANGFLOW_API || '';

const client = new DataAPIClient(process.env.ASTRA_API_TOKEN || '');
const db = client.db(process.env.ASTRA_DB_URL || '');

function formatBotResponse(text: string): string {
  return text.replace(/\\n/g, '\n').trim();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024 * 1024, // 1GB limit
  },
  fileFilter: (req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, true);
  }
});


export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // File Upload Endpoint
  app.post("/api/upload", upload.array('files', 10), async (req, res) => {
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
      "application/vnd.ms-excel"
    ];
    
    const userId = req.user!.id;
    const { sessionId } = req.body;
    
    // Process each file and track results
    const results = [];
    
    for (const file of files) {
      // Validate file type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        results.push({
          filename: file.originalname,
          success: false,
          error: `Unsupported file type: ${file.mimetype}`
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
        });
        
        results.push({
          filename: file.originalname,
          success: true,
          fileId: fileRecord.id
        });
        
        // Process file asynchronously
        processFile(file, sessionId)
          .then(async () => {
            try {
              await storage.updateFileStatus(fileRecord.id, "completed");
              await storage.createMessage(userId, {
                content: `File processed successfully: ${file.originalname}`,
                isBot: true,
                sessionId,
                fileId: fileRecord.id,
              });
            } catch (storeError) {
              console.error("Error storing in AstraDB:", storeError);
              await storage.updateFileStatus(fileRecord.id, "completed");
              await storage.createMessage(userId, {
                content: `File processed but storage in AstraDB failed: ${file.originalname}`,
                isBot: true,
                sessionId,
                fileId: fileRecord.id,
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
            });
          });
      } catch (error) {
        console.error("Error creating file record:", error);
        results.push({
          filename: file.originalname,
          success: false,
          error: "Failed to create file record"
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

    const body = result.data;

    try {
      await storage.createMessage(req.user!.id, {
        content: body.content,
        isBot: false,
        sessionId: persistentSessionId,
      });

      console.log(`Sending request to Langflow API: ${body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          Authorization: process.env.AUTHORIZATION_TOKEN || '',
                "Content-Type": "application/json",
                "x-api-key": process.env.X_API_KEY || '',
        },
        body: JSON.stringify({
          input_value: body.content,
          output_type: "chat",
          input_type: "chat",
          tweaks: {
            " TextInput-Q9wOc": {
              input_value: persistentSessionId,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Langflow API Error:", errorText);
        throw new Error(`Langflow API responded with status ${response.status}`);
      }

      const aiResponse = await response.json();
      console.log("Langflow API Response:", JSON.stringify(aiResponse, null, 2));

      let aiOutputText = null;

      if (aiResponse.outputs && Array.isArray(aiResponse.outputs)) {
        const firstOutput = aiResponse.outputs[0];
        if (firstOutput?.outputs?.[0]?.results?.message?.data?.text) {
          aiOutputText = firstOutput.outputs[0].results.message.data.text;
        } else if (firstOutput?.outputs?.[0]?.messages?.[0]?.message) {
          aiOutputText = firstOutput.outputs[0].messages[0].message;
        }
      }

      if (!aiOutputText) {
        console.error("Unexpected AI Response Format:", JSON.stringify(aiResponse, null, 2));
        throw new Error("Could not extract message from AI response");
      }

      const formattedResponse = formatBotResponse(aiOutputText);

      const botMessage = await storage.createMessage(req.user!.id, {
        content: formattedResponse,
        isBot: true,
        sessionId: persistentSessionId,
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

  app.get("/api/messages/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const persistentSessionId = req.user!.username.split('@')[0];
      const messages = await storage.getMessagesByUserAndSession(
        req.user!.id,
        persistentSessionId
      );
      res.json(messages);
    } catch (error) {
      console.error("Error retrieving messages:", error);
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
      if (message.userId !== req.user!.id) {
        return res.status(403).json({ error: "Permission denied" });
      }

      // If it's a bot message, check for AstraDB content to delete
      if (message.isBot) {
        // Extract MSGID from content using the correct format
        const msgIdMatch = message.content.match(/MSGID:\s*([a-f0-9-]+)/i);
        console.log("Extracted MSGID:", msgIdMatch ? msgIdMatch[1] : "Not found");

        if (msgIdMatch) {
          const astraMessageId = msgIdMatch[1];
          try {
            // Delete from AstraDB with proper metadata field
          await db.collection("files").deleteMany({
              "metadata.msgid": astraMessageId
            });
            console.log(`Successfully deleted message with MSGID ${astraMessageId} from AstraDB`);
          } catch (astraError) {
            console.error("Error deleting from AstraDB:", astraError);
            // Continue with local deletion even if AstraDB deletion fails
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
      // Check if file exists and user has permission
      const file = await storage.getFile(fileId);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Verify file ownership
      //if (file.userId !== req.user!.id) {
      //  return res.status(403).json({ error: "Permission denied" });
      //}

      // First delete the vector data from AstraDB
      try {
        await deleteFileFromAstraDB(file.filename);
      } catch (astraError) {
        console.error("Error deleting from AstraDB:", astraError);
        // Continue with PostgreSQL deletion even if AstraDB deletion fails
      }

      // Then delete from PostgreSQL
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

  const httpServer = createServer(app);
  return httpServer;
}
