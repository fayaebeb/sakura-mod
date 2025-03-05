import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

// ✅ Improved Logging Format
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    const clientTemplatePath = path.resolve(__dirname, "..", "client", "index.html");

    try {
      // ✅ Prevents errors if index.html does not exist
      if (!fs.existsSync(clientTemplatePath)) {
        return res.status(500).send("Error: index.html not found. Make sure the client is built.");
      }

      let template = await fs.promises.readFile(clientTemplatePath, "utf-8");

      // ✅ Cache-bust `main.tsx` to ensure updates load correctly
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      console.error("❌ Vite SSR Fix Stacktrace Error:", e);
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  // ✅ Check if `public` directory exists before serving
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `❌ Could not find the build directory: ${distPath}. Run 'npm run build' to generate it.`,
    );
  }

  app.use(express.static(distPath));

  // ✅ Serve index.html as a fallback
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
