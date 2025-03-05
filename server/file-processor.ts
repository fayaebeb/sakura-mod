import { DataAPIClient } from "@datastax/astra-db-ts";
import { promises as fs } from "fs";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { OpenAI } from "openai";
import * as path from "path";
import * as tmp from "tmp";
import { execSync } from "child_process";
import { storage } from "./storage";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// OpenAI API Key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize AstraDB client
const client = new DataAPIClient("AstraCS:MyeblgtUuIezcsypxuORPKrR:028dbe3744f8075ea0fe9e509d41c27559d992465ebb360f67c492707fd4a076");
const db = client.db("https://7088a2fb-29ff-47de-b6e0-44a0f317168c-westus3.apps.astra.datastax.com");

interface ChunkMetadata {
  filename: string;
  chunk_index?: number;
  total_chunks?: number;
  session_id?: string;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/**
 * Execute a shell command with error handling
 */
async function executeCommand(command: string, errorMessage: string): Promise<void> {
  try {
    console.log(`📝 Executing command: ${command}`);
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    console.error(`❌ ${errorMessage}:`, error);
    throw new Error(errorMessage);
  }
}

/**
 * Convert PDF to images using poppler-utils
 */
async function pdfToImages(pdfBuffer: Buffer): Promise<string[]> {
  console.log("📄 Converting PDF to images...");

  // Create temporary directory for the conversion process
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempPdfPath = path.join(tempDir.name, "input.pdf");

  try {
    // Write the PDF buffer to a temporary file
    await fs.writeFile(tempPdfPath, pdfBuffer);

    // Convert PDF to images using pdftoppm
    const outputPrefix = path.join(tempDir.name, "output");
    await executeCommand(
      `pdftoppm -png "${tempPdfPath}" "${outputPrefix}"`,
      "Failed to convert PDF to images"
    );

    // Get list of generated image files
    const files = await fs.readdir(tempDir.name);
    const imagePaths = files
      .filter(file => file.startsWith("output") && file.endsWith(".png"))
      .map(file => path.join(tempDir.name, file))
      .sort();

    if (imagePaths.length === 0) {
      throw new Error("No images were generated from the PDF");
    }

    console.log(`✅ Converted PDF to ${imagePaths.length} images`);
    return imagePaths;
  } catch (error) {
    console.error("❌ Error in PDF to image conversion:", error);
    throw error;
  }
}

/**
 * Convert PPTX slides to images with enhanced error handling
 */
async function pptxToImages(pptxBuffer: Buffer): Promise<string[]> {
  console.log("📊 Converting PPTX to images...");

  // Create temporary directory
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempPptxPath = path.join(tempDir.name, "presentation.pptx");
  const pdfPath = path.join(tempDir.name, "presentation.pdf");

  try {
    // Save PPTX temporarily
    await fs.writeFile(tempPptxPath, pptxBuffer);

    // Check if Java is available
    try {
      await executeCommand("java -version", "Java is not properly installed");
    } catch (error) {
      console.error("❌ Java check failed:", error);
      throw new Error("Java Runtime Environment is required but not available");
    }

    // Convert PPTX to PDF using LibreOffice with enhanced error handling
    const libreOfficeCommand = `libreoffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempPptxPath}"`;
    try {
      await executeCommand(libreOfficeCommand, "Failed to convert PPTX to PDF");
    } catch (error) {
      console.error("❌ LibreOffice conversion failed:", error);
      throw new Error("Failed to convert presentation to PDF. Please ensure the file is not corrupted.");
    }

    // Verify PDF was created
    if (!await fs.stat(pdfPath).catch(() => false)) {
      throw new Error("PDF conversion failed - no output file generated");
    }

    // Convert the PDF to images
    const pdfBuffer = await fs.readFile(pdfPath);
    return await pdfToImages(pdfBuffer);

  } catch (error) {
    console.error("❌ Error in PPTX processing:", error);
    throw error;
  } finally {
    // Cleanup temporary files
    await fs.unlink(tempPptxPath).catch(() => {});
    await fs.unlink(pdfPath).catch(() => {});
  }
}

/**
 * Convert DOCX to images with enhanced error handling
 */
async function docxToImages(docxBuffer: Buffer): Promise<string[]> {
  console.log("📝 Converting DOCX to images...");

  // Create temporary directory
  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const tempDocxPath = path.join(tempDir.name, "document.docx");
  const pdfPath = path.join(tempDir.name, "document.pdf");

  try {
    // Save DOCX temporarily
    await fs.writeFile(tempDocxPath, docxBuffer);

    // Check if Java is available
    try {
      await executeCommand("java -version", "Java is not properly installed");
    } catch (error) {
      console.error("❌ Java check failed:", error);
      throw new Error("Java Runtime Environment is required but not available");
    }

    // Convert DOCX to PDF using LibreOffice with enhanced error handling
    const libreOfficeCommand = `libreoffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempDocxPath}"`;
    try {
      await executeCommand(libreOfficeCommand, "Failed to convert DOCX to PDF");
    } catch (error) {
      console.error("❌ LibreOffice conversion failed:", error);
      throw new Error("Failed to convert document to PDF. Please ensure the file is not corrupted.");
    }

    // Verify PDF was created
    if (!await fs.stat(pdfPath).catch(() => false)) {
      throw new Error("PDF conversion failed - no output file generated");
    }

    // Convert the PDF to images
    const pdfBuffer = await fs.readFile(pdfPath);
    return await pdfToImages(pdfBuffer);

  } catch (error) {
    console.error("❌ Error in DOCX processing:", error);
    throw error;
  } finally {
    // Cleanup temporary files
    await fs.unlink(tempDocxPath).catch(() => {});
    await fs.unlink(pdfPath).catch(() => {});
  }
}

/**
 * Process an image through GPT-4V
 */
async function analyzeImage(imagePath: string): Promise<string> {
  console.log(`🔍 Analyzing image: ${imagePath}`);

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
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const extractedText = response.choices[0]?.message?.content ?? "No response";
    console.log(`✅ Extracted text: ${extractedText.substring(0, 100)}...`);

    return extractedText;
  } catch (error) {
    console.error("❌ Error analyzing image:", error);
    return "Error processing image";
  }
}

/**
 * Process files (PDF/PPTX/DOCX → Images → GPT-4V → AstraDB)
 */
export async function processFile(file: UploadedFile, sessionId: string): Promise<void> {
  console.log(`📂 Processing file: ${file.originalname} (${file.mimetype})`);

  let imagePaths: string[] = [];

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
    console.log(`📄 Processing ${totalPages} pages...`);

    const extractedTexts = await Promise.all(
      imagePaths.map(async (path, index) => {
        console.log(`Processing page ${index + 1}/${totalPages}`);
        return analyzeImage(path);
      })
    );

    const metadata: ChunkMetadata[] = extractedTexts.map((_, index) => ({
      filename: file.originalname,
      chunk_index: index,
      total_chunks: totalPages,
      session_id: sessionId,
    }));

    await storeInAstraDB(extractedTexts, metadata);

    // Clean up temporary image files
    await Promise.all(imagePaths.map(path => fs.unlink(path).catch(() => {})));

  } catch (error) {
    console.error("❌ Error processing file:", error);
    throw error;
  }
}

/**
 * Store extracted data in AstraDB
 */
export async function storeInAstraDB(extractedTexts: string[], metadata: ChunkMetadata[]): Promise<string[]> {
  console.log("📦 Storing data in AstraDB...");
  try {
    const documents = extractedTexts.map((text, index) => ({
      $vectorize: text,
      metadata: metadata[index] || {}
    }));

    await db.collection("newfile").insertMany(documents);
    return extractedTexts;
  } catch (error) {
    console.error("❌ AstraDB storage error:", error);
    return [];
  }
}

//Test AstraDB connection
async function testAstraDBConnection() {
  try {
    console.log("Testing AstraDB connection...");
    await db.collection("newfile").findOne({});
    console.log("✅ Successfully connected to AstraDB");
  } catch (error) {
    console.error("❌ Error connecting to AstraDB:", error);
  }
}

// Run the test when this module is loaded
testAstraDBConnection();

/**
 * Retrieve the most relevant document chunks from AstraDB using vector search
 */
export async function retrieveRelevantChunks(query: string, topK: number = 5): Promise<string[]> {
  console.log(`🔍 Searching AstraDB for relevant chunks: "${query}"`);

  try {
    const results = await db.collection("newfile").find({
      $vector: {
        query: query,
        path: "content",
        k: topK,
      },
    }).toArray();

    console.log(`✅ Found ${results.length} relevant chunks.`);
    return results.map((doc) => doc.content);
  } catch (error) {
    console.error("❌ Error retrieving relevant chunks:", error);
    return [];
  }
}