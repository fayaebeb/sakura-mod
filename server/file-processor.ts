import { DataAPIClient } from "@datastax/astra-db-ts";
import { promises as fs } from "fs";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { OpenAI } from "openai";
import * as path from "path";
import * as tmp from "tmp";
import { execSync } from "child_process";
import { storage } from "./storage";
import * as chardet from "chardet";
import natural from "natural";

const { SentenceTokenizer } = natural;


// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// OpenAI API Key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize AstraDB client
const client = new DataAPIClient("AstraCS:MyeblgtUuIezcsypxuORPKrR:028dbe3744f8075ea0fe9e509d41c27559d992465ebb360f67c492707fd4a076");
const db = client.db("https://7088a2fb-29ff-47de-b6e0-44a0f317168c-westus3.apps.astra.datastax.com");

interface ChunkMetadata {
  filename: string;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// Sentence tokenizer for splitting text files into chunks
const tokenizer = new SentenceTokenizer([]);

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

    // Convert PPTX to PDF using LibreOffice (soffice)
    const libreOfficeCommand = `soffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempPptxPath}"`;
    await executeCommand(libreOfficeCommand, "Failed to convert PPTX to PDF");

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
 * Process text file into chunks for vector storage
 */
async function processTextFile(textBuffer: Buffer): Promise<string[]> {
  console.log("📝 Processing text file...");

  try {
    const detectedEncoding = chardet.detect(textBuffer) || "utf-8";
    
    // Convert encoding to a format compatible with Node.js
    const encodingMap: Record<string, BufferEncoding> = {
      "UTF-8": "utf8",
      "ISO-8859-1": "latin1",
      "ASCII": "ascii",
      "UTF-16LE": "utf16le"
    };
    
    const encoding = encodingMap[detectedEncoding.toUpperCase()] || "utf8";

    // Convert buffer to string
    const text = textBuffer.toString(encoding);

    // Split text into 1000-character chunks (sentence-aware)
    const CHUNK_SIZE = 1000;
    const sentences = tokenizer.tokenize(text);
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= CHUNK_SIZE) {
        currentChunk += sentence + " ";
      } else {
        chunks.push(currentChunk.trim());
        currentChunk = sentence + " ";
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    console.log(`✅ Split text into ${chunks.length} chunks`);
    return chunks;
  } catch (error) {
    console.error("❌ Error processing text file:", error);
    throw error;
  }
}

/**
 * Process files (PDF/PPTX/DOCX → Images → GPT-4V → AstraDB)
 * Also supports text files (TXT → Chunks → AstraDB)
 */
export async function processFile(file: UploadedFile, sessionId: string): Promise<void> {
  console.log(`📂 Processing file: ${file.originalname} (${file.mimetype})`);

  let extractedTexts: string[] = [];
  const tempFiles: string[] = []; // Track temporary files for cleanup

  try {
    switch (file.mimetype) {
      case "application/pdf":
        console.log("📄 PDF file detected. Converting to images...");
        const pdfImages = await pdfToImages(file.buffer);
        tempFiles.push(...pdfImages); // Track images for cleanup

        extractedTexts = await Promise.all(
          pdfImages.map(async (imagePath, index) => {
            console.log(`🔍 Analyzing PDF image ${index + 1}/${pdfImages.length}`);
            return analyzeImage(imagePath);
          })
        );
        break;

      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      case "application/vnd.ms-powerpoint":
        console.log("📊 PPTX file detected. Converting to images...");
        const pptxImages = await pptxToImages(file.buffer);
        tempFiles.push(...pptxImages); // Track images for cleanup

        extractedTexts = await Promise.all(
          pptxImages.map(async (imagePath, index) => {
            console.log(`🔍 Analyzing PPTX image ${index + 1}/${pptxImages.length}`);
            return analyzeImage(imagePath);
          })
        );
        break;

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        console.log("📝 DOCX file detected. Converting to images...");
        const docxImages = await docxToImages(file.buffer);
        tempFiles.push(...docxImages); // Track images for cleanup

        extractedTexts = await Promise.all(
          docxImages.map(async (imagePath, index) => {
            console.log(`🔍 Analyzing DOCX image ${index + 1}/${docxImages.length}`);
            return analyzeImage(imagePath);
          })
        );
        break;

      case "text/plain":
        console.log("📝 Plain text file detected. Splitting into chunks...");
        extractedTexts = await processTextFile(file.buffer);
        break;

      default:
        console.warn(`⚠️ Unsupported file type encountered: ${file.mimetype}`);
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    if (extractedTexts.length === 0) {
      throw new Error("No text extracted from the file.");
    }

    console.log(`✅ Extracted ${extractedTexts.length} chunks from ${file.originalname}`);

    // Create metadata for each chunk
    const metadata: ChunkMetadata[] = extractedTexts.map(() => ({
      filename: file.originalname,
    }));

    // Store extracted data in AstraDB
    await storeInAstraDB(extractedTexts, metadata);

    console.log(`📦 Successfully stored ${extractedTexts.length} chunks in AstraDB.`);

  } catch (error) {
    console.error("❌ Error processing file:", error);
    throw error;
  } finally {
    // ✅ Ensure all temporary files are deleted
    if (tempFiles.length > 0) {
      console.log("🧹 Cleaning up temporary files...");
      await Promise.all(tempFiles.map(path => fs.unlink(path).catch(() => {})));
      console.log("✅ Temporary files deleted.");
    }
  }
}




/**
 * Store extracted data in AstraDB
 */
export async function storeInAstraDB(extractedTexts: string[], metadata: ChunkMetadata[]): Promise<void> {
  console.log("📦 Storing data in AstraDB...");
  try {
    const documents = extractedTexts.map((text, index) => ({
      $vectorize: text,
      metadata: metadata[index] || {},
    }));

    await db.collection("newfile").insertMany(documents);
    console.log("✅ Successfully stored text chunks in AstraDB.");
  } catch (error) {
    console.error("❌ AstraDB storage error:", error);
    throw error;  // <---- Ensure errors propagate
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