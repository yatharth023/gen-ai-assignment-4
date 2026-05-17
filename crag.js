import "dotenv/config";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { OpenAI } from "openai";
import axios from "axios";

// Configuration
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME || "notebooklm-docs";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-large";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const TOP_K = parseInt(process.env.TOP_K) || 5;
const RELEVANCE_THRESHOLD = parseFloat(process.env.RELEVANCE_THRESHOLD) || 0.5;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: QDRANT_URL,
});

/**
 * Evaluate relevance of retrieved documents using LLM
 * Returns: 'relevant', 'ambiguous', or 'irrelevant'
 */
async function evaluateRelevance(query, retrievedDocs) {
  try {
    console.log(`🔍 Evaluating relevance of ${retrievedDocs.length} documents...`);

    const docsContext = retrievedDocs
      .map(
        (doc, idx) =>
          `Document ${idx + 1}:\n${doc.pageContent.substring(0, 500)}...`
      )
      .join("\n\n");

    const evaluationPrompt = `You are a relevance evaluator for a RAG system. Evaluate if the retrieved documents are relevant to answer the user's query.

Query: "${query}"

Retrieved Documents:
${docsContext}

Evaluate and respond with ONLY ONE of these three options:
- "RELEVANT" if the documents contain clear information to answer the query
- "AMBIGUOUS" if the documents are partially relevant but incomplete
- "IRRELEVANT" if the documents do not contain information to answer the query

Response (one word only):`;

    const response = await openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a document relevance evaluator. Respond with only one word: RELEVANT, AMBIGUOUS, or IRRELEVANT.",
        },
        {
          role: "user",
          content: evaluationPrompt,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const evaluation = response.choices[0].message.content.trim().toUpperCase();
    console.log(`✅ Relevance evaluation: ${evaluation}`);

    return evaluation;
  } catch (error) {
    console.error("Evaluation error:", error);
    return "AMBIGUOUS"; // Default to ambiguous on error
  }
}

/**
 * Score individual chunks for relevance
 */
async function scoreChunks(query, chunks) {
  try {
    console.log(`📊 Scoring ${chunks.length} chunks for relevance...`);

    const scoredChunks = await Promise.all(
      chunks.map(async (chunk, idx) => {
        const scorePrompt = `Rate the relevance of this document chunk to the query on a scale of 0.0 to 1.0.

Query: "${query}"

Document Chunk:
${chunk.pageContent.substring(0, 500)}

Respond with ONLY a number between 0.0 and 1.0 (e.g., 0.8):`;

        try {
          const response = await openai.chat.completions.create({
            model: LLM_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "You are a relevance scorer. Respond with only a decimal number between 0.0 and 1.0.",
              },
              {
                role: "user",
                content: scorePrompt,
              },
            ],
            temperature: 0,
            max_tokens: 5,
          });

          const scoreText = response.choices[0].message.content.trim();
          const score = parseFloat(scoreText);

          return {
            ...chunk,
            relevanceScore: isNaN(score) ? 0.5 : score,
          };
        } catch (error) {
          console.error(`Error scoring chunk ${idx}:`, error.message);
          return {
            ...chunk,
            relevanceScore: 0.5,
          };
        }
      })
    );

    console.log(`✅ Chunks scored successfully`);
    return scoredChunks;
  } catch (error) {
    console.error("Chunk scoring error:", error);
    return chunks.map((chunk) => ({ ...chunk, relevanceScore: 0.5 }));
  }
}

/**
 * Perform web search using Tavily API
 */
async function webSearch(query) {
  if (!TAVILY_API_KEY) {
    console.log("⚠️ Tavily API key not configured, skipping web search");
    return [];
  }

  try {
    console.log(`🌐 Performing web search for: "${query}"`);

    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        max_results: 3,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const results = response.data.results || [];
    console.log(`✅ Found ${results.length} web results`);

    return results.map((result, idx) => ({
      pageContent: result.content || result.snippet || "",
      metadata: {
        source: "web_search",
        url: result.url,
        title: result.title,
        chunkNumber: idx + 1,
        fileName: "Web Search Result",
        page: "N/A",
      },
    }));
  } catch (error) {
    console.error("Web search error:", error.message);
    return [];
  }
}

/**
 * Refine knowledge by filtering relevant chunks
 */
function refineKnowledge(scoredChunks, threshold = RELEVANCE_THRESHOLD) {
  const relevantChunks = scoredChunks.filter(
    (chunk) => chunk.relevanceScore >= threshold
  );

  console.log(
    `✅ Refined knowledge: ${relevantChunks.length}/${scoredChunks.length} chunks above threshold ${threshold}`
  );

  return relevantChunks;
}

/**
 * CRAG Query Pipeline
 */
export async function correctiveRAGQuery(userQuery) {
  try {
    console.log(`\n🚀 Starting Corrective RAG for query: "${userQuery}"`);

    // Step 1: Retrieve initial documents
    const embeddings = new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: QDRANT_URL,
        collectionName: COLLECTION_NAME,
      }
    );

    const retriever = vectorStore.asRetriever({
      k: TOP_K,
    });

    const retrievedDocs = await retriever.invoke(userQuery);
    console.log(`✅ Retrieved ${retrievedDocs.length} initial chunks`);

    if (retrievedDocs.length === 0) {
      return {
        answer:
          "I don't have any documents indexed yet. Please upload a document first.",
        sources: [],
        retrievedChunks: 0,
        evaluation: "NO_DOCS",
        webSearchUsed: false,
        refinedChunks: 0,
      };
    }

    // Step 2: Evaluate relevance
    const evaluation = await evaluateRelevance(userQuery, retrievedDocs);

    let finalDocs = [];
    let webSearchUsed = false;
    let refinedChunks = 0;

    // Step 3: Decision logic based on evaluation
    if (evaluation === "IRRELEVANT") {
      // Documents are irrelevant - try web search
      console.log("📌 Documents irrelevant, attempting web search...");
      const webResults = await webSearch(userQuery);

      if (webResults.length > 0) {
        finalDocs = webResults;
        webSearchUsed = true;
      } else {
        return {
          answer:
            "I cannot find relevant information in the uploaded documents, and web search is not available or returned no results.",
          sources: [],
          retrievedChunks: retrievedDocs.length,
          evaluation: evaluation,
          webSearchUsed: false,
          refinedChunks: 0,
        };
      }
    } else if (evaluation === "AMBIGUOUS") {
      // Documents are ambiguous - score and refine, then add web search
      console.log("📌 Documents ambiguous, refining and augmenting with web search...");

      const scoredChunks = await scoreChunks(userQuery, retrievedDocs);
      const refinedDocs = refineKnowledge(scoredChunks);
      refinedChunks = refinedDocs.length;

      const webResults = await webSearch(userQuery);
      webSearchUsed = webResults.length > 0;

      finalDocs = [...refinedDocs, ...webResults];
    } else {
      // Documents are relevant - score and refine only
      console.log("📌 Documents relevant, refining knowledge...");

      const scoredChunks = await scoreChunks(userQuery, retrievedDocs);
      const refinedDocs = refineKnowledge(scoredChunks);
      refinedChunks = refinedDocs.length;

      finalDocs = refinedDocs;
    }

    // Step 4: Generate answer with refined context
    if (finalDocs.length === 0) {
      return {
        answer:
          "After evaluating the documents, I cannot find sufficient relevant information to answer your question.",
        sources: [],
        retrievedChunks: retrievedDocs.length,
        evaluation: evaluation,
        webSearchUsed: webSearchUsed,
        refinedChunks: 0,
      };
    }

    const contextParts = finalDocs.map((doc, index) => {
      const metadata = doc.metadata;
      const score = doc.relevanceScore
        ? ` (Relevance: ${doc.relevanceScore.toFixed(2)})`
        : "";

      return `[Chunk ${index + 1}${score}]
Source: ${metadata.source || metadata.fileName}
${metadata.url ? `URL: ${metadata.url}` : `Page: ${metadata.page}`}
Content: ${doc.pageContent}
`;
    });

    const context = contextParts.join("\n---\n");

    const systemPrompt = `You are an AI assistant that answers questions based on the provided context from documents and web sources.

Rules:
1. Answer questions using the information provided in the context below
2. Synthesize information from multiple sources when available
3. Prioritize higher relevance scored chunks when present
4. If information from web sources is used, mention it clearly
5. Provide clear, accurate, and well-structured answers
6. Cite sources (file names, pages, or URLs) when possible

Context:
${context}`;

    console.log(`🤖 Generating corrective answer with ${finalDocs.length} chunks...`);

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
      max_tokens: 1500,
    });

    const answer = response.choices[0].message.content;

    // Prepare sources
    const sources = finalDocs.map((doc, index) => {
      const metadata = doc.metadata;
      return {
        chunkNumber: index + 1,
        source: metadata.source || metadata.fileName,
        fileName: metadata.fileName || "Web Search",
        page: metadata.page || "N/A",
        url: metadata.url || null,
        content: doc.pageContent.substring(0, 300) + "...",
        relevanceScore: doc.relevanceScore
          ? doc.relevanceScore.toFixed(2)
          : "N/A",
      };
    });

    console.log(`✅ Corrective RAG completed successfully\n`);

    return {
      answer: answer,
      sources: sources,
      retrievedChunks: retrievedDocs.length,
      refinedChunks: refinedChunks,
      finalChunks: finalDocs.length,
      evaluation: evaluation,
      webSearchUsed: webSearchUsed,
      query: userQuery,
    };
  } catch (error) {
    console.error("Corrective RAG error:", error);

    if (
      error.message.includes("Not found") ||
      error.message.includes("doesn't exist")
    ) {
      return {
        answer:
          "No documents have been indexed yet. Please upload a document first.",
        sources: [],
        retrievedChunks: 0,
        evaluation: "NO_DOCS",
        webSearchUsed: false,
      };
    }

    throw new Error(`Failed to process corrective RAG query: ${error.message}`);
  }
}
