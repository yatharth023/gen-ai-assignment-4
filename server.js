import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { indexDocument, queryDocument, checkQdrantConnection } from "./rag.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [".pdf", ".txt"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and TXT files are allowed"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Routes

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const qdrantConnected = await checkQdrantConnection();
    res.json({
      status: "ok",
      qdrant: qdrantConnected ? "connected" : "disconnected",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// Upload and index document
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    console.log(`Processing file: ${req.file.originalname}`);

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileType = path.extname(originalName).toLowerCase();

    // Index the document
    const result = await indexDocument(filePath, originalName, fileType);

    // Clean up uploaded file after processing
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: "Document uploaded and indexed successfully",
      data: result,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: error.message || "Failed to process document",
    });
  }
});

// Query the indexed documents
app.post("/api/query", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Question is required",
      });
    }

    console.log(`Processing query: ${question}`);

    const result = await queryDocument(question);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Query error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process query",
    });
  }
});

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 NotebookLM RAG Server running on http://localhost:${PORT}`);
  console.log(`📊 Qdrant URL: ${process.env.QDRANT_URL}`);
  console.log(`📚 Collection: ${process.env.QDRANT_COLLECTION_NAME}\n`);
});