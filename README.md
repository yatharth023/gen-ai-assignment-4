# NotebookLM-style RAG Application with Corrective RAG

A complete **Retrieval-Augmented Generation (RAG)** application inspired by Google's NotebookLM with **Corrective RAG (CRAG)** implementation. Upload PDF or text documents, and ask questions using either standard RAG or self-correcting CRAG with web search fallback.

Built with Node.js, LangChain, OpenAI, Qdrant vector database, and Tavily API.

---

## Features

- **📤 Document Upload**: Support for PDF and TXT files (up to 50MB)
- **🔄 Complete RAG Pipeline**:
  - Document parsing and loading
  - Intelligent text chunking with overlap
  - Vector embeddings generation
  - Storage in Qdrant vector database
  - Semantic search and retrieval
  - Context-aware answer generation
- **🎯 Grounded Responses**: Answers are generated only from uploaded documents
- **📊 Source Citations**: See exactly which chunks and pages were used to answer your question
- **🌐 Clean Web UI**: Beautiful, responsive interface with drag-and-drop upload
- **⚡ Production-Ready**: Complete error handling, validation, and logging
- **🔧 Corrective RAG (NEW)**:
  - LLM-based relevance evaluation
  - Automatic chunk quality scoring and filtering
  - Web search fallback via Tavily API
  - Self-correcting answer generation
  - Detailed metrics (evaluation status, refinement stats, web search usage)

---

## Architecture Overview

### RAG Pipeline Flow

```
1. Upload Document (PDF/TXT)
   ↓
2. Parse & Load
   ↓
3. Chunk with RecursiveCharacterTextSplitter
   ↓
4. Generate Embeddings (OpenAI text-embedding-3-large)
   ↓
5. Store in Qdrant Vector Database
   ↓
6. User Query → Generate Query Embedding
   ↓
7. Retrieve Top-K Similar Chunks
   ↓
8. Generate Answer with LLM (GPT-4o-mini)
   ↓
9. Return Answer + Sources
```

### Tech Stack

- **Backend**: Node.js, Express
- **RAG Framework**: LangChain JS
- **Embeddings**: OpenAI `text-embedding-3-large`
- **LLM**: OpenAI `gpt-4o-mini`
- **Vector Database**: Qdrant
- **Web Search**: Tavily API (optional)
- **File Processing**: pdf-parse, Multer
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

---

## Prerequisites

Before you begin, ensure you have:

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **Qdrant** vector database running locally
   - **Option A: Docker** (Recommended)
     ```bash
     docker run -p 6333:6333 qdrant/qdrant
     ```
   - **Option B: Docker Compose**
     ```bash
     # Create docker-compose.yml
     version: '3.8'
     services:
       qdrant:
         image: qdrant/qdrant
         ports:
           - "6333:6333"
         volumes:
           - ./qdrant_storage:/qdrant/storage

     # Run
     docker-compose up -d
     ```

3. **OpenAI API Key**
   - Get one at https://platform.openai.com/api-keys

---

## Installation & Setup

### Step 1: Clone or Navigate to Project Directory

```bash
cd /path/to/notebooklm-rag
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# OpenAI API Key (REQUIRED)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here

# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=notebooklm-docs

# Server Configuration
PORT=3000

# OpenAI Models
EMBEDDING_MODEL=text-embedding-3-large
LLM_MODEL=gpt-4o-mini

# Chunking Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=200

# Retrieval Configuration
TOP_K=5

# Corrective RAG Configuration (Optional)
RELEVANCE_THRESHOLD=0.5
TAVILY_API_KEY=your-tavily-api-key-here
```

**Note**: Get a free Tavily API key at [https://tavily.com](https://tavily.com) to enable web search fallback in Corrective RAG.

### Step 4: Start Qdrant

Make sure Qdrant is running:

```bash
# Check if Qdrant is accessible
curl http://localhost:6333/health
```

You should see: `{"title":"qdrant - vector search engine","version":"..."}`

---

## Running the Application

### Start the Server

```bash
npm start
```

You should see:

```
🚀 NotebookLM RAG Server running on http://localhost:3000
📊 Qdrant URL: http://localhost:6333
📚 Collection: notebooklm-docs
```

### Access the Application

Open your browser and navigate to:

```
http://localhost:3000
```

---

## Usage Guide

### 1. Upload a Document

- Click the upload area or drag & drop a PDF or TXT file
- Wait for the indexing process to complete
- You'll see a success message with the number of chunks created

### 2. Select RAG Mode

Choose between two modes:
- **Standard RAG**: Fast, uses all retrieved chunks
- **Corrective RAG**: Evaluates relevance, filters chunks, adds web search when needed

### 3. Ask Questions

- Type your question in the text area
- Click "Ask Question" or press `Ctrl+Enter`
- Wait for the AI to retrieve relevant information and generate an answer

### 4. View Results

- **CRAG Metrics** (Corrective RAG only):
  - Evaluation result (RELEVANT/AMBIGUOUS/IRRELEVANT)
  - Retrieved chunks count
  - Refined chunks count
  - Final chunks used
  - Web search usage indicator
- **Answer**: The AI-generated response based on your documents
- **Sources**: The specific chunks used to generate the answer, with:
  - File name
  - Page number or URL (for web results)
  - Relevance score (Corrective RAG only)
  - Chunk content preview

---

## Corrective RAG

For detailed information about the Corrective RAG implementation, see **[CRAG_README.md](./CRAG_README.md)**.

### Quick Overview

Corrective RAG adds three self-correction steps:
1. **Evaluate**: LLM judges if retrieved docs are RELEVANT/AMBIGUOUS/IRRELEVANT
2. **Refine**: Scores and filters individual chunks by relevance
3. **Augment**: Adds web search results when documents are insufficient

**Use Corrective RAG when:**
- Document relevance is uncertain
- You want higher accuracy
- External knowledge might help
- You need transparency (evaluation metrics)

**Use Standard RAG when:**
- Documents are known to be relevant
- Speed is critical
- Lower cost is preferred

---

## API Endpoints

### Health Check

```http
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "qdrant": "connected"
}
```

### Upload Document

```http
POST /api/upload
Content-Type: multipart/form-data

file: <PDF or TXT file>
```

Response:
```json
{
  "success": true,
  "message": "Document uploaded and indexed successfully",
  "data": {
    "fileName": "example.pdf",
    "fileType": ".pdf",
    "documentsLoaded": 1,
    "chunksCreated": 25,
    "collectionName": "notebooklm-docs"
  }
}
```

### Query Documents (Standard RAG)

```http
POST /api/query
Content-Type: application/json

{
  "question": "What is the main topic?"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "answer": "The main topic of the document is...",
    "sources": [...],
    "retrievedChunks": 5,
    "query": "What is the main topic?"
  }
}
```

### Query with Corrective RAG

```http
POST /api/query/crag
Content-Type: application/json

{
  "question": "What is the main topic?"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "answer": "The main topic of the document is...",
    "sources": [
      {
        "chunkNumber": 1,
        "source": "example.pdf",
        "fileName": "example.pdf",
        "page": 1,
        "url": null,
        "content": "Content preview...",
        "relevanceScore": "0.85"
      }
    ],
    "retrievedChunks": 5,
    "refinedChunks": 3,
    "finalChunks": 3,
    "evaluation": "RELEVANT",
    "webSearchUsed": false,
    "query": "What is the main topic?"
  }
}
```

---

## Configuration Options

### Chunking Parameters

- **CHUNK_SIZE**: Size of each text chunk (default: 1000 characters)
- **CHUNK_OVERLAP**: Overlap between chunks (default: 200 characters)

Adjust these in `.env` based on your document type:
- **Technical docs**: Larger chunks (1500-2000)
- **General text**: Medium chunks (800-1200)
- **Dense content**: Smaller chunks (500-800)

### Retrieval Parameters

- **TOP_K**: Number of chunks to retrieve (default: 5)

More chunks = more context but slower and more expensive.

### Model Selection

- **EMBEDDING_MODEL**:
  - `text-embedding-3-large` (best quality, more expensive)
  - `text-embedding-3-small` (faster, cheaper)

- **LLM_MODEL**:
  - `gpt-4o-mini` (fast and cost-effective)
  - `gpt-4o` (best quality, more expensive)
  - `gpt-4-turbo` (balanced)

---

## Project Structure

```
notebooklm-rag/
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables (create from .env.example)
├── .env.example          # Example environment configuration
├── server.js             # Express server with routes
├── rag.js                # Standard RAG pipeline implementation
├── crag.js               # Corrective RAG implementation (NEW)
├── public/               # Frontend assets
│   ├── index.html        # Main web interface with RAG mode selector
│   └── styles.css        # Styling
├── uploads/              # Temporary file storage (auto-created)
├── README.md             # This file
└── CRAG_README.md        # Corrective RAG documentation (NEW)
```

---

## Troubleshooting

### Qdrant Connection Error

**Error**: `Failed to connect to Qdrant`

**Solution**:
1. Ensure Qdrant is running: `docker ps`
2. Check the URL in `.env` matches your Qdrant instance
3. Test connection: `curl http://localhost:6333/health`

### OpenAI API Error

**Error**: `Invalid API key`

**Solution**:
1. Verify your API key in `.env` is correct
2. Check you have credits: https://platform.openai.com/account/usage
3. Ensure no extra spaces in the API key

### File Upload Fails

**Error**: `Only PDF and TXT files are allowed`

**Solution**:
1. Verify file extension is `.pdf` or `.txt`
2. Check file size is under 50MB
3. Ensure file is not corrupted

### No Answer Generated

**Error**: `I cannot find this information in the uploaded document(s).`

**Solution**:
1. This is expected when the answer isn't in your documents
2. Upload a relevant document first
3. Rephrase your question to match document content
4. Check if indexing completed successfully

---

## Development

### Run in Development Mode (with auto-restart)

```bash
npm run dev
```

### View Qdrant Collections

Access Qdrant dashboard at: http://localhost:6333/dashboard

### Debugging

Enable verbose logging by adding to `server.js`:

```javascript
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

---

## Advanced Features

### Multiple Documents

The system supports indexing multiple documents into the same collection. All documents are searchable together.

### Clear Collection

To start fresh, delete the Qdrant collection:

```bash
curl -X DELETE http://localhost:6333/collections/notebooklm-docs
```

### Custom Prompts

Modify the system prompt in `rag.js` (line ~207) to customize answer format and behavior.

---

## Performance Tips

1. **Chunk Size**: Adjust based on document type
2. **TOP_K**: Use 3-5 for specific questions, 5-10 for broad questions
3. **Embedding Model**: Use `text-embedding-3-small` for faster processing
4. **Caching**: Qdrant automatically caches vectors for faster retrieval

---

## Security Notes

- Never commit `.env` file to version control
- Validate file types and sizes on upload
- Rate limit API endpoints in production
- Use HTTPS in production environments
- Sanitize user inputs

---

## License

ISC

---

## Support

For issues and questions:
1. Check the Troubleshooting section
2. Review Qdrant logs: `docker logs <container-id>`
3. Check OpenAI API status: https://status.openai.com/

---

## Acknowledgments

- **LangChain** for RAG framework
- **OpenAI** for embeddings and LLM
- **Qdrant** for vector database
- **Google NotebookLM** for inspiration

---

**Built with ❤️ using Node.js and AI**
