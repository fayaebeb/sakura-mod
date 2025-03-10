import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import { processFile, storeInAstraDB } from "./file-processor";
import { insertMessageSchema } from "@shared/schema";

// Langflow API configuration
const LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/68380903-dcb9-4e45-a1d9-767ad716afaf";

// Helper function to format the bot's response
function formatBotResponse(text: string): string {
  return text
    // Ensure proper spacing for Markdown formatting
    .replace(/(###\s?)/g, "\n\n$1") // Add spacing before headings
    .replace(/(。)(?![\n])/g, "。\n") // Line break after sentences
    .replace(/(！|？)(?![\n])/g, "$1\n") // Line break after punctuation
    .replace(/\|\s+\|/g, "|") // Remove extra spaces in table pipes
    .replace(/\n\|/g, "\n") // Remove unnecessary leading pipes in new lines
    .replace(/\|\n/g, "\n") // Remove unnecessary trailing pipes in new lines
    .replace(/\n{3,}/g, "\n\n") // Clean up excessive newlines
    .trim();
}


// Configure multer for memory storage (limit increased to 20MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // ✅ **File Upload Endpoint**
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // ✅ **Validate File Type**
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
      "application/vnd.ms-powerpoint", // PPT
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
      "text/plain" // TXT files
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, PPT, PPTX, DOCX, TXT`,
      });
    }

    const userId = req.user!.id;
    const { sessionId } = req.body;

    try {
      // ✅ **Create file record in database**
      const fileRecord = await storage.createFile(userId, {
        filename: req.file.originalname,
        originalName: req.file.originalname,  // ✅ Added originalName
        contentType: req.file.mimetype,
        size: req.file.size,
        sessionId,
        status: "processing",
      });


      processFile(req.file, sessionId)
        .then(async () => {
          try {
            // ✅ **Update file status to completed**
            await storage.updateFileStatus(fileRecord.id, "completed");

            // ✅ **Create a success message**
            await storage.createMessage(userId, {
              content: `File processed successfully: ${req.file!.originalname}`,
              isBot: true,
              sessionId,
              fileId: fileRecord.id,
            });
          } catch (storeError) {
            console.error("Error storing in AstraDB:", storeError);

            // ✅ **Mark as completed even if vector storage fails**
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

          // ✅ **Update status to error**
          await storage.updateFileStatus(fileRecord.id, "error");
          await storage.createMessage(userId, {
            content: `Error processing file ${req.file!.originalname}: ${error.message || "Unknown error"}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id,
          });
        });

      // ✅ **Respond immediately**
      res.json(fileRecord);
    } catch (error) {
      console.error("Error handling file upload:", error);
      res.status(500).json({
        message: "Failed to process file upload",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // ✅ **Chat API Route**
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
        ...body,
        isBot: false,
        sessionId: persistentSessionId,
      });

      console.log(`Sending request to Langflow API: ${body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          Authorization: "Bearer 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",
          "Content-Type": "application/json",
          "x-api-key": "sk-6W5u11ouqRgUnXqgcdIAYERdU3pQVdgWHxrD8kPzoQo",
        },
        body: JSON.stringify({
          input_value: body.content,
          output_type: "chat",
          input_type: "chat",
          tweaks: {
            "TextInput-0PsOz": {
              input_value: persistentSessionId,
            },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Langflow API Error:", errorText);
        throw new Error(
          `Langflow API responded with status ${response.status}`,
        );
      }

      const aiResponse = await response.json();
      console.log(
        "Langflow API Response:",
        JSON.stringify(aiResponse, null, 2),
      );

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
        console.error(
          "Unexpected AI Response Format:",
          JSON.stringify(aiResponse, null, 2),
        );
        throw new Error("Could not extract message from AI response");
      }

      // Format the bot's response before storing it
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

  // Add the new file history endpoint to the existing routes
  app.get("/api/files", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      // Get all files instead of just the user's files
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

  // ✅ **Start the HTTP Server**
  const httpServer = createServer(app);
  return httpServer;
}