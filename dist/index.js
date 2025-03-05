var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  files: () => files,
  insertFileSchema: () => insertFileSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertUserSchema: () => insertUserSchema,
  messages: () => messages,
  sessions: () => sessions,
  users: () => users
});
import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: text("session_id").notNull().unique(),
  // ✅ Ensure it's unique
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var files = pgTable("files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  sessionId: text("session_id").notNull(),
  status: text("status").notNull().default("processing"),
  // processing, completed, error
  createdAt: timestamp("created_at").defaultNow().notNull(),
  vectorizedContent: text("vectorized_content")
  // ✅ Stores extracted text from OpenAI
});
var messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isBot: boolean("is_bot").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sessionId: text("session_id").notNull().references(() => sessions.sessionId),
  // ✅ Now references `sessions.sessionId`
  fileId: integer("file_id").references(() => files.id)
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var insertSessionSchema = createInsertSchema(sessions).pick({
  userId: true,
  sessionId: true
});
var insertMessageSchema = createInsertSchema(messages).pick({
  content: true,
  isBot: true,
  sessionId: true,
  fileId: true
});
var insertFileSchema = createInsertSchema(files).pick({
  filename: true,
  originalName: true,
  contentType: true,
  size: true,
  sessionId: true,
  status: true,
  vectorizedContent: true
  // ✅ Now supports storing extracted text
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, and, desc } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
var PostgresSessionStore = connectPg(session);
var DatabaseStorage = class {
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async getMessagesByUserAndSession(userId, sessionId) {
    return await db.select().from(messages).where(
      and(
        eq(messages.userId, userId),
        eq(messages.sessionId, sessionId)
      )
    ).orderBy(messages.timestamp);
  }
  async createMessage(userId, message) {
    const [newMessage] = await db.insert(messages).values({
      userId,
      ...message
    }).returning();
    return newMessage;
  }
  async getUserLastSession(userId) {
    const [session3] = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(1);
    return session3;
  }
  async createUserSession(userId, sessionId) {
    const [session3] = await db.insert(sessions).values({
      userId,
      sessionId
    }).returning();
    return session3;
  }
  async createFile(userId, file) {
    const [newFile] = await db.insert(files).values({
      userId,
      ...file
    }).returning();
    return newFile;
  }
  async getFile(id) {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file;
  }
  async getFileByFilename(filename) {
    const [file] = await db.select().from(files).where(eq(files.filename, filename));
    return file;
  }
  async updateFileStatus(id, status) {
    const [updatedFile] = await db.update(files).set({ status }).where(eq(files.id, id)).returning();
    return updatedFile;
  }
  async updateFileVectorizedContent(id, vectorizedContent) {
    const [updatedFile] = await db.update(files).set({ vectorizedContent }).where(eq(files.id, id)).returning();
    return updatedFile;
  }
};
var storage = new DatabaseStorage();

// server/auth.ts
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session2 from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
var scryptAsync = promisify(scrypt);
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, 64);
  return `${buf.toString("hex")}.${salt}`;
}
async function comparePasswords(supplied, stored) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = await scryptAsync(supplied, salt, 64);
  return timingSafeEqual(hashedBuf, suppliedBuf);
}
function setupAuth(app2) {
  const sessionSettings = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1e3,
      // 1 year
      secure: process.env.NODE_ENV === "production"
    }
  };
  app2.set("trust proxy", 1);
  app2.use(session2(sessionSettings));
  app2.use(passport.initialize());
  app2.use(passport.session());
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !await comparePasswords(password, user.password)) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    })
  );
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });
  app2.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }
    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password)
    });
    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });
  app2.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });
  app2.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });
  app2.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}

// server/routes.ts
import multer from "multer";

// server/file-processor.ts
import { DataAPIClient } from "@datastax/astra-db-ts";
import { promises as fs } from "fs";
import ws2 from "ws";
import { neonConfig as neonConfig2 } from "@neondatabase/serverless";
import { OpenAI } from "openai";
import * as path from "path";
import * as tmp from "tmp";
import { execSync } from "child_process";
neonConfig2.webSocketConstructor = ws2;
var openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
var client = new DataAPIClient("AstraCS:MyeblgtUuIezcsypxuORPKrR:028dbe3744f8075ea0fe9e509d41c27559d992465ebb360f67c492707fd4a076");
var db2 = client.db("https://7088a2fb-29ff-47de-b6e0-44a0f317168c-westus3.apps.astra.datastax.com");
async function executeCommand(command, errorMessage) {
  try {
    console.log(`\u{1F4DD} Executing command: ${command}`);
    execSync(command, { stdio: "pipe" });
  } catch (error) {
    console.error(`\u274C ${errorMessage}:`, error);
    throw new Error(errorMessage);
  }
}
async function pdfToImages(pdfBuffer) {
  console.log("\u{1F4C4} Converting PDF to images...");
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempPdfPath = path.join(tempDir.name, "input.pdf");
  try {
    await fs.writeFile(tempPdfPath, pdfBuffer);
    const outputPrefix = path.join(tempDir.name, "output");
    await executeCommand(
      `pdftoppm -png "${tempPdfPath}" "${outputPrefix}"`,
      "Failed to convert PDF to images"
    );
    const files2 = await fs.readdir(tempDir.name);
    const imagePaths = files2.filter((file) => file.startsWith("output") && file.endsWith(".png")).map((file) => path.join(tempDir.name, file)).sort();
    if (imagePaths.length === 0) {
      throw new Error("No images were generated from the PDF");
    }
    console.log(`\u2705 Converted PDF to ${imagePaths.length} images`);
    return imagePaths;
  } catch (error) {
    console.error("\u274C Error in PDF to image conversion:", error);
    throw error;
  }
}
async function pptxToImages(pptxBuffer) {
  console.log("\u{1F4CA} Converting PPTX to images...");
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempPptxPath = path.join(tempDir.name, "presentation.pptx");
  const pdfPath = path.join(tempDir.name, "presentation.pdf");
  try {
    await fs.writeFile(tempPptxPath, pptxBuffer);
    try {
      await executeCommand("java -version", "Java is not properly installed");
    } catch (error) {
      console.error("\u274C Java check failed:", error);
      throw new Error("Java Runtime Environment is required but not available");
    }
    const libreOfficeCommand = `libreoffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempPptxPath}"`;
    try {
      await executeCommand(libreOfficeCommand, "Failed to convert PPTX to PDF");
    } catch (error) {
      console.error("\u274C LibreOffice conversion failed:", error);
      throw new Error("Failed to convert presentation to PDF. Please ensure the file is not corrupted.");
    }
    if (!await fs.stat(pdfPath).catch(() => false)) {
      throw new Error("PDF conversion failed - no output file generated");
    }
    const pdfBuffer = await fs.readFile(pdfPath);
    return await pdfToImages(pdfBuffer);
  } catch (error) {
    console.error("\u274C Error in PPTX processing:", error);
    throw error;
  } finally {
    await fs.unlink(tempPptxPath).catch(() => {
    });
    await fs.unlink(pdfPath).catch(() => {
    });
  }
}
async function docxToImages(docxBuffer) {
  console.log("\u{1F4DD} Converting DOCX to images...");
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempDocxPath = path.join(tempDir.name, "document.docx");
  const pdfPath = path.join(tempDir.name, "document.pdf");
  try {
    await fs.writeFile(tempDocxPath, docxBuffer);
    try {
      await executeCommand("java -version", "Java is not properly installed");
    } catch (error) {
      console.error("\u274C Java check failed:", error);
      throw new Error("Java Runtime Environment is required but not available");
    }
    const libreOfficeCommand = `libreoffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempDocxPath}"`;
    try {
      await executeCommand(libreOfficeCommand, "Failed to convert DOCX to PDF");
    } catch (error) {
      console.error("\u274C LibreOffice conversion failed:", error);
      throw new Error("Failed to convert document to PDF. Please ensure the file is not corrupted.");
    }
    if (!await fs.stat(pdfPath).catch(() => false)) {
      throw new Error("PDF conversion failed - no output file generated");
    }
    const pdfBuffer = await fs.readFile(pdfPath);
    return await pdfToImages(pdfBuffer);
  } catch (error) {
    console.error("\u274C Error in DOCX processing:", error);
    throw error;
  } finally {
    await fs.unlink(tempDocxPath).catch(() => {
    });
    await fs.unlink(pdfPath).catch(() => {
    });
  }
}
async function analyzeImage(imagePath) {
  console.log(`\u{1F50D} Analyzing image: ${imagePath}`);
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString("base64");
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extract key points from this document image. Summarize key points concisely while preserving the original meaning. Do not add interpretations, descriptions, or inferred context. Ensure the output is structured for efficient RAG-based vector storage without special formatting." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1e3
    });
    const extractedText = response.choices[0]?.message?.content ?? "No response";
    console.log(`\u2705 Extracted text: ${extractedText.substring(0, 100)}...`);
    return extractedText;
  } catch (error) {
    console.error("\u274C Error analyzing image:", error);
    return "Error processing image";
  }
}
async function processFile(file, sessionId) {
  console.log(`\u{1F4C2} Processing file: ${file.originalname} (${file.mimetype})`);
  let imagePaths = [];
  try {
    switch (file.mimetype) {
      case "application/pdf":
        imagePaths = await pdfToImages(file.buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      case "application/vnd.ms-powerpoint":
        imagePaths = await pptxToImages(file.buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        imagePaths = await docxToImages(file.buffer);
        break;
      default:
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
    const totalPages = imagePaths.length;
    console.log(`\u{1F4C4} Processing ${totalPages} pages...`);
    const extractedTexts = await Promise.all(
      imagePaths.map(async (path4, index) => {
        console.log(`Processing page ${index + 1}/${totalPages}`);
        return analyzeImage(path4);
      })
    );
    const metadata = extractedTexts.map((_, index) => ({
      filename: file.originalname
    }));
    await storeInAstraDB(extractedTexts, metadata);
    await Promise.all(imagePaths.map((path4) => fs.unlink(path4).catch(() => {
    })));
  } catch (error) {
    console.error("\u274C Error processing file:", error);
    throw error;
  }
}
async function storeInAstraDB(extractedTexts, metadata) {
  console.log("\u{1F4E6} Storing data in AstraDB...");
  try {
    const documents = extractedTexts.map((text2, index) => ({
      $vectorize: text2,
      metadata: metadata[index] || {}
    }));
    await db2.collection("newfile").insertMany(documents);
    return extractedTexts;
  } catch (error) {
    console.error("\u274C AstraDB storage error:", error);
    return [];
  }
}
async function testAstraDBConnection() {
  try {
    console.log("Testing AstraDB connection...");
    await db2.collection("newfile").findOne({});
    console.log("\u2705 Successfully connected to AstraDB");
  } catch (error) {
    console.error("\u274C Error connecting to AstraDB:", error);
  }
}
testAstraDBConnection();

// server/routes.ts
var LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/82a4b448-96ff-401d-99f4-809e966af016";
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
    // 20MB limit
  }
});
async function registerRoutes(app2) {
  setupAuth(app2);
  app2.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // PPTX
      "application/vnd.ms-powerpoint",
      // PPT
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      // DOCX
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, PPT, PPTX, DOCX`
      });
    }
    const userId = req.user.id;
    const { sessionId } = req.body;
    try {
      const fileRecord = await storage.createFile(userId, {
        filename: req.file.originalname,
        originalName: req.file.originalname,
        // ✅ Added originalName
        contentType: req.file.mimetype,
        size: req.file.size,
        sessionId,
        status: "processing"
      });
      processFile(req.file, sessionId).then(async () => {
        try {
          await storage.updateFileStatus(fileRecord.id, "completed");
          await storage.createMessage(userId, {
            content: `File processed successfully: ${req.file.originalname}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id
          });
        } catch (storeError) {
          console.error("Error storing in AstraDB:", storeError);
          await storage.updateFileStatus(fileRecord.id, "completed");
          await storage.createMessage(userId, {
            content: `File processed but storage in AstraDB failed: ${req.file.originalname}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id
          });
        }
      }).catch(async (error) => {
        console.error("Error processing file:", error);
        await storage.updateFileStatus(fileRecord.id, "error");
        await storage.createMessage(userId, {
          content: `Error processing file ${req.file.originalname}: ${error.message || "Unknown error"}`,
          isBot: true,
          sessionId,
          fileId: fileRecord.id
        });
      });
      res.json(fileRecord);
    } catch (error) {
      console.error("Error handling file upload:", error);
      res.status(500).json({
        message: "Failed to process file upload",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const persistentSessionId = req.user.username.split("@")[0];
    try {
      await storage.createMessage(req.user.id, {
        content: req.body.content,
        isBot: false,
        sessionId: persistentSessionId
      });
      const relevantChunks = await storeInAstraDB([req.body.content], []);
      console.log(`\u{1F50D} Sending request to Langflow API: ${req.body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input_value: req.body.content + (relevantChunks.length > 0 ? "\nContext: " + relevantChunks.join("\n") : ""),
          output_type: "chat",
          input_type: "chat"
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Langflow API Error:", errorText);
        throw new Error(`Langflow API responded with status ${response.status}`);
      }
      const aiResponse = await response.json();
      console.log("Langflow API Response:", JSON.stringify(aiResponse, null, 2));
      const aiOutputText = aiResponse.outputs?.[0]?.outputs?.[0]?.results?.message?.data?.text || aiResponse.outputs?.[0]?.outputs?.[0]?.messages?.[0]?.message || "I couldn't process your request.";
      const botMessage = await storage.createMessage(req.user.id, {
        content: aiOutputText,
        isBot: true,
        sessionId: persistentSessionId
      });
      res.json(botMessage);
    } catch (error) {
      console.error("Error in chat processing:", error);
      res.status(500).json({
        message: "Failed to process message",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app2.get("/api/messages/:sessionId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const persistentSessionId = req.user.username.split("@")[0];
      const messages2 = await storage.getMessagesByUserAndSession(
        req.user.id,
        persistentSessionId
      );
      res.json(messages2);
    } catch (error) {
      console.error("Error retrieving messages:", error);
      res.status(500).json({
        message: "Failed to retrieve messages",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs2 from "fs";
import path3, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path2, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(__dirname, "client", "src"),
      "@shared": path2.resolve(__dirname, "shared")
    }
  },
  root: path2.resolve(__dirname, "client"),
  build: {
    outDir: path2.resolve(__dirname, "dist/public"),
    emptyOutDir: true
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname2(__filename2);
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const clientTemplatePath = path3.resolve(__dirname2, "..", "client", "index.html");
    try {
      if (!fs2.existsSync(clientTemplatePath)) {
        return res.status(500).send("Error: index.html not found. Make sure the client is built.");
      }
      let template = await fs2.promises.readFile(clientTemplatePath, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      console.error("\u274C Vite SSR Fix Stacktrace Error:", e);
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(__dirname2, "public");
  if (!fs2.existsSync(distPath)) {
    throw new Error(
      `\u274C Could not find the build directory: ${distPath}. Run 'npm run build' to generate it.`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const PORT = 5e3;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
