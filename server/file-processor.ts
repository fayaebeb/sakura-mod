import { DataAPIClient } from "@datastax/astra-db-ts";
import { promises as fs } from "fs";
import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as cheerio from "cheerio";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Initialize AstraDB client
const client = new DataAPIClient("AstraCS:MyeblgtUuIezcsypxuORPKrR:028dbe3744f8075ea0fe9e509d41c27559d992465ebb360f67c492707fd4a076");
const db = client.db("https://7088a2fb-29ff-47de-b6e0-44a0f317168c-westus3.apps.astra.datastax.com");

// Test AstraDB connection
async function testAstraDBConnection() {
  try {
    console.log("Testing AstraDB connection...");
    await db.collection("files_data").findOne({});
    console.log("✅ Successfully connected to AstraDB");
  } catch (error) {
    console.error("❌ Error connecting to AstraDB:", error);
  }
}

// Run the test when this module is loaded
testAstraDBConnection();

interface ChunkMetadata {
  filename: string;
  chunk_index: number;
  total_chunks: number;
  session_id: string;
}

interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// ✅ Improved chunking with overlapping context and edge-case handling
async function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 200): Promise<string[]> {
  if (!text || text.trim().length === 0) {
    console.warn("⚠️ No text provided for chunking.");
    return [];
  }

  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxChunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break; // Prevent unnecessary iterations
    start += maxChunkSize - overlap; // Overlapping for context
  }

  console.log(`✅ Chunking completed: Created ${chunks.length} chunks`);
  return chunks;
}

// ✅ Improved PDF extraction using pdf-parse with better error handling
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
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
    console.error("❌ Error parsing PDF:", error);
    throw new Error("Failed to extract text from PDF.");
  }
}

// Extract text from DOCX files
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  } catch (error) {
    console.error("❌ Error parsing DOCX:", error);
    throw new Error("Failed to extract text from DOCX file.");
  }
}

// Extract text from HTML files
function extractTextFromHTML(buffer: Buffer): string {
  try {
    const html = buffer.toString('utf-8');
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Get text and normalize whitespace
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch (error) {
    console.error("❌ Error parsing HTML:", error);
    throw new Error("Failed to extract text from HTML file.");
  }
}

// Parse CSV files
function extractTextFromCSV(buffer: Buffer): string {
  try {
    const csv = buffer.toString('utf-8');
    // Simple CSV parsing - convert to readable text format
    const lines = csv.split(/\r?\n/).filter(line => line.trim() !== '');
    return lines.join('\n');
  } catch (error) {
    console.error("❌ Error parsing CSV:", error);
    throw new Error("Failed to extract text from CSV file.");
  }
}

// ✅ File processing function
export async function processFile(
  file: UploadedFile,
  sessionId: string
): Promise<{ chunks: string[]; metadata: ChunkMetadata[] }> {
  console.log(`📂 Processing file: ${file.originalname}`);

  let text: string;

  switch (file.mimetype) {
    case "application/pdf":
      text = await extractTextFromPDF(file.buffer);
      break;
    case "text/plain":
      text = file.buffer.toString("utf-8").trim();
      break;
    case "application/json":
      const jsonContent = JSON.parse(file.buffer.toString("utf-8"));
      text = JSON.stringify(jsonContent, null, 2);
      break;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      text = await extractTextFromDOCX(file.buffer);
      break;
    case "text/csv":
    case "application/csv":
      text = extractTextFromCSV(file.buffer);
      break;
    case "text/html":
      text = extractTextFromHTML(file.buffer);
      break;
    default:
      throw new Error(`Unsupported file type: ${file.mimetype}`);
  }

  // Chunk the text with improved function
  const chunks = await chunkText(text);
  if (chunks.length === 0) {
    throw new Error("No valid text chunks were generated.");
  }

  const metadata: ChunkMetadata[] = chunks.map((_, index) => ({
    filename: file.originalname,
    chunk_index: index,
    total_chunks: chunks.length,
    session_id: sessionId,
  }));

  console.log(`✅ File processed: ${chunks.length} chunks generated.`);
  return { chunks, metadata };
}

// ✅ Store in AstraDB with batch insertion
export async function storeInAstraDB(
  chunks: string[],
  metadata: ChunkMetadata[]
): Promise<void> {
  try {
    console.log(`📦 Storing ${chunks.length} chunks in AstraDB...`);
    const documents = chunks.map((chunk, index) => ({
      content: chunk,
      metadata: metadata[index],
    }));

    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      try {
        await Promise.all(
          batch.map(async (doc) => {
            await db.collection("files_data").insertOne({
              _data: {
                content: doc.content,
                metadata: doc.metadata,
              },
            });
          })
        );
        console.log(`✅ Stored batch ${Math.floor(i / batchSize) + 1}`);
      } catch (batchError) {
        console.error(`❌ Error storing batch ${Math.floor(i / batchSize) + 1}:`, batchError);
      }
    }
  } catch (error) {
    console.error("❌ Error in storeInAstraDB function:", error);
  }
}

// ✅ Retrieve all chunks of a document
export async function retrieveDocumentChunks(filename: string): Promise<string[]> {
  console.log(`🔍 Retrieving all chunks for file: ${filename}`);
  const results = await db.collection("files_data").find({
    "metadata.filename": filename,
  }).toArray();

  console.log(`✅ Retrieved ${results.length} chunks`);
  return results.map((doc) => doc._data.content);
}

// ✅ Retrieve most relevant chunks based on similarity
export async function retrieveRelevantChunks(query: string, filename: string, topK: number = 5): Promise<string[]> {
  console.log(`🔍 Searching for relevant chunks: "${query}" in ${filename}`);

  try {
    const results = await db.collection("files_data").find({
      "metadata.filename": filename,
      "content": { $regex: query, $options: "i" } // Case-insensitive text search
    }).limit(topK).toArray();

    console.log(`✅ Found ${results.length} relevant chunks.`);
    return results.map((doc) => doc._data.content);
  } catch (error) {
    console.error("❌ Error retrieving relevant chunks:", error);
    return [];
  }
}

// ✅ Debugging retrieval to see why the chatbot might fail
export async function debugRetrieve(query: string, filename: string) {
  console.log(`🔍 Debugging query: "${query}" in ${filename}`);

  const chunks = await retrieveRelevantChunks(query, filename);

  if (chunks.length === 0) {
    console.warn("⚠️ No relevant chunks found!");
  } else {
    console.log(`✅ Retrieved ${chunks.length} chunks:`, chunks);
  }
}
