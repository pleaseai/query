# Query — Hybrid Search Engine with AI SDK Integration

> A fork of [tobi/qmd](https://github.com/tobi/qmd) with AI SDK provider integration for flexible embedding, reranking, and query expansion across local and cloud models.

An on-device search engine for everything you need to remember. Index your markdown notes, meeting transcripts, documentation, and knowledge bases. Search with keywords or natural language. Ideal for your agentic flows.

Query combines BM25 full-text search, vector semantic search, and LLM re-ranking — all powered by a plugin-based AI provider architecture via [Vercel AI SDK](https://sdk.vercel.ai/).

## What's Different from QMD

- **AI SDK Integration**: Embedding, reranking, and query expansion via Vercel AI SDK — supports OpenAI, Cohere, Google, Anthropic, and any AI SDK-compatible provider
- **Hybrid Model Support**: Mix local GGUF models and cloud providers per task (e.g., local embedding + cloud reranking)
- **Extensible Provider Architecture**: Plugin-based LLMProvider interface for custom backends
- **Package**: Published as `@pleaseai/query` (instead of `@tobilu/qmd`)

## Quick Start

```sh
# Install globally
npm install -g @pleaseai/query
# or
bun install -g @pleaseai/query

# Or run directly
npx @pleaseai/query ...
bunx @pleaseai/query ...

# Create collections for your notes, docs, and meeting transcripts
query collection add ~/notes --name notes
query collection add ~/Documents/meetings --name meetings
query collection add ~/work/docs --name docs

# Add context to help with search results
query context add qmd://notes "Personal notes and ideas"
query context add qmd://meetings "Meeting transcripts and notes"
query context add qmd://docs "Work documentation"

# Generate embeddings for semantic search
query embed

# Search across everything
query search "project timeline"           # Fast keyword search
query vsearch "how to deploy"             # Semantic search
query query "quarterly planning process"  # Hybrid + reranking (best quality)

# Get a specific document
query get "meetings/2024-01-15.md"

# Get a document by docid (shown in search results)
query get "#abc123"

# Get multiple documents by glob pattern
query multi-get "journals/2025-05*.md"

# Search within a specific collection
query search "API" -c notes

# Export all matches for an agent
query search "API" --all --files --min-score 0.3
```

### Using with AI Agents

Query's `--json` and `--files` output formats are designed for agentic workflows:

```sh
# Get structured results for an LLM
query search "authentication" --json -n 10

# List all relevant files above a threshold
query query "error handling" --all --files --min-score 0.4

# Retrieve full document content
query get "docs/api-reference.md" --full
```

### MCP Server

Query exposes an MCP (Model Context Protocol) server for tighter integration with AI agents.

**Tools exposed:**
- `query` — Search with typed sub-queries (`lex`/`vec`/`hyde`), combined via RRF + reranking
- `get` — Retrieve a document by path or docid (with fuzzy matching suggestions)
- `multi_get` — Batch retrieve by glob pattern, comma-separated list, or docids
- `status` — Index health and collection info

**Claude Desktop configuration** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "query": {
      "command": "query",
      "args": ["mcp"]
    }
  }
}
```

**Claude Code** — Configure MCP in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "query": {
      "command": "query",
      "args": ["mcp"]
    }
  }
}
```

#### HTTP Transport

By default, the MCP server uses stdio. For a shared, long-lived server that avoids repeated model loading, use the HTTP transport:

```sh
# Foreground (Ctrl-C to stop)
query mcp --http                    # localhost:8181
query mcp --http --port 8080        # custom port

# Background daemon
query mcp --http --daemon           # start, writes PID to ~/.cache/query/mcp.pid
query mcp stop                      # stop via PID file
query status                        # shows "MCP: running (PID ...)" when active
```

The HTTP server exposes two endpoints:
- `POST /mcp` — MCP Streamable HTTP (JSON responses, stateless)
- `GET /health` — liveness check with uptime

LLM models stay loaded in VRAM across requests. Embedding/reranking contexts are disposed after 5 min idle and transparently recreated on the next request (~1s penalty, models remain loaded).

### SDK / Library Usage

Use Query as a library in your own Node.js or Bun applications.

#### Installation

```sh
npm install @pleaseai/query
```

#### Quick Start

```typescript
import { createStore } from '@pleaseai/query'

const store = await createStore({
  dbPath: './my-index.sqlite',
  config: {
    collections: {
      docs: { path: '/path/to/docs', pattern: '**/*.md' },
    },
  },
})

const results = await store.search({ query: "authentication flow" })
console.log(results.map(r => `${r.title} (${Math.round(r.score * 100)}%)`))

await store.close()
```

#### Store Creation

`createStore()` accepts three modes:

```typescript
import { createStore } from '@pleaseai/query'

// 1. Inline config — no files needed besides the DB
const store = await createStore({
  dbPath: './index.sqlite',
  config: {
    collections: {
      docs: { path: '/path/to/docs', pattern: '**/*.md' },
      notes: { path: '/path/to/notes' },
    },
  },
})

// 2. YAML config file — collections defined in a file
const store2 = await createStore({
  dbPath: './index.sqlite',
  configPath: './query.yml',
})

// 3. DB-only — reopen a previously configured store
const store3 = await createStore({ dbPath: './index.sqlite' })
```

#### Search

The unified `search()` method handles both simple queries and pre-expanded structured queries:

```typescript
// Simple query — auto-expanded via LLM, then BM25 + vector + reranking
const results = await store.search({ query: "authentication flow" })

// With options
const results2 = await store.search({
  query: "rate limiting",
  intent: "API throttling and abuse prevention",
  collection: "docs",
  limit: 5,
  minScore: 0.3,
  explain: true,
})

// Pre-expanded queries — skip auto-expansion, control each sub-query
const results3 = await store.search({
  queries: [
    { type: 'lex', query: '"connection pool" timeout -redis' },
    { type: 'vec', query: 'why do database connections time out under load' },
  ],
  collections: ["docs", "notes"],
})

// Skip reranking for faster results
const fast = await store.search({ query: "auth", rerank: false })
```

For direct backend access:

```typescript
// BM25 keyword search (fast, no LLM)
const lexResults = await store.searchLex("auth middleware", { limit: 10 })

// Vector similarity search (embedding model, no reranking)
const vecResults = await store.searchVector("how users log in", { limit: 10 })

// Manual query expansion for full control
const expanded = await store.expandQuery("auth flow", { intent: "user login" })
const results4 = await store.search({ queries: expanded })
```

#### Retrieval

```typescript
// Get a document by path or docid
const doc = await store.get("docs/readme.md")
const byId = await store.get("#abc123")

if (!("error" in doc)) {
  console.log(doc.title, doc.displayPath, doc.context)
}

// Get document body with line range
const body = await store.getDocumentBody("docs/readme.md", {
  fromLine: 50,
  maxLines: 100,
})

// Batch retrieve by glob or comma-separated list
const { docs, errors } = await store.multiGet("docs/**/*.md", {
  maxBytes: 20480,
})
```

#### Collections

```typescript
// Add a collection
await store.addCollection("myapp", {
  path: "/src/myapp",
  pattern: "**/*.ts",
  ignore: ["node_modules/**", "*.test.ts"],
})

// List collections with document stats
const collections = await store.listCollections()

// Get names of collections included in queries by default
const defaults = await store.getDefaultCollectionNames()

// Remove / rename
await store.removeCollection("myapp")
await store.renameCollection("old-name", "new-name")
```

#### Context

Context adds descriptive metadata that improves search relevance and is returned alongside results:

```typescript
// Add context for a path within a collection
await store.addContext("docs", "/api", "REST API reference documentation")

// Set global context (applies to all collections)
await store.setGlobalContext("Internal engineering documentation")

// List all contexts
const contexts = await store.listContexts()

// Remove context
await store.removeContext("docs", "/api")
await store.setGlobalContext(undefined)  // clear global
```

#### Indexing

```typescript
// Re-index collections by scanning the filesystem
const result = await store.update({
  collections: ["docs"],  // optional — defaults to all
  onProgress: ({ collection, file, current, total }) => {
    console.log(`[${collection}] ${current}/${total} ${file}`)
  },
})

// Generate vector embeddings
const embedResult = await store.embed({
  force: false,           // true to re-embed everything
  chunkStrategy: "auto",  // "regex" (default) or "auto" (AST for code files)
  onProgress: ({ current, total, collection }) => {
    console.log(`Embedding ${current}/${total}`)
  },
})
```

#### Lifecycle

```typescript
// Close the store — disposes LLM models and DB connection
await store.close()
```

The SDK requires explicit `dbPath` — no defaults are assumed. This makes it safe to embed in any application without side effects.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Query Hybrid Search Pipeline                         │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   User Query    │
                              └────────┬────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
               ┌────────────────┐            ┌────────────────┐
               │ Query Expansion│            │  Original Query│
               │  (AI SDK)     │            │   (×2 weight)  │
               └───────┬────────┘            └───────┬────────┘
                       │                             │
                       │ 2 alternative queries       │
                       └──────────────┬──────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
     │ Original Query  │     │ Expanded Query 1│     │ Expanded Query 2│
     └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
              │                       │                       │
      ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐
      ▼               ▼       ▼               ▼       ▼               ▼
  ┌───────┐       ┌───────┐ ┌───────┐     ┌───────┐ ┌───────┐     ┌───────┐
  │ BM25  │       │Vector │ │ BM25  │     │Vector │ │ BM25  │     │Vector │
  │(FTS5) │       │Search │ │(FTS5) │     │Search │ │(FTS5) │     │Search │
  └───┬───┘       └───┬───┘ └───┬───┘     └───┬───┘ └───┬───┘     └───┬───┘
      │               │         │             │         │             │
      └───────┬───────┘         └──────┬──────┘         └──────┬──────┘
              │                        │                       │
              └────────────────────────┼───────────────────────┘
                                       │
                                       ▼
                          ┌───────────────────────┐
                          │   RRF Fusion + Bonus  │
                          │  Original query: ×2   │
                          │  Top-rank bonus: +0.05│
                          │     Top 30 Kept       │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │    LLM Re-ranking     │
                          │    (via AI SDK)       │
                          │  Yes/No + logprobs    │
                          └───────────┬───────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  Position-Aware Blend │
                          │  Top 1-3:  75% RRF    │
                          │  Top 4-10: 60% RRF    │
                          │  Top 11+:  40% RRF    │
                          └───────────────────────┘
```

## Score Normalization & Fusion

### Search Backends

| Backend | Raw Score | Conversion | Range |
|---------|-----------|------------|-------|
| **FTS (BM25)** | SQLite FTS5 BM25 | `Math.abs(score)` | 0 to ~25+ |
| **Vector** | Cosine distance | `1 / (1 + distance)` | 0.0 to 1.0 |
| **Reranker** | LLM 0-10 rating | `score / 10` | 0.0 to 1.0 |

### Fusion Strategy

The `query` command uses **Reciprocal Rank Fusion (RRF)** with position-aware blending:

1. **Query Expansion**: Original query (×2 for weighting) + 1 LLM variation
2. **Parallel Retrieval**: Each query searches both FTS and vector indexes
3. **RRF Fusion**: Combine all result lists using `score = Σ(1/(k+rank+1))` where k=60
4. **Top-Rank Bonus**: Documents ranking #1 in any list get +0.05, #2-3 get +0.02
5. **Top-K Selection**: Take top 30 candidates for reranking
6. **Re-ranking**: LLM scores each document (yes/no with logprobs confidence)
7. **Position-Aware Blending**:
   - RRF rank 1-3: 75% retrieval, 25% reranker (preserves exact matches)
   - RRF rank 4-10: 60% retrieval, 40% reranker
   - RRF rank 11+: 40% retrieval, 60% reranker (trust reranker more)

### Score Interpretation

| Score | Meaning |
|-------|---------|
| 0.8 - 1.0 | Highly relevant |
| 0.5 - 0.8 | Moderately relevant |
| 0.2 - 0.5 | Somewhat relevant |
| 0.0 - 0.2 | Low relevance |

## Requirements

### System Requirements

- **Node.js** >= 22
- **Bun** >= 1.0.0
- **macOS**: Homebrew SQLite (for extension support)
  ```sh
  brew install sqlite
  ```

### AI SDK Providers

Query uses Vercel AI SDK for model inference. Configure providers as needed:

| Provider | Package | Use Cases |
|----------|---------|-----------|
| OpenAI | `@ai-sdk/openai` | Embedding, generation |
| Cohere | `@ai-sdk/cohere` | Reranking |
| Local GGUF | `node-llama-cpp` (optional) | Offline embedding, reranking, generation |
| Hugging Face TEI | built-in (self-hosted) | Embedding, reranking via native `/embed` and `/rerank` |

### Hugging Face TEI (Text Embeddings Inference)

Query ships with a built-in `TEIProvider` that talks to a self-hosted [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) server using its native API. No AI SDK or OpenAI-compatible shim is involved — requests go straight to `/embed` and `/rerank`, which lets you pass TEI-specific options like `truncation_direction` and `prompt_name`.

Start a TEI server (CPU image shown):

```sh
docker run --rm -p 8080:80 \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-en-v1.5
```

Use it from your code:

```typescript
import { TEIProvider } from '@pleaseai/query'

const tei = new TEIProvider({
  baseUrl: 'http://localhost:8080',
  // Defaults shown — tune per model:
  truncate: true,
  truncationDirection: 'Right',
  normalize: true,
  // promptName: 'query',          // for E5/BGE-style prompt prefixes
  // maxBatchSize: 32,
  // timeoutMs: 30_000,
})

const vector = await tei.embed('authentication flow')
const ranked = await tei.rerank('rate limiting', [
  { file: 'a.md', text: 'Throttle requests per minute.' },
  { file: 'b.md', text: 'User sessions expire after 30 days.' },
])
```

The provider is self-hosted first-class: no API key handling is built in, and non-2xx responses / network failures return `null` so the search pipeline falls back to BM25-only results.

### GGUF Models (Optional, via node-llama-cpp)

For fully offline usage, Query supports local GGUF models (auto-downloaded on first use):

| Model | Purpose | Size |
|-------|---------|------|
| `embeddinggemma-300M-Q8_0` | Vector embeddings (default) | ~300MB |
| `qwen3-reranker-0.6b-q8_0` | Re-ranking | ~640MB |
| `qmd-query-expansion-1.7B-q4_k_m` | Query expansion (fine-tuned) | ~1.1GB |

Models are downloaded from HuggingFace and cached in `~/.cache/query/models/`.

### Custom Embedding Model

Override the default embedding model via the `QMD_EMBED_MODEL` environment variable:

```sh
# Use Qwen3-Embedding-0.6B for better multilingual (CJK) support
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"

# After changing the model, re-embed all collections:
query embed -f
```

## Usage

### Collection Management

```sh
# Create a collection from current directory
query collection add . --name myproject

# Create a collection with explicit path and custom glob mask
query collection add ~/Documents/notes --name notes --mask "**/*.md"

# List all collections
query collection list

# Remove a collection
query collection remove myproject

# Rename a collection
query collection rename myproject my-project

# List files in a collection
query ls notes
query ls notes/subfolder
```

### Generate Vector Embeddings

```sh
# Embed all indexed documents (900 tokens/chunk, 15% overlap)
query embed

# Force re-embed everything
query embed -f

# Enable AST-aware chunking for code files (TS, JS, Python, Go, Rust)
query embed --chunk-strategy auto
```

**AST-aware chunking** (`--chunk-strategy auto`) uses tree-sitter to chunk code files at function, class, and import boundaries instead of arbitrary text positions.

### Context Management

```sh
# Add context to a collection (using qmd:// virtual paths)
query context add qmd://notes "Personal notes and ideas"
query context add qmd://docs/api "API documentation"

# Add global context (applies to all collections)
query context add / "Knowledge base for my projects"

# List all contexts
query context list

# Remove context
query context rm qmd://notes/old
```

### Search Commands

```
┌──────────────────────────────────────────────────────────────────┐
│                        Search Modes                              │
├──────────┬───────────────────────────────────────────────────────┤
│ search   │ BM25 full-text search only                           │
│ vsearch  │ Vector semantic search only                          │
│ query    │ Hybrid: FTS + Vector + Query Expansion + Re-ranking  │
└──────────┴───────────────────────────────────────────────────────┘
```

```sh
# Full-text search (fast, keyword-based)
query search "authentication flow"

# Vector search (semantic similarity)
query vsearch "how to login"

# Hybrid search with re-ranking (best quality)
query query "user authentication"
```

### Options

```sh
# Search options
-n <num>           # Number of results (default: 5, or 20 for --files/--json)
-c, --collection   # Restrict search to a specific collection
--all              # Return all matches (use with --min-score to filter)
--min-score <num>  # Minimum score threshold (default: 0)
--full             # Show full document content
--line-numbers     # Add line numbers to output
--explain          # Include retrieval score traces
--index <name>     # Use named index

# Output formats
--files            # Output: docid,score,filepath,context
--json             # JSON output with snippets
--csv              # CSV output
--md               # Markdown output
--xml              # XML output

# Get options
query get <file>[:line]  # Get document, optionally starting at line
-l <num>                 # Maximum lines to return
--from <num>             # Start from line number

# Multi-get options
-l <num>           # Maximum lines per file
--max-bytes <num>  # Skip files larger than N bytes (default: 10KB)
```

### Index Maintenance

```sh
# Show index status and collections with contexts
query status

# Re-index all collections
query update

# Re-index with git pull first (for remote repos)
query update --pull

# Clean up cache and orphaned data
query cleanup
```

## Data Storage

Index stored in: `~/.cache/query/index.sqlite`

### Schema

```sql
collections     -- Indexed directories with name and glob patterns
path_contexts   -- Context descriptions by virtual path (qmd://...)
documents       -- Markdown content with metadata and docid (6-char hash)
documents_fts   -- FTS5 full-text index
content_vectors -- Embedding chunks (hash, seq, pos, 900 tokens each)
vectors_vec     -- sqlite-vec vector index (hash_seq key)
llm_cache       -- Cached LLM responses (query expansion, rerank scores)
```

## Development

```sh
git clone https://github.com/pleaseai/query
cd query
bun install
```

## Acknowledgments

This project is a fork of [QMD](https://github.com/tobi/qmd) by Tobi Lütke. The original QMD project provides the excellent hybrid search pipeline foundation that Query extends with AI SDK provider integration.

## License

MIT
