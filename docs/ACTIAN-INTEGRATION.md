# NotebookLM-Web × Actian VectorAI DB — Integration Plan

## Current State

NotebookLM-Web is a Next.js 16 research assistant. Users upload documents (PDF, links, text), the app chunks and embeds them with Google `text-embedding-004` (768d), stores the vectors in **PostgreSQL pgvector**, and retrieves them for RAG chat with Gemini 2.5 Flash.

**The problem:** pgvector does sequential scan on every query. No HNSW index. No hybrid search. No named vectors. Scales to ~50K chunks then degrades. Every user query does a full-table O(n) scan.

## What Changes with Actian VectorAI DB

### The Core Swap

```
BEFORE:
  User asks question
  → Embed query (768d, Google API)
  → SQL: SELECT ... WHERE embedding <=> query_vec ORDER BY distance LIMIT 8
  → Full table scan across ALL chunks in the notebook
  → Return top 8 chunks
  → Feed to Gemini for answer

AFTER:
  User asks question
  → Embed query (768d, Google API)
  → Actian: search("notebook_chunks", vector=query_vec, using="content",
            filter=Field("notebook_id").eq(notebook_id), limit=8)
  → HNSW approximate search (sub-linear, <10ms)
  → Return top 8 chunks
  → Feed to Gemini for answer
```

Same embedding model. Same dimensions. Same LLM. But the retrieval goes from O(n) scan to O(log n) HNSW lookup.

### Named Vectors — Why They Matter Here

Documents have structure. A PDF has:
- A **title** (what the document claims to be about)
- **Section headers** (structural navigation)
- **Body text** (the actual content)
- **References/citations** (what it builds on)

Right now, all of this is mashed into one 768d vector per chunk. But when a user asks "What does the methodology section say?", they need **structural search** (find chunks from the methodology section), not **content search** (find chunks semantically similar to "methodology").

```python
# Collection: notebook_chunks
vectors_config = {
    "content":   VectorParams(size=768, distance=Distance.Cosine),  # What the text says
    "structure": VectorParams(size=384, distance=Distance.Cosine),  # Section/position context
}

# When storing a chunk:
PointStruct(
    id=chunk_id,
    vector={
        "content":   google_embedding_768d,        # Full content embedding
        "structure": minilm_embedding_384d,         # "Section 3.2: Methods, page 4 of 12"
    },
    payload={
        "notebook_id": notebook_id,
        "source_id":   source_id,
        "ordinal":     chunk_ordinal,
        "content":     chunk_text,
        "section":     "Methods",
        "page":        4,
        "source_title": "DAPA-HF Trial Results",
    },
)
```

Now you can search content and structure independently:
- "What are the key findings?" → search `content` space
- "What's in the methodology section?" → search `structure` space
- "What does Table 3 show?" → sparse keyword search for "Table 3"

### Hybrid Search — Why It Matters Here

Documents contain things that need exact matching:
- **Table references:** "Table 3", "Figure 2a"
- **Equations:** "E = mc²", "p < 0.05"
- **Citations:** "[Smith et al., 2023]"
- **Code snippets:** `import pandas as pd`
- **Acronyms:** "SGLT2i", "HFrEF", "LVEF"

Dense vectors normalize these away. "Table 3" becomes "data presentation" in vector space. Sparse BM25 vectors catch them exactly.

```python
# User asks: "What does Table 3 show about mortality rates?"

# Dense search finds: chunks about mortality, outcomes, statistical results
# Sparse search finds: chunks literally containing "Table 3"
# Fused: the chunk that IS Table 3 AND discusses mortality → top result
```

### Filtered Search — Multi-Notebook Isolation

Currently, pgvector queries filter by `notebook_id` in SQL WHERE. With Actian:

```python
# Filter at the vector search level — not post-filtering
results = client.points.search(
    "notebook_chunks",
    vector=query_vec,
    using="content",
    filter=FilterBuilder()
        .must(Field("notebook_id").eq(notebook_id))
        .must(Field("source_id").any_of(selected_source_ids))  # User selected specific sources
        .build(),
    limit=8,
)
```

This means:
- Multi-notebook support with zero cross-contamination
- User can select specific sources within a notebook to search
- Filter by document type, section, page range
- All at the vector index level, not post-retrieval filtering

## What Stays the Same

| Component | Changes? | Notes |
|---|---|---|
| Frontend (React/Next.js) | No | Chat UI, source panel unchanged |
| Document parsing (unpdf, readability) | No | Same PDF/HTML extraction |
| Chunking (800 tokens, 120 overlap) | No | Same chunking strategy |
| Embedding model (text-embedding-004, 768d) | No | Same model, same dimensions |
| LLM (Gemini 2.5 Flash) | No | Same chat model |
| Auth (Better Auth) | No | Same auth |
| PostgreSQL (Neon) | Partial | Keep for metadata, remove pgvector column |
| Storage (R2/Supabase/local) | No | Same file storage |

## What Changes

| Component | Before | After |
|---|---|---|
| Vector storage | pgvector column in `source_chunks` | Actian VectorAI DB collection |
| Vector search | SQL `<=>` operator (O(n) scan) | HNSW search (<10ms) |
| Embedding dimensions | 768d single vector | 768d content + 384d structure (named) |
| Keyword matching | None | BM25 sparse vectors |
| Cross-source search | SQL WHERE filter | Actian FilterBuilder (index-level) |
| Retrieval code | `src/lib/retrieve.ts` | New Actian client wrapper |
| Ingest pipeline | Store embedding in pgvector | Store in Actian + metadata in Postgres |

## Architecture After Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 16 Frontend                       │
│  Upload → Chat → Deep Research → Studio                     │
└──────────────────────────┬──────────────────────────────────┘
                           │ tRPC / API routes
┌──────────────────────────▼──────────────────────────────────┐
│                    Next.js API Layer                          │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Upload  │  │   Chat    │  │  Deep    │  │  Studio   │  │
│  │  /ingest │  │   /RAG    │  │ Research │  │  /gen     │  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └───────────┘  │
│       │              │              │                        │
│  ┌────▼──────────────▼──────────────▼────────────────────┐  │
│  │              Retrieval Layer (NEW)                     │  │
│  │                                                       │  │
│  │  embed(query) → search Actian → get chunk IDs         │  │
│  │  → fetch content from PostgreSQL → format for LLM     │  │
│  └───────────────────┬───────────────────────────────────┘  │
└──────────────────────┼──────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   ┌────────────┐ ┌─────────┐ ┌──────────┐
   │   Actian   │ │  Neon   │ │ Supabase │
   │ VectorAI DB│ │PostgreSQL│ │ Storage  │
   │            │ │         │ │          │
   │ Vectors +  │ │Metadata │ │  Files   │
   │ Payload    │ │ Users   │ │ (PDF,etc)│
   │ Filters    │ │ Chat    │ │          │
   └────────────┘ └─────────┘ └──────────┘
```

## Implementation Steps

### Step 1: Add Actian client wrapper (Python sidecar or Node gRPC)

The NotebookLM-web is a TypeScript/Bun project. Actian VectorAI DB has a Python SDK. Two options:

**Option A: Python sidecar** (recommended)
- Small FastAPI/Flask service that wraps Actian operations
- Next.js calls it over HTTP
- Same pattern as the Hercules sidecar

**Option B: Direct gRPC from Node**
- Use `@grpc/grpc-js` to talk to Actian's gRPC API directly
- More complex, but no extra process

### Step 2: Modify ingest pipeline

In `src/lib/ingest/embed.ts`:
- After generating Google embeddings (768d), also generate structure embeddings (384d via MiniLM)
- POST both to the Actian sidecar instead of inserting into pgvector
- Keep chunk text in PostgreSQL (for display)

### Step 3: Modify retrieval

In `src/lib/retrieve.ts`:
- Replace pgvector SQL query with Actian hybrid search call
- Parse results → fetch full chunk content from PostgreSQL by chunk ID
- Format for LLM (same as current)

### Step 4: Remove pgvector dependency

- Drop the `embedding` column from `source_chunks` table
- Remove `pgvector` from `package.json`
- Migration: for existing data, re-embed and store in Actian

## Hackathon Value

This integration shows Actian VectorAI DB as a **drop-in upgrade** for any app currently using pgvector:
- Same embedding model, same dimensions
- Better performance (HNSW vs sequential scan)
- New capabilities (named vectors, hybrid search, filtered search)
- Clear before/after benchmark
