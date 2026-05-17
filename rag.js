import "dotenv/config";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAI } from "openai";
import fs from "fs";

// Configuration
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "notebooklm-docs";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-large";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE) || 1000;
const CHUNK_OVERLAP = parseInt(process.env.CHUNK_OVERLAP) || 200;
const TOP_K = parseInt(process.env.TOP_K) || 5;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
});

/**
 * Check Qdrant connection
 */
export async function checkQdrantConnection() {
  try {
    await qdrantClient.getCollections();
    return true;
  } catch (error) {
    console.error("Qdrant connection error:", error.message);
    return false;
  }
}

/**
 * Load document based on file type
 */
async function loadDocument(filePath, fileType) {
  if (fileType === ".pdf") {
    const loader = new PDFLoader(filePath, {
      splitPages: true,
    });
    return await loader.load();
  } else if (fileType === ".txt") {
    // Manual text file loading for compatibility
    const text = fs.readFileSync(filePath, "utf-8");
    return [
      {
        pageContent: text,
        metadata: {
          source: filePath,
        },
      },
    ];
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Chunk documents with metadata
 */
async function chunkDocuments(docs, fileName) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const chunks = await textSplitter.splitDocuments(docs);

  // Enrich metadata
  const enrichedChunks = chunks.map((chunk, index) => {
    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        fileName: fileName,
        chunkNumber: index + 1,
        totalChunks: chunks.length,
        source: chunk.metadata.source || fileName,
        page: chunk.metadata.loc?.pageNumber || chunk.metadata.page || "N/A",
      },
    };
  });

  return enrichedChunks;
}

/**
 * Index document - complete RAG pipeline
 */
export async function indexDocument(filePath, fileName, fileType) {
  try {
    console.log(`\n📄 Loading document: ${fileName}`);

    // Step 1: Load document
    const docs = await loadDocument(filePath, fileType);
    console.log(`✅ Loaded ${docs.length} document(s)`);

    // Step 2: Chunk document
    const chunks = await chunkDocuments(docs, fileName);
    console.log(`✅ Created ${chunks.length} chunks`);

    // Step 3: Create embeddings
    console.log(`🔄 Creating embeddings...`);
    const embeddings = new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Step 4: Store in Qdrant
    console.log(`🔄 Storing in Qdrant...`);

    // Check if collection exists, if not create it
    try {
      await qdrantClient.getCollection(COLLECTION_NAME);
      console.log(`✅ Using existing collection: ${COLLECTION_NAME}`);
    } catch (error) {
      console.log(`📦 Creating new collection: ${COLLECTION_NAME}`);
    }

    // Store documents in Qdrant
    const vectorStore = await QdrantVectorStore.fromDocuments(
      chunks,
      embeddings,
      {
        url: QDRANT_URL,
        collectionName: COLLECTION_NAME,
      }
    );

    console.log(`✅ Indexing completed successfully`);

    return {
      fileName: fileName,
      fileType: fileType,
      documentsLoaded: docs.length,
      chunksCreated: chunks.length,
      collectionName: COLLECTION_NAME,
    };
  } catch (error) {
    console.error("Indexing error:", error);
    throw new Error(`Failed to index document: ${error.message}`);
  }
}

/**
 * Query document - retrieval and generation
 */
export async function queryDocument(userQuery) {
  try {
    console.log(`\n🔍 Processing query: "${userQuery}"`);

    // Step 1: Create embeddings instance
    const embeddings = new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    // Step 2: Connect to existing Qdrant collection
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: QDRANT_URL,
        collectionName: COLLECTION_NAME,
      }
    );

    // Step 3: Retrieve relevant chunks
    const retriever = vectorStore.asRetriever({
      k: TOP_K,
    });

    const retrievedDocs = await retriever.invoke(userQuery);
    console.log(`✅ Retrieved ${retrievedDocs.length} relevant chunks`);

    if (retrievedDocs.length === 0) {
      return {
        answer:
          "I don't have any documents indexed yet. Please upload a document first.",
        sources: [],
        retrievedChunks: 0,
      };
    }

    // Step 4: Prepare context from retrieved chunks
    const contextParts = retrievedDocs.map((doc, index) => {
      const metadata = doc.metadata;
      return `[Chunk ${index + 1}]
File: ${metadata.fileName}
Page: ${metadata.page}
Content: ${doc.pageContent}
`;
    });

    const context = contextParts.join("\n---\n");

    // Step 5: Create system prompt for LLM
    const systemPrompt = `You are an AI assistant that answers questions based ONLY on the provided context from uploaded documents.

Rules:
1. Answer questions using ONLY the information provided in the context below
2. If the answer cannot be found in the context, clearly state: "I cannot find this information in the uploaded document(s)."
3. Be specific and cite which file or page the information comes from when possible
4. Do not make up or infer information not present in the context
5. Provide clear, concise, and accurate answers
6. If the context is partially relevant, answer what you can and mention what's missing

Context from uploaded documents:
${context}`;

    // Step 6: Generate answer using OpenAI
    console.log(`🤖 Generating answer...`);
    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userQuery,
        },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const answer = response.choices[0].message.content;

    // Step 7: Prepare sources
    const sources = retrievedDocs.map((doc, index) => {
      return {
        chunkNumber: index + 1,
        fileName: doc.metadata.fileName,
        page: doc.metadata.page,
        content: doc.pageContent.substring(0, 200) + "...",
        relevanceScore: doc.metadata.score || "N/A",
      };
    });

    console.log(`✅ Answer generated successfully\n`);

    return {
      answer: answer,
      sources: sources,
      retrievedChunks: retrievedDocs.length,
      query: userQuery,
    };
  } catch (error) {
    console.error("Query error:", error);

    // Check if it's a collection not found error
    if (error.message.includes("Not found") || error.message.includes("doesn't exist")) {
      return {
        answer:
          "No documents have been indexed yet. Please upload a document first.",
        sources: [],
        retrievedChunks: 0,
      };
    }

    throw new Error(`Failed to process query: ${error.message}`);
  }
}
