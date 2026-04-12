# Query — Tech Stack

## Runtime & Language
- **Runtime**: Bun (primary), Node.js >= 22 (compatible)
- **Language**: TypeScript 5.x (strict mode, ESM modules)
- **Package Manager**: Bun

## AI / ML
- **AI SDK**: Vercel AI SDK v6 (`ai`, `@ai-sdk/openai`, `@ai-sdk/cohere`)
  - Embedding: `embed()`, `embedMany()`
  - Reranking: `rerank()`
  - Generation: `generateText()`
- **Local LLM** (optional): node-llama-cpp 3.x with GGUF models
  - Default embedding: embeddinggemma-300M
  - Default reranker: qwen3-reranker-0.6b
  - Default query expansion: qmd-query-expansion-1.7B

## Database
- **SQLite**: better-sqlite3 (Node.js) / bun:sqlite (Bun)
- **Full-text search**: SQLite FTS5 (BM25)
- **Vector search**: sqlite-vec extension
- **Schema**: documents, documents_fts, content_vectors, vectors_vec, llm_cache

## Search Pipeline
- BM25 keyword search + Vector semantic search
- Reciprocal Rank Fusion (RRF) with position-aware blending
- LLM query expansion + reranking
- Smart chunking: 900 tokens/chunk, 15% overlap, markdown-aware boundaries
- AST-aware chunking: tree-sitter for code files (.ts, .js, .py, .go, .rs)

## Integration
- **MCP**: @modelcontextprotocol/sdk (stdio + HTTP transport)
- **Tree-sitter**: web-tree-sitter + language grammars (optional)

## Testing & Build
- **Test**: Vitest
- **Build**: tsc (TypeScript compiler)
- **Validation**: `bun run typecheck` / `bun test`

## Key Dependencies
| Package | Purpose |
|---|---|
| `ai` | Vercel AI SDK core |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/cohere` | Cohere provider (reranking) |
| `better-sqlite3` | SQLite for Node.js |
| `sqlite-vec` | Vector search extension |
| `node-llama-cpp` | Local GGUF model inference (optional) |
| `fast-glob` | File pattern matching |
| `zod` | Schema validation |
| `yaml` | YAML config parsing |
