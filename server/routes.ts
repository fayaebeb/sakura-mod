import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertMessageSchema, insertFileSchema } from "@shared/schema";
import multer from "multer";
import { processFile, storeInAstraDB } from "./file-processor";

const LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/82a4b448-96ff-401d-99f4-809e966af016";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 5MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // File upload endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Validate file type
    const allowedMimeTypes = [
      'application/pdf',
      'text/plain',
      'application/json',
      'text/csv',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/html'
    ];
    
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, TXT, JSON, CSV, DOCX, HTML` 
      });
    }

    const userId = req.user!.id;
    const { sessionId } = req.body;

    try {
      // Create file record in database
      const fileRecord = await storage.createFile(userId, {
        filename: req.file.originalname, // Use originalname from multer
        originalName: req.file.originalname, // Add originalName field
        contentType: req.file.mimetype,
        size: req.file.size, // Add file size
        sessionId,
        status: 'processing',
      });

      // Process the file in the background
      processFile(req.file, sessionId)
        .then(async ({ chunks, metadata }) => {
          try {
            // Store chunks in AstraDB
            await storeInAstraDB(chunks, metadata);

            // Update file status to completed
            await storage.updateFileStatus(fileRecord.id, 'completed');

            // Create a message about the successful file processing
            await storage.createMessage(userId, {
              content: `File processed: ${req.file!.originalname}\nChunks created: ${chunks.length}`,
              isBot: true,
              sessionId,
              fileId: fileRecord.id,
            });
          } catch (storeError) {
            console.error('Error storing in AstraDB:', storeError);
            // Even if AstraDB storage fails, we still extracted text successfully
            await storage.updateFileStatus(fileRecord.id, 'completed');
            await storage.createMessage(userId, {
              content: `File processed but storage failed: ${req.file!.originalname}. Some content may be unavailable.`,
              isBot: true,
              sessionId,
              fileId: fileRecord.id,
            });
          }
        })
        .catch(async (error) => {
          console.error('Error processing file:', error);
          await storage.updateFileStatus(fileRecord.id, 'error');
          await storage.createMessage(userId, {
            content: `Error processing file ${req.file!.originalname}: ${error.message || 'Unknown error'}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id,
          });
        });

      // Respond immediately with the file record
      res.json(fileRecord);
    } catch (error) {
      console.error('Error handling file upload:', error);
      res.status(500).json({
        message: "Failed to process file upload",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    // Extract persistent sessionId from user's email
    const persistentSessionId = req.user!.username.split('@')[0];

    // Validate request data
    const result = insertMessageSchema.safeParse(req.body);
    if (!result.success) {
      console.error("Invalid request body:", result.error);
      return res.status(400).json({ error: "Invalid request data" });
    }

    const body = result.data;

    try {
      // Store user message with persistent sessionId
      await storage.createMessage(req.user!.id, {
        ...body,
        isBot: false,
        sessionId: persistentSessionId,
      });

      // Call Langflow API
      console.log(`Sending request to Langflow API: ${body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "x-api-key": "sk-13QT6ba04gaVTNsrhPH5ib41keBRLQtBNPY2O4E_dVk",
        },
        body: JSON.stringify({
          input_value: body.content,
          output_type: "chat",
          input_type: "chat",
          tweaks: {
            
            
            "TextInput-BinzV": {
              "input_value": persistentSessionId,
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

      // Store bot message with persistent sessionId
      const botMessage = await storage.createMessage(req.user!.id, {
        content: aiOutputText,
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
      // Use the persistent sessionId from user's email
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

  const httpServer = createServer(app);
  return httpServer;
}
