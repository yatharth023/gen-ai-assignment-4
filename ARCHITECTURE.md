# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Browser)                       │
│  ┌────────────┐  ┌──────────────────────────────────────────┐  │
│  │ File Upload│  │  Query Interface                          │  │
│  │  (Drag &   │  │  ┌─────────────┐  ┌──────────────────┐  │  │
│  │   Drop)    │  │  │Standard RAG │  │ Corrective RAG   │  │  │
│  └────┬───────┘  │  └──────┬──────┘  └────────┬─────────┘  │  │
│       │          └─────────┼──────────────────┼────────────┘  │
└───────┼────────────────────┼──────────────────┼───────────────┘
        │                    │                  │
        │ POST               │ POST             │ POST
        │ /api/upload        │ /api/query       │ /api/query/crag
        │                    │                  │
┌───────▼────────────────────▼──────────────────▼───────────────┐
│                    Express Server (Node.js)                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  server.js                                              │  │
│  │  • Routes                                               │  │
│  │  • File upload handling (Multer)                        │  │
│  │  • Error handling                                       │  │
│  └──┬──────────────────┬─────────────────────┬────────────┘  │
│     │                  │                     │                │
│     │                  │                     │                │
│  ┌──▼─────┐  ┌─────────▼──────┐   ┌─────────▼──────────┐   │
│  │        │  │                 │   │                    │   │
│  │ rag.js │  │   crag.js       │   │  Standard RAG     │   │
│  │        │  │   (NEW!)        │   │  Pipeline         │   │
│  │        │  │                 │   │                    │   │
│  └────────┘  └─────────────────┘   └────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        │                   │
        │                   │
        ▼                   ▼
┌──────────────┐    ┌──────────────────┐
│   Qdrant     │    │  External APIs   │
│  Vector DB   │    │  • OpenAI        │
│              │    │  • Tavily        │
└──────────────┘    └──────────────────┘
```

## Standard RAG Pipeline

```
User Query
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Query Embedding                  │
│    • Convert query to vector        │
│    • OpenAI: text-embedding-3-large │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 2. Vector Search                    │
│    • Search Qdrant for similar docs │
│    • Retrieve TOP_K chunks          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 3. Context Preparation              │
│    • Format retrieved chunks        │
│    • Build system prompt            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 4. Answer Generation                │
│    • Send to LLM (gpt-4o-mini)      │
│    • Generate answer                │
└──────────────┬──────────────────────┘
               │
               ▼
          Response
```

## Corrective RAG Pipeline (CRAG)

```
User Query
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Initial Retrieval                │
│    • Query embedding                │
│    • Vector search in Qdrant        │
│    • Retrieve TOP_K chunks          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 2. Relevance Evaluation (LLM)       │
│    • Judge: RELEVANT/AMBIGUOUS/     │
│             IRRELEVANT              │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
   RELEVANT      AMBIGUOUS/IRRELEVANT
       │               │
       │               ▼
       │         ┌──────────────┐
       │         │ Web Search   │
       │         │ (Tavily API) │
       │         └──────┬───────┘
       │                │
       ▼                ▼
┌─────────────────────────────────────┐
│ 3. Knowledge Refinement             │
│    • Score each chunk (0.0-1.0)     │
│    • Filter by threshold (default   │
│      0.5)                            │
│    • Combine with web results       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 4. Context Preparation              │
│    • Format refined chunks          │
│    • Include relevance scores       │
│    • Build enhanced prompt          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ 5. Corrective Answer Generation     │
│    • Send to LLM with refined       │
│      context                        │
│    • Generate high-quality answer   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ Response with Metrics               │
│  • Answer                           │
│  • Sources (with scores)            │
│  • Evaluation result                │
│  • Refinement stats                 │
│  • Web search indicator             │
└─────────────────────────────────────┘
```

## Decision Logic in CRAG

```
                Retrieve Documents
                        │
                        ▼
                Evaluate Relevance
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
    RELEVANT       AMBIGUOUS       IRRELEVANT
        │               │               │
        │               │               │
        ▼               ▼               ▼
   Score & Refine  Score & Refine   Web Search Only
   Documents       Documents        (if available)
        │               │               │
        │               │               │
        │               ▼               │
        │          Web Search           │
        │          (add results)        │
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
                Generate Answer
                        │
                        ▼
              Return with Metrics
```

## Data Flow: Document Upload

```
┌─────────────┐
│   User      │
│   Uploads   │
│ PDF/TXT File│
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│ 1. File Validation              │
│    • Check type (.pdf, .txt)    │
│    • Check size (max 50MB)      │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. Document Loading             │
│    • PDFLoader for PDF          │
│    • fs.readFile for TXT        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. Text Chunking                │
│    • RecursiveCharacterText     │
│      Splitter                   │
│    • Size: 1000 chars           │
│    • Overlap: 200 chars         │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. Embedding Generation         │
│    • OpenAI embeddings          │
│    • Model: text-embedding-     │
│      3-large                    │
│    • Parallel processing        │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 5. Vector Storage               │
│    • Store in Qdrant            │
│    • Collection: notebooklm-docs│
│    • Include metadata           │
└──────┬──────────────────────────┘
       │
       ▼
   Success Response
   (chunks created count)
```

## Component Interactions

### Standard RAG (rag.js)

```javascript
Functions:
├── checkQdrantConnection()
│   └── Verify Qdrant availability
│
├── loadDocument(filePath, fileType)
│   └── Load PDF or TXT files
│
├── chunkDocuments(docs, fileName)
│   └── Split into overlapping chunks
│
├── indexDocument(filePath, fileName, fileType)
│   ├── Load
│   ├── Chunk
│   ├── Embed
│   └── Store in Qdrant
│
└── queryDocument(userQuery)
    ├── Retrieve similar chunks
    ├── Build context
    └── Generate answer with LLM
```

### Corrective RAG (crag.js)

```javascript
Functions:
├── evaluateRelevance(query, retrievedDocs)
│   └── LLM judges: RELEVANT/AMBIGUOUS/IRRELEVANT
│
├── scoreChunks(query, chunks)
│   └── Score each chunk 0.0-1.0
│
├── webSearch(query)
│   └── Tavily API search (optional)
│
├── refineKnowledge(scoredChunks, threshold)
│   └── Filter chunks by score
│
└── correctiveRAGQuery(userQuery)
    ├── Initial retrieval
    ├── Evaluate relevance
    ├── Score & refine chunks
    ├── Web search (if needed)
    ├── Prepare enhanced context
    └── Generate corrective answer
```

## API Routes

```
GET  /api/health
     └── Check system health & Qdrant connection

POST /api/upload
     └── Upload and index document
         Request: multipart/form-data (file)
         Response: {
           success, message, data: {
             fileName, fileType,
             documentsLoaded, chunksCreated
           }
         }

POST /api/query
     └── Standard RAG query
         Request: { question: string }
         Response: {
           success, data: {
             answer, sources, retrievedChunks
           }
         }

POST /api/query/crag
     └── Corrective RAG query
         Request: { question: string }
         Response: {
           success, data: {
             answer, sources,
             retrievedChunks, refinedChunks,
             finalChunks, evaluation,
             webSearchUsed
           }
         }
```

## Technology Stack Details

### Backend
- **Node.js**: Runtime environment
- **Express**: Web server framework
- **Multer**: File upload middleware

### RAG Framework
- **LangChain JS**: RAG orchestration
  - Document loaders (PDF, TXT)
  - Text splitters
  - Vector store connectors
  - Retrieval chains

### AI/ML Services
- **OpenAI API**:
  - Embeddings: `text-embedding-3-large` (1536 dimensions)
  - LLM: `gpt-4o-mini` (fast, cost-effective)
  - Temperature: 0.3 (balanced creativity/consistency)

- **Tavily API** (optional):
  - Web search for external knowledge
  - Search depth: basic (fast)
  - Max results: 3

### Database
- **Qdrant**:
  - Vector similarity search
  - Collection-based organization
  - RESTful API
  - In-memory or persistent storage

### Frontend
- **Vanilla JavaScript**: No framework overhead
- **HTML5**: Drag & drop API
- **CSS3**: Responsive design, gradients, animations

## Performance Characteristics

### Standard RAG
- **Latency**: ~2-3 seconds
- **API Calls**: 2 (embedding + LLM)
- **Cost per query**: ~$0.0003 (with gpt-4o-mini)

### Corrective RAG
- **Latency**: ~5-8 seconds
- **API Calls**: 4-8 (embedding + evaluation + N×scoring + LLM)
- **Cost per query**: ~$0.0005 (50% more than standard)

### Scalability
- **Bottleneck**: OpenAI API rate limits
- **Qdrant**: Handles millions of vectors
- **Node.js**: Single-threaded, use cluster for scaling
- **Optimization**: Implement caching, batch processing

## Security Considerations

### Environment Variables
- API keys stored in `.env`
- `.env` in `.gitignore`
- Never commit secrets

### File Upload
- Type validation (PDF, TXT only)
- Size limit (50MB)
- Files deleted after processing
- Temporary storage only

### API Security (Production TODOs)
- [ ] Add rate limiting
- [ ] Implement authentication
- [ ] Use HTTPS
- [ ] Input sanitization
- [ ] CORS configuration

### Data Privacy
- Documents stored in Qdrant (local by default)
- No data sent to third parties (except OpenAI/Tavily)
- Embeddings are non-reversible
- Consider encryption at rest

## Monitoring & Debugging

### Logs
- Upload progress
- Chunking statistics
- Retrieval results
- Evaluation outcomes
- Error traces

### Metrics to Track
- Query latency
- Relevance evaluation distribution
- Web search frequency
- Chunk refinement ratio
- Error rates

### Health Checks
- Qdrant connectivity
- OpenAI API status
- Tavily API status
- Collection existence

---

For implementation details, see:
- [README.md](./README.md) - Setup & usage
- [CRAG_README.md](./CRAG_README.md) - CRAG deep dive
- [GETTING_STARTED.md](./GETTING_STARTED.md) - Quick start guide
