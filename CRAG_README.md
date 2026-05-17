# Corrective RAG (CRAG) Implementation

## Overview

This project now includes a **Corrective RAG** implementation that adds self-reflection and error correction to the standard RAG pipeline. CRAG evaluates the quality of retrieved documents and dynamically decides the best strategy to answer queries.

## What is Corrective RAG?

Corrective RAG (CRAG) is an advanced RAG technique that:

1. **Evaluates Relevance**: Uses an LLM to judge if retrieved documents are relevant, ambiguous, or irrelevant
2. **Refines Knowledge**: Scores individual chunks and filters out low-relevance content
3. **Web Search Fallback**: Automatically searches the web when documents are insufficient
4. **Adaptive Generation**: Generates answers based on refined, high-quality context

### Key Differences from Standard RAG

| Feature | Standard RAG | Corrective RAG |
|---------|-------------|----------------|
| Document Evaluation | None | LLM-based relevance check |
| Chunk Filtering | Uses all retrieved chunks | Filters by relevance score |
| External Knowledge | None | Web search via Tavily API |
| Accuracy | Good | Better (self-correcting) |
| Latency | Fast | Slower (extra evaluation) |

## Architecture

### CRAG Pipeline Flow

```
1. User Query
   ↓
2. Retrieve Top-K Documents from Vector DB
   ↓
3. Evaluate Relevance (RELEVANT/AMBIGUOUS/IRRELEVANT)
   ↓
4. Decision Logic:
   │
   ├─ RELEVANT → Score chunks → Refine → Generate answer
   │
   ├─ AMBIGUOUS → Score chunks → Refine → Web search → Combine → Generate
   │
   └─ IRRELEVANT → Web search → Generate (or return no answer)
   ↓
5. Return Answer + Sources + Metrics
```

### Components

1. **`crag.js`**: Core CRAG implementation
   - `evaluateRelevance()`: LLM-based relevance evaluator
   - `scoreChunks()`: Individual chunk relevance scoring
   - `webSearch()`: Tavily API integration for web search
   - `refineKnowledge()`: Filters chunks by threshold
   - `correctiveRAGQuery()`: Main CRAG orchestrator

2. **API Endpoints**:
   - `/api/query` - Standard RAG (existing)
   - `/api/query/crag` - Corrective RAG (new)

3. **Frontend**: Radio button selector to choose between Standard RAG and Corrective RAG

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install
```

The new dependency added: `axios` (for Tavily web search API)

### 2. Configure Environment Variables

Update your `.env` file with CRAG-specific settings:

```env
# Corrective RAG Configuration
RELEVANCE_THRESHOLD=0.5          # Min score to keep a chunk (0.0-1.0)
TAVILY_API_KEY=tvly-xxxxx        # Optional: Get from https://tavily.com
```

**Note**: Web search is optional. If `TAVILY_API_KEY` is not provided, CRAG will still work but won't use web search fallback.

### 3. Get Tavily API Key (Optional)

1. Sign up at [https://tavily.com](https://tavily.com)
2. Get your API key from the dashboard
3. Add it to `.env` file

Without Tavily, CRAG will:
- Still evaluate relevance and filter chunks
- Skip web search when documents are irrelevant/ambiguous
- Log a warning when web search is attempted

## Usage

### Via Web UI

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Open** http://localhost:3000

3. **Upload a document** (PDF or TXT)

4. **Select RAG mode**:
   - **Standard RAG**: Fast, uses all retrieved chunks
   - **Corrective RAG**: Evaluates relevance, filters chunks, adds web search

5. **Ask your question** and see the results

### Via API

#### Standard RAG
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?"}'
```

#### Corrective RAG
```bash
curl -X POST http://localhost:3000/api/query/crag \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?"}'
```

## CRAG Response Format

Corrective RAG returns additional metadata:

```json
{
  "success": true,
  "data": {
    "answer": "The generated answer...",
    "sources": [
      {
        "chunkNumber": 1,
        "source": "document.pdf",
        "fileName": "document.pdf",
        "page": 2,
        "url": null,
        "content": "Chunk content...",
        "relevanceScore": "0.85"
      }
    ],
    "retrievedChunks": 5,      // Initial retrieval count
    "refinedChunks": 3,         // Chunks after filtering
    "finalChunks": 4,           // Final chunks used (refined + web)
    "evaluation": "RELEVANT",   // RELEVANT/AMBIGUOUS/IRRELEVANT
    "webSearchUsed": false,     // Whether web search was used
    "query": "Your question"
  }
}
```

## Configuration Parameters

### `RELEVANCE_THRESHOLD` (default: 0.5)

Controls how strict the chunk filtering is:
- **0.0-0.3**: Very lenient (keeps most chunks)
- **0.4-0.6**: Balanced (recommended)
- **0.7-1.0**: Very strict (only highest relevance)

Lower threshold = more chunks, more context, potentially more noise  
Higher threshold = fewer chunks, cleaner context, risk of missing info

### Evaluation Logic

| Evaluation | Action | Use Case |
|-----------|--------|----------|
| **RELEVANT** | Use refined doc chunks only | Documents fully answer the query |
| **AMBIGUOUS** | Use refined chunks + web search | Documents partially relevant |
| **IRRELEVANT** | Use web search only | Documents don't contain answer |

## Performance Considerations

### Latency

Corrective RAG adds overhead:
- **Relevance evaluation**: +1 LLM call (~1-2s)
- **Chunk scoring**: +N LLM calls (1 per chunk, parallelized ~2-4s)
- **Web search**: +1 API call (~1-2s, if used)

**Total**: Standard RAG ~2-3s → CRAG ~5-8s

### Cost

Additional OpenAI API calls:
- Relevance evaluation: ~500 tokens
- Chunk scoring: ~200 tokens × N chunks
- Example: 5 chunks = ~1,500 extra tokens/query

With `gpt-4o-mini`: ~$0.0002/query extra cost

### Optimization Tips

1. **Reduce TOP_K**: Fewer initial chunks = faster scoring
2. **Use gpt-4o-mini**: Much cheaper than gpt-4
3. **Cache evaluations**: Store relevance scores (future enhancement)
4. **Batch scoring**: Already implemented (parallel API calls)

## When to Use CRAG vs Standard RAG

### Use Standard RAG when:
- ✅ Documents are highly relevant
- ✅ Speed is critical
- ✅ Cost is a concern
- ✅ Simple, straightforward queries

### Use Corrective RAG when:
- ✅ Document relevance is uncertain
- ✅ Accuracy is more important than speed
- ✅ Queries might need external knowledge
- ✅ You want quality metrics and transparency

## Example Scenarios

### Scenario 1: Perfect Document Match
**Query**: "What is the capital of France?"  
**Document**: Contains "The capital of France is Paris"  

- **Standard RAG**: Returns correct answer ✅
- **Corrective RAG**: Evaluates as RELEVANT → Refines → Returns same answer ✅  
  *Adds latency with no benefit*

### Scenario 2: Partially Relevant Document
**Query**: "What are the side effects of aspirin?"  
**Document**: Mentions aspirin but not comprehensive on side effects  

- **Standard RAG**: Partial answer ⚠️
- **Corrective RAG**: Evaluates as AMBIGUOUS → Filters chunks → Searches web → Comprehensive answer ✅  
  *Significantly better*

### Scenario 3: Irrelevant Document
**Query**: "What is quantum computing?"  
**Document**: About classical computing only  

- **Standard RAG**: Hallucinated or wrong answer ❌
- **Corrective RAG**: Evaluates as IRRELEVANT → Searches web → Correct answer ✅  
  *Prevents hallucination*

## Troubleshooting

### Issue: "Web search not available"

**Cause**: `TAVILY_API_KEY` not set  
**Solution**: Add Tavily API key to `.env` or accept that web search won't work

### Issue: Too many chunks filtered out

**Cause**: `RELEVANCE_THRESHOLD` too high  
**Solution**: Lower threshold to 0.3-0.4

### Issue: CRAG is too slow

**Solutions**:
1. Reduce `TOP_K` (e.g., 3 instead of 5)
2. Increase `RELEVANCE_THRESHOLD` to score fewer chunks
3. Use Standard RAG for time-sensitive queries

### Issue: Evaluation always returns "AMBIGUOUS"

**Cause**: LLM being overly cautious or document quality issues  
**Solution**: 
1. Check document upload was successful
2. Try different/better quality documents
3. Adjust evaluation prompt in `crag.js` if needed

## Future Enhancements

Possible improvements:
- [ ] Cache relevance evaluations
- [ ] Add more web search providers (Bing, Google)
- [ ] Implement relevance threshold auto-tuning
- [ ] Add A/B testing between Standard RAG and CRAG
- [ ] Support streaming responses
- [ ] Add citation extraction from web results
- [ ] Implement confidence scores for answers

## Research References

Corrective RAG is based on the paper:
- **"Corrective Retrieval Augmented Generation"** (2024)
- Improves RAG robustness through self-correction
- Key insight: Not all retrieved documents are equally useful

## License

ISC

---

**Built with ❤️ using LangChain, OpenAI, Qdrant, and Tavily**
