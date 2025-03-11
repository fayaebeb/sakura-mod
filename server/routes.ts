import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import { processFile, storeInAstraDB, deleteFileFromAstraDB } from "./file-processor";
import { insertMessageSchema } from "@shared/schema";

// Langflow API configuration
const LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/8cc3616d-0e44-4bd5-9aa3-7ae57e2a2d45";

// Helper function to format the bot's response
function formatBotResponse(text: string): string {
  return text
    .replace(/(###\s?)/g, "\n\n$1")
    .replace(/(。)(?![\n])/g, "。\n")
    .replace(/(！|？)(?![\n])/g, "$1\n")
    .replace(/\|\s+\|/g, "|")
    .replace(/\n\|/g, "\n")
    .replace(/\|\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Configure multer for memory storage (limit increased to 20MB)
// ✅ Fixed multer configuration with UTF-8 filename handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, true);
  }
});


export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // File Upload Endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, PPT, PPTX, DOCX, TXT`,
      });
    }

    const userId = req.user!.id;
    const { sessionId } = req.body;

    try {
      const fileRecord = await storage.createFile(userId, {
        filename: req.file.originalname,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        sessionId,
        status: "processing",
      });

      processFile(req.file, sessionId)
        .then(async () => {
          try {
            await storage.updateFileStatus(fileRecord.id, "completed");
            await storage.createMessage(userId, {
              content: `File processed successfully: ${req.file!.originalname}`,
              isBot: true,
              sessionId,
              fileId: fileRecord.id,
            });
          } catch (storeError) {
            console.error("Error storing in AstraDB:", storeError);
            await storage.updateFileStatus(fileRecord.id, "completed");
            await storage.createMessage(userId, {
              content: `File processed but storage in AstraDB failed: ${req.file!.originalname}`,
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
            content: `Error processing file ${req.file!.originalname}: ${error.message || "Unknown error"}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id,
          });
        });

      res.json(fileRecord);
    } catch (error) {
      console.error("Error handling file upload:", error);
      res.status(500).json({
        message: "Failed to process file upload",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
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
              Authorization: "Bearer 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",
                "Content-Type": "application/json",
                "x-api-key": "sk-k8wKMFfgyswK_0aEJgDbFdCF8vqDCTQRIGRCNpRLymw",
              },
              body: JSON.stringify({
                input_value: body.content,
                output_type: "chat",
                input_type: "chat",
                tweaks: {
                  "TextInput-KQO80": {
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
      if (file.userId !== req.user!.id) {
        return res.status(403).json({ error: "Permission denied" });
      }

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

  const httpServer = createServer(app);
  return httpServer;
}