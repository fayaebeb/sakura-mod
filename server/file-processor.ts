import { DataAPIClient } from "@datastax/astra-db-ts";
import { promises as fs } from "fs";
import { writeFileSync } from "fs";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { OpenAI } from "openai";
import * as path from "path";
import * as tmp from "tmp";
import { execSync } from "child_process";
import { storage } from "./storage";
import * as chardet from "chardet";
import natural from "natural";
import { google } from "googleapis";
import { Readable } from "stream";
import Papa from 'papaparse';
import * as XLSX from "xlsx";
import { fileURLToPath } from "url";

const { SentenceTokenizer } = natural;

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// OpenAI API Key
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Initialize AstraDB client
const client = new DataAPIClient(process.env.ASTRA_API_TOKEN);
const db = client.db(process.env.ASTRA_DB_URL);

// ✅ GOOGLE DRIVE AUTHENTICATION
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Write the Google service account JSON from env to file
const keyPath = path.join(__dirname, "google-service-account.json");

if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  writeFileSync(keyPath, process.env.GOOGLE_SERVICE_ACCOUNT_JSON, "utf8");
} else {
  console.warn("⚠️ GOOGLE_SERVICE_ACCOUNT_JSON not set — Google Drive upload won't work.");
}

// Authenticate using the key file
const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

// Initialize Google Drive API
const drive = google.drive({ version: "v3", auth });

interface ChunkMetadata {
  filename: string;
  filelink?: string;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// Sentence tokenizer for splitting text files into chunks
const tokenizer = new SentenceTokenizer([]);

/**
 * Upload file to Google Drive and generate a shareable link
 */
async function uploadToGoogleDriveAndGetLink(file: UploadedFile): Promise<string> {
  console.log(`📤 Uploading file to Google Drive: ${file.originalname}`);
  try {
    // Set your target folder ID (extracted from your Drive folder URL)
    const folderID = "1Nh667VEAWXqshRZIpvkPW3nvv-d0RBR3";

    // Prepare file metadata
    const fileMetadata = {
      name: file.originalname,
      parents: [folderID]
    };

    // Prepare media object: convert file buffer to a readable stream
    const media = {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    };

    // Upload the file using drive.files.create
    const createResponse = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id"
    });

    const fileId = createResponse.data.id;
    if (!fileId) {
      throw new Error("No file ID returned from Google Drive API");
    }
    console.log(`✅ File uploaded to Google Drive with ID: ${fileId}`);

    // Set file permission so that anyone with the link can read the file
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: "reader",
        type: "anyone"
      }
    });

    // Retrieve the shareable link for the file
    const getResponse = await drive.files.get({
      fileId,
      fields: "webViewLink"
    });

    const sharedLink = getResponse.data.webViewLink;
    console.log(`✅ Generated shareable link: ${sharedLink}`);

    return sharedLink || "";
  } catch (error) {
    console.error("❌ Error uploading to Google Drive:", error);
    throw new Error(`Failed to upload file to Google Drive: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
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
  const tempDir = tmp.dirSync({ dir: "/tmp", unsafeCleanup: true });
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
  const tempDir = tmp.dirSync({ dir: "/tmp", unsafeCleanup: true });
  const tempPptxPath = path.join(tempDir.name, "presentation.pptx");
  const pdfPath = path.join(tempDir.name, "presentation.pdf");

  try {
    // Save PPTX temporarily
    await fs.writeFile(tempPptxPath, pptxBuffer);

    // Convert PPTX to PDF using LibreOffice (soffice)
    const libreOfficeCommand = `libreoffice --headless --convert-to pdf --outdir "${tempDir.name}" "${tempPptxPath}"`;
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
  const tempDir = tmp.dirSync({ dir: "/tmp", unsafeCleanup: true });
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
/**
 * Process an image through GPT-4o with retry mechanism for handling rate limit errors
 */
async function analyzeImage(imagePath: string): Promise<string> {
  console.log(`🔍 Analyzing image: ${imagePath}`);
  const imageBuffer = await fs.readFile(imagePath);
  const base64Image = imageBuffer.toString("base64");

  const maxRetries = 3;
  let retries = 0;
  let delay = 60000; // Initial delay of 3 seconds

  while (retries < maxRetries) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "summarize all content and structured data from this document image in Japanese. Preserve original text and meaning as much as possible." },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 3000,
      });

      return response.choices[0]?.message?.content ?? "No response";
    } catch (error: any) {
      if (error.status === 429) {
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'], 10) * 1000
          : delay;

        console.warn(`⚠️ Rate limit reached. Retrying in ${retryAfter / 1000} seconds...`);
        await new Promise(res => setTimeout(res, retryAfter));

        delay *= 2; // Exponential backoff
        retries++;
      } else {
        console.error("❌ Error analyzing image:", error);
        throw error;
      }
    }
  }

  throw new Error("Failed to analyze image after multiple attempts due to rate limits.");
}


/**
 * Process text file into chunks for vector storage
 */
async function processTextFile(textBuffer: Buffer): Promise<string[]> {
  console.log("📝 Processing text file...");

  try {
    const detectedEncoding = chardet.detect(textBuffer) || "utf-8";
    const encodingMap: Record<string, BufferEncoding> = {
      "UTF-8": "utf8",
      "UTF-16LE": "utf16le",
      // These are not standard Node.js BufferEncoding types, so use a default for them
      "Shift_JIS": "utf8",
      "ISO-2022-JP": "utf8",
      "EUC-JP": "utf8"
    };

    const encoding = encodingMap[detectedEncoding.toUpperCase()] || "utf8";

    const text = textBuffer.toString(encoding);

    const CHUNK_SIZE = 500;
    const CHUNK_OVERLAP = 80;

    // Escape special characters properly
    const separators = ["\\n\\n", "\\n", "。", "？", "！", "\\.", "\\?", "\\!"];

    // Create regex
    const regex = new RegExp(`(${separators.join('|')})`, 'g');

    // Split text using regex, preserving separators
    const segments = text.split(regex).filter(Boolean);

    const chunks: string[] = [];
    let currentChunk = "";

    for (let i = 0; i < segments.length; i += 2) {
      const sentence = segments[i] + (segments[i + 1] || "");
      if ((currentChunk + sentence).length <= CHUNK_SIZE) {
        currentChunk += sentence;
      } else {
        chunks.push(currentChunk.trim());
        currentChunk = currentChunk.slice(-CHUNK_OVERLAP) + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    console.log(`✅ Split text into ${chunks.length} chunks with ${CHUNK_OVERLAP}-character overlap.`);
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
  let driveSharedLink = '';

  try {
    // Upload file to Google Drive and get shareable link
    try {
      driveSharedLink = await uploadToGoogleDriveAndGetLink(file);
      console.log(`📦 File uploaded to Google Drive with shareable link: ${driveSharedLink}`);
    } catch (driveError) {
      console.error('❌ Google Drive upload failed:', driveError);
      // Continue with processing even if Drive upload fails
    }

    switch (file.mimetype) {
      case "application/pdf":
        console.log("📄 PDF file detected. Converting to images...");
        const pdfImages = await pdfToImages(file.buffer);
        tempFiles.push(...pdfImages); // Track images for cleanup

        extractedTexts = [];
        for (let index = 0; index < pdfImages.length; index++) {
          const imagePath = pdfImages[index];
          console.log(`🔍 Analyzing PDF image ${index + 1}/${pdfImages.length}`);
          extractedTexts.push(await analyzeImage(imagePath));
        }
        break;

      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      case "application/vnd.ms-powerpoint":
        console.log("📊 PPTX file detected. Converting to images...");
        const pptxImages = await pptxToImages(file.buffer);
        tempFiles.push(...pptxImages); // Track images for cleanup

        extractedTexts = [];
        for (let index = 0; index < pptxImages.length; index++) {
          const imagePath = pptxImages[index];
          console.log(`🔍 Analyzing PPTX image ${index + 1}/${pptxImages.length}`);
          extractedTexts.push(await analyzeImage(imagePath));
        }
        break;

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        console.log("📝 DOCX file detected. Converting to images...");
        const docxImages = await docxToImages(file.buffer);
        tempFiles.push(...docxImages); // Track images for cleanup

        extractedTexts = [];
        for (let index = 0; index < docxImages.length; index++) {
          const imagePath = docxImages[index];
          console.log(`🔍 Analyzing DOCX image ${index + 1}/${docxImages.length}`);
          extractedTexts.push(await analyzeImage(imagePath));
        }
        break;

      case "text/plain":
        console.log("📝 Plain text file detected. Splitting into chunks...");
        extractedTexts = await processTextFile(file.buffer);
        break;

        case "text/csv":
          console.log("🧾 CSV file detected. Parsing and chunking...");
          const csvText = file.buffer.toString("utf-8");
          const parsedCsv = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
          extractedTexts = await chunkTabularData(parsedCsv.data, file.originalname);
          break;

        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        case "application/vnd.ms-excel":
          console.log("📊 Excel file detected. Parsing and chunking...");
          const workbook = XLSX.read(file.buffer, { type: "buffer" });
          extractedTexts = [];

          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetData: string[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            extractedTexts.push(...sheetData.slice(1).map((row, idx) => {
              if (!row || row.every(cell => cell === "" || cell == null)) return "";
              const rowText = row.map((cell, cellIdx) => 
                `${sheetData[0]?.[cellIdx] || `Column ${cellIdx + 1}`}: ${cell}`
              ).join(" | ");
              return `Sheet: ${sheetName} | Row ${idx + 1} from ${file.originalname}: ${rowText}`;
            }).filter(text => text !== ""));
          });
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
      filelink: driveSharedLink || undefined,
    }));

    // Store extracted data in AstraDB
    await storeInAstraDB(extractedTexts, metadata);

    console.log(`📦 Successfully stored ${extractedTexts.length} chunks in AstraDB.`);
  } catch (error) {
    console.error("❌ Error processing file:", error);
    throw error;
  } finally {
    // Ensure all temporary files are deleted
    if (tempFiles.length > 0) {
      console.log("🧹 Cleaning up temporary files...");
      await Promise.all(tempFiles.map(filePath => fs.unlink(filePath).catch(() => {})));
      console.log("✅ Temporary files deleted.");
    }
  }
}


// --- 🚩 CSV/XLSX Processing Functions Integration ---

async function chunkTabularData(rows: string[][], filename: string, sheetName?: string): Promise<string[]> {
  const chunks: string[] = [];
  const headers = rows[0];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row || row.every(cell => cell === "" || cell == null)) continue;  // Handle empty rows

    const rowText = row.map((cell, i) => `${headers?.[i] || `Column ${i + 1}`}: ${cell}`).join(" | ");
    const prefix = sheetName ? `Sheet: ${sheetName} | ` : "";
    chunks.push(`${prefix}Row ${rowIndex} from ${filename}: ${rowText}`);
  }

  return chunks;
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

    await db.collection("files").insertMany(documents);
    console.log("✅ Successfully stored text chunks in AstraDB.");
  } catch (error) {
    console.error("❌ AstraDB storage error:", error);
    throw error;  // <---- Ensure errors propagate
  }
}


/**
 * Delete file data from AstraDB
 */
export async function deleteFileFromAstraDB(filename: string): Promise<void> {
  console.log(`🗑️ Deleting file data from AstraDB: ${filename}`);
  try {
    await db.collection("files").deleteMany({
      "metadata.filename": filename
    });
    console.log("✅ Successfully deleted file data from AstraDB");
  } catch (error) {
    console.error("❌ Error deleting from AstraDB:", error);
    throw error;
  }
}

//Test AstraDB connection
async function testAstraDBConnection() {
  try {
    console.log("Testing AstraDB connection...");
    await db.collection("files").findOne({});
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
    const results = await db.collection("files").find({
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