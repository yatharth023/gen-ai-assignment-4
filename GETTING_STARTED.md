# Getting Started with Corrective RAG

## Quick Start (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example file and add your API keys:
```bash
cp .env.example .env
```

Edit `.env` and add:
```env
OPENAI_API_KEY=sk-your-actual-key-here
TAVILY_API_KEY=tvly-your-actual-key-here  # Optional
```

**Get API Keys:**
- OpenAI: https://platform.openai.com/api-keys
- Tavily (optional): https://tavily.com

### 3. Start Qdrant Vector Database

Using Docker:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

Verify it's running:
```bash
curl http://localhost:6333/health
```

### 4. Start the Application

```bash
npm start
```

Open http://localhost:3000 in your browser.

### 5. Try It Out!

1. **Upload a document** (drag & drop or click to browse)
2. **Select RAG mode**:
   - Start with "Standard RAG" to see baseline
   - Switch to "Corrective RAG" to see self-correction in action
3. **Ask questions** about your document

## What to Test

### Test Standard RAG
1. Upload a document
2. Select "Standard RAG"
3. Ask: "What is this document about?"
4. Note the response time and sources

### Test Corrective RAG - Relevant Documents
1. Keep the same document
2. Select "Corrective RAG"
3. Ask the same question
4. Observe:
   - Evaluation: should be "RELEVANT"
   - Relevance scores for each chunk
   - Refined chunks count
   - Similar answer but with quality metrics

### Test Corrective RAG - Irrelevant Query
1. Keep your document
2. Select "Corrective RAG"
3. Ask something NOT in the document (e.g., "What is quantum computing?")
4. Observe:
   - Evaluation: should be "IRRELEVANT"
   - Web search: should be "Used" (if Tavily key is set)
   - Sources: may include web results

### Test Corrective RAG - Ambiguous
Upload a partially relevant document and ask a question that's only partially covered.
- Evaluation: should be "AMBIGUOUS"
- Should see both refined chunks AND web results

## Understanding the Results

### CRAG Metrics Explained

```
┌──────────────────────────────────────┐
│ Evaluation: RELEVANT                 │  ← Overall quality assessment
│ Retrieved: 5 chunks                  │  ← Initial retrieval
│ Refined: 3 chunks                    │  ← After filtering
│ Final: 3 chunks                      │  ← Used for answer
│ Web Search: ❌ Not used              │  ← External knowledge
└──────────────────────────────────────┘
```

**Evaluation Types:**
- **RELEVANT**: Documents fully answer the query → Uses only refined doc chunks
- **AMBIGUOUS**: Documents partially relevant → Uses refined chunks + web search
- **IRRELEVANT**: Documents don't answer → Uses only web search (if available)

**Relevance Scores:**
- `0.7-1.0`: High relevance (very useful)
- `0.5-0.7`: Medium relevance (somewhat useful)
- `0.0-0.5`: Low relevance (filtered out by default)

## Configuration Tips

### For Better Accuracy
In `.env`:
```env
RELEVANCE_THRESHOLD=0.6    # Higher threshold = stricter filtering
TOP_K=7                    # More initial chunks
LLM_MODEL=gpt-4o           # Better model (more expensive)
```

### For Better Speed
In `.env`:
```env
RELEVANCE_THRESHOLD=0.4    # Lower threshold = less filtering
TOP_K=3                    # Fewer initial chunks
LLM_MODEL=gpt-4o-mini      # Faster model (cheaper)
```

### For Cost Savings
- Use Standard RAG when documents are known to be relevant
- Set `TOP_K=3` to reduce chunk scoring overhead
- Don't set `TAVILY_API_KEY` if you don't need web search

## Common Use Cases

### 1. Research Assistant
**Best Mode:** Corrective RAG with web search  
**Why:** Handles both document content and fills knowledge gaps

### 2. Document Q&A (known docs)
**Best Mode:** Standard RAG  
**Why:** Faster, documents are already relevant

### 3. Fact Verification
**Best Mode:** Corrective RAG  
**Why:** Shows relevance scores and evaluation confidence

### 4. Multi-Document Synthesis
**Best Mode:** Corrective RAG  
**Why:** Filters out low-quality chunks from multiple sources

## Troubleshooting

### "Qdrant connection error"
```bash
# Make sure Qdrant is running
docker ps
# Should show qdrant container

# Or start it
docker run -p 6333:6333 qdrant/qdrant
```

### "OpenAI API error"
- Check your API key in `.env` is correct
- Verify you have credits: https://platform.openai.com/account/usage

### "Web search not available"
- Add `TAVILY_API_KEY` to `.env` (optional)
- CRAG will still work without it

### CRAG is slow
- Normal! CRAG adds 5-8 seconds for evaluation and scoring
- Use Standard RAG if speed is critical
- Reduce `TOP_K` to 3 to speed up

### All chunks filtered out
- Lower `RELEVANCE_THRESHOLD` to 0.3-0.4
- Upload more relevant documents

## Next Steps

1. **Read the documentation**:
   - [README.md](./README.md) - Full project documentation
   - [CRAG_README.md](./CRAG_README.md) - Deep dive into Corrective RAG

2. **Experiment**:
   - Try different document types (technical docs, articles, books)
   - Test edge cases (empty docs, wrong topics, multilingual)
   - Compare Standard RAG vs Corrective RAG side-by-side

3. **Customize**:
   - Adjust relevance threshold in `.env`
   - Modify evaluation prompts in `crag.js`
   - Add more web search providers

4. **Integrate**:
   - Use the API endpoints in your app
   - Build a custom frontend
   - Add authentication and rate limiting

## API Examples

### Using cURL

**Standard RAG:**
```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?"}'
```

**Corrective RAG:**
```bash
curl -X POST http://localhost:3000/api/query/crag \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?"}'
```

### Using JavaScript/Fetch

```javascript
// Standard RAG
const standardResponse = await fetch('/api/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'What is this about?' })
});

// Corrective RAG
const cragResponse = await fetch('/api/query/crag', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'What is this about?' })
});

const data = await cragResponse.json();
console.log(data.data.evaluation);  // RELEVANT/AMBIGUOUS/IRRELEVANT
console.log(data.data.refinedChunks);  // Number of refined chunks
console.log(data.data.webSearchUsed);  // true/false
```

## Support

- **Issues**: Check existing documentation first
- **Performance**: See CRAG_README.md for optimization tips
- **API**: See README.md for full API documentation

---

**Happy RAG-ing! 🚀**
