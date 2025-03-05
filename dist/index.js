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
  sessionId: text("session_id").notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isBot: boolean("is_bot").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  sessionId: text("session_id").notNull().references(() => sessions.id),
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
  status: true
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
  sessionStore;
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
  async updateFileStatus(id, status) {
    const [updatedFile] = await db.update(files).set({ status }).where(eq(files.id, id)).returning();
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
import ws2 from "ws";
import { neonConfig as neonConfig2 } from "@neondatabase/serverless";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as cheerio from "cheerio";
neonConfig2.webSocketConstructor = ws2;
var client = new DataAPIClient("AstraCS:MyeblgtUuIezcsypxuORPKrR:028dbe3744f8075ea0fe9e509d41c27559d992465ebb360f67c492707fd4a076");
var db2 = client.db("https://7088a2fb-29ff-47de-b6e0-44a0f317168c-westus3.apps.astra.datastax.com");
async function testAstraDBConnection() {
  try {
    console.log("Testing AstraDB connection...");
    await db2.collection("files_data").findOne({});
    console.log("\u2705 Successfully connected to AstraDB");
  } catch (error) {
    console.error("\u274C Error connecting to AstraDB:", error);
  }
}
testAstraDBConnection();
async function chunkText(text2, maxChunkSize = 1e3, overlap = 200) {
  if (!text2 || text2.trim().length === 0) {
    console.warn("\u26A0\uFE0F No text provided for chunking.");
    return [];
  }
  const words = text2.split(/\s+/);
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxChunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start += maxChunkSize - overlap;
  }
  console.log(`\u2705 Chunking completed: Created ${chunks.length} chunks`);
  return chunks;
}
async function extractTextFromPDF(buffer) {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("Invalid PDF buffer: Buffer is empty.");
    }
    const data = await pdfParse(buffer);
    if (!data.text) {
      throw new Error("PDF parsing failed: No text extracted.");
    }
    return data.text.trim();
  } catch (error) {
    console.error("\u274C Error parsing PDF:", error);
    throw new Error("Failed to extract text from PDF.");
  }
}
async function extractTextFromDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("\u274C Error parsing DOCX:", error);
    throw new Error("Failed to extract text from DOCX file.");
  }
}
function extractTextFromHTML(buffer) {
  try {
    const html = buffer.toString("utf-8");
    const $ = cheerio.load(html);
    $("script, style").remove();
    return $("body").text().replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("\u274C Error parsing HTML:", error);
    throw new Error("Failed to extract text from HTML file.");
  }
}
function extractTextFromCSV(buffer) {
  try {
    const csv = buffer.toString("utf-8");
    const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
    return lines.join("\n");
  } catch (error) {
    console.error("\u274C Error parsing CSV:", error);
    throw new Error("Failed to extract text from CSV file.");
  }
}
async function processFile(file, sessionId) {
  console.log(`\u{1F4C2} Processing file: ${file.originalname}`);
  let text2;
  switch (file.mimetype) {
    case "application/pdf":
      text2 = await extractTextFromPDF(file.buffer);
      break;
    case "text/plain":
      text2 = file.buffer.toString("utf-8").trim();
      break;
    case "application/json":
      const jsonContent = JSON.parse(file.buffer.toString("utf-8"));
      text2 = JSON.stringify(jsonContent, null, 2);
      break;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      text2 = await extractTextFromDOCX(file.buffer);
      break;
    case "text/csv":
    case "application/csv":
      text2 = extractTextFromCSV(file.buffer);
      break;
    case "text/html":
      text2 = extractTextFromHTML(file.buffer);
      break;
    default:
      throw new Error(`Unsupported file type: ${file.mimetype}`);
  }
  const chunks = await chunkText(text2);
  if (chunks.length === 0) {
    throw new Error("No valid text chunks were generated.");
  }
  const metadata = chunks.map((_, index) => ({
    filename: file.originalname,
    chunk_index: index,
    total_chunks: chunks.length,
    session_id: sessionId
  }));
  console.log(`\u2705 File processed: ${chunks.length} chunks generated.`);
  return { chunks, metadata };
}
async function storeInAstraDB(chunks, metadata) {
  try {
    console.log(`\u{1F4E6} Storing ${chunks.length} chunks in AstraDB...`);
    const documents = chunks.map((chunk, index) => ({
      content: chunk,
      metadata: metadata[index]
    }));
    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      try {
        await Promise.all(
          batch.map(async (doc) => {
            await db2.collection("files_data").insertOne({
              _data: {
                content: doc.content,
                metadata: doc.metadata
              }
            });
          })
        );
        console.log(`\u2705 Stored batch ${Math.floor(i / batchSize) + 1}`);
      } catch (batchError) {
        console.error(`\u274C Error storing batch ${Math.floor(i / batchSize) + 1}:`, batchError);
      }
    }
  } catch (error) {
    console.error("\u274C Error in storeInAstraDB function:", error);
  }
}

// server/routes.ts
var LANGFLOW_API = "https://fayaebeb-langflow.hf.space/api/v1/run/82a4b448-96ff-401d-99f4-809e966af016";
var upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
    // 5MB limit
  }
});
async function registerRoutes(app2) {
  setupAuth(app2);
  app2.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const allowedMimeTypes = [
      "application/pdf",
      "text/plain",
      "application/json",
      "text/csv",
      "application/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/html"
    ];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        error: `Unsupported file type: ${req.file.mimetype}. Supported types: PDF, TXT, JSON, CSV, DOCX, HTML`
      });
    }
    const userId = req.user.id;
    const { sessionId } = req.body;
    try {
      const fileRecord = await storage.createFile(userId, {
        filename: req.file.originalname,
        // Use originalname from multer
        originalName: req.file.originalname,
        // Add originalName field
        contentType: req.file.mimetype,
        size: req.file.size,
        // Add file size
        sessionId,
        status: "processing"
      });
      processFile(req.file, sessionId).then(async ({ chunks, metadata }) => {
        try {
          await storeInAstraDB(chunks, metadata);
          await storage.updateFileStatus(fileRecord.id, "completed");
          await storage.createMessage(userId, {
            content: `File processed: ${req.file.originalname}
Chunks created: ${chunks.length}`,
            isBot: true,
            sessionId,
            fileId: fileRecord.id
          });
        } catch (storeError) {
          console.error("Error storing in AstraDB:", storeError);
          await storage.updateFileStatus(fileRecord.id, "completed");
          await storage.createMessage(userId, {
            content: `File processed but storage failed: ${req.file.originalname}. Some content may be unavailable.`,
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
    const result = insertMessageSchema.safeParse(req.body);
    if (!result.success) {
      console.error("Invalid request body:", result.error);
      return res.status(400).json({ error: "Invalid request data" });
    }
    const body = result.data;
    try {
      await storage.createMessage(req.user.id, {
        ...body,
        isBot: false,
        sessionId: persistentSessionId
      });
      console.log(`Sending request to Langflow API: ${body.content}`);
      const response = await fetch(LANGFLOW_API, {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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",
          "Content-Type": "application/json",
          "x-api-key": "sk-13QT6ba04gaVTNsrhPH5ib41keBRLQtBNPY2O4E_dVk"
        },
        body: JSON.stringify({
          input_value: body.content,
          output_type: "chat",
          input_type: "chat",
          tweaks: {
            "TextInput-BinzV": {
              "input_value": persistentSessionId
            }
          }
        })
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
import fs from "fs";
import path2, { dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path, { dirname } from "path";
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
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
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
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
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
