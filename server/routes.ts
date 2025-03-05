import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import multer from "multer";
import { processFile, storeInAstraDB } from "./file-processor";

// Langflow API configuration
const LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/82a4b448-96ff-401d-99f4-809e966af016";

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
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // DOCX
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, PPT, PPTX, DOCX`,
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

    // Extract sessionId from user's email
    const persistentSessionId = req.user!.username.split("@")[0];

    try {
      // ✅ **Store User Message**
      await storage.createMessage(req.user!.id, {
        content: req.body.content,
        isBot: false,
        sessionId: persistentSessionId,
      });

      // ✅ **Retrieve Relevant Chunks from AstraDB**
      const relevantChunks = await storeInAstraDB([req.body.content], []); // ✅ Add an empty metadata array
      // ✅ Wrap content in an array

      // ✅ **Call Langflow API with Retrieved Context**
      console.log(`🔍 Sending request to Langflow API: ${req.body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_value: req.body.content + (relevantChunks.length > 0 ? "\nContext: " + relevantChunks.join("\n") : ""),
          output_type: "chat",
          input_type: "chat",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Langflow API Error:", errorText);
        throw new Error(`Langflow API responded with status ${response.status}`);
      }

      const aiResponse = await response.json();
      console.log("Langflow API Response:", JSON.stringify(aiResponse, null, 2));

      // ✅ **Extract AI Response**
      const aiOutputText = aiResponse.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text ||
                           aiResponse.outputs?.[0]?.outputs?.[0]?.messages?.[0]?.message ||
                           "I couldn't process your request.";

      // ✅ **Store AI Response**
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

  // ✅ **Retrieve Messages by Session**
  app.get("/api/messages/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // ✅ **Use Persistent Session ID**
      const persistentSessionId = req.user!.username.split("@")[0];
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

  // ✅ **Start the HTTP Server**
  const httpServer = createServer(app);
  return httpServer;
}