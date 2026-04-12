# Architecture

> Agent-first architecture document for the Query project.

## System Overview

**Purpose**: A universal hybrid search engine that combines BM25 full-text search, vector semantic search, and LLM reranking — with pluggable AI model providers via the Vercel AI SDK.

**Primary users**: Knowledge workers searching documentation/notes, AI agent developers integrating document retrieval, and CLI/MCP consumers.

**Core workflow**:

1. **Index**: Collections of markdown/code files are scanned, parsed, and stored in SQLite (FTS5 for text, sqlite-vec for vectors)
2. **Embed**: Documents are chunked (~900 tokens, markdown/AST-aware) and embedded via AI SDK or local GGUF models
3. **Search**: Queries go through expansion → parallel BM25 + vector retrieval → RRF fusion → LLM reranking → position-aware blending

**Key constraints**: Runs on-device with SQLite (no external database). Cloud providers are optional — the system must function with local models alone.

## Dependency Layers

Dependencies flow downward only. Lower layers must not import upper layers.

```
┌─────────────────────────────────────────┐
│           Interface Layer               │  CLI (cli/query.ts), MCP Server (mcp/server.ts)
├─────────────────────────────────────────┤
│           SDK Layer                     │  index.ts (QueryStore — public API wrapper)
├─────────────────────────────────────────┤
│           Core Layer                    │  store.ts (search, indexing, chunking, fusion)
├─────────────────────────────────────────┤
│           LLM Layer                     │  llm.ts (LlamaCpp), providers/ (AI SDK)
├─────────────────────────────────────────┤
│        Infrastructure Layer             │  db.ts (SQLite), collections.ts (config/YAML)
└─────────────────────────────────────────┘
```

**Invariant**: `store.ts` depends on `llm.ts` for all LLM operations. It never imports provider-specific code (AI SDK, node-llama-cpp) directly. The `providers/` directory is only consumed through `llm.ts`.

## Entry Points

For understanding the search pipeline:

- `src/store.ts` — Core engine: BM25 search, vector search, hybrid query, RRF fusion, chunking, embedding generation. The largest file (~4700 lines) containing all search logic.
- `src/llm.ts` — LLM abstraction: `LlamaCpp` class wrapping node-llama-cpp for embedding, reranking, query expansion, and tokenization.

For understanding the public API:

- `src/index.ts` — SDK wrapper: `createStore()` factory, `QueryStore` interface, and all re-exported types. This is the library entry point.

For understanding AI SDK integration:

- `src/providers/ai-sdk-provider.ts` — `AISDKProvider` class implementing `LLMProvider` using Vercel AI SDK's `embed()`, `embedMany()`, `rerank()`, and `generateText()`.
- `src/providers/types.ts` — `LLMProvider` interface that any backend must implement.

For understanding the CLI:

- `src/cli/query.ts` — Full CLI: collection management, search commands, embedding, MCP server launch, status display.

## Module Reference

| Module | Purpose | Key Files | Depends On | Depended By |
|--------|---------|-----------|------------|-------------|
| `src/store.ts` | Search engine core: indexing, chunking, BM25, vector search, RRF fusion, reranking | `store.ts` | `db`, `llm`, `collections`, `ast` | `index`, `cli`, `mcp` |
| `src/llm.ts` | LLM abstraction: embedding, generation, reranking via node-llama-cpp | `llm.ts` | `node-llama-cpp` | `store`, `cli` |
| `src/providers/` | AI SDK provider: cloud-based embedding, reranking, generation | `ai-sdk-provider.ts`, `types.ts` | `ai` (Vercel AI SDK) | `llm` (planned) |
| `src/index.ts` | SDK public API: `QueryStore` wrapper with async methods | `index.ts` | `store`, `llm`, `collections` | `cli`, `mcp`, `bench` |
| `src/db.ts` | SQLite compatibility layer: Bun/Node.js, sqlite-vec extension loading | `db.ts` | `better-sqlite3`, `sqlite-vec` | `store` |
| `src/collections.ts` | Collection & context config: YAML parsing, path management | `collections.ts` | `yaml` | `store`, `index`, `cli` |
| `src/ast.ts` | AST-aware chunking: tree-sitter parsing for code files | `ast.ts` | `web-tree-sitter` | `store` |
| `src/cli/` | CLI interface: commands, output formatting, interactive display | `query.ts`, `formatter.ts` | `index`, `llm`, `collections` | — |
| `src/mcp/` | MCP server: stdio + HTTP transport for AI agent integration | `server.ts` | `index`, `@modelcontextprotocol/sdk` | — |
| `src/bench/` | Benchmark harness: search quality metrics (precision, recall, MRR) | `bench.ts`, `score.ts` | `index` | `cli` |
| `src/maintenance.ts` | Database housekeeping: vacuum, orphan cleanup | `maintenance.ts` | `db` | `index`, `cli` |

## Architecture Invariants

**Provider isolation**: `store.ts` accesses LLM capabilities only through the `LLM` interface defined in `llm.ts`. It must never import `ai`, `@ai-sdk/*`, or `node-llama-cpp` directly. This allows swapping between local and cloud providers without touching search logic.

**SQLite is the only datastore**: All indexed content, embeddings, FTS indexes, and LLM cache live in a single SQLite file. Do NOT introduce external databases, Redis, or file-based vector stores.

**Chunk format stability**: Embeddings are stored with `(hash, seq, pos)` keys. Changing the chunking algorithm invalidates all existing embeddings. Any chunk strategy change must be gated behind the `--chunk-strategy` flag and requires `embed -f` to re-embed.

**Bun/Node.js dual runtime**: `db.ts` abstracts SQLite access for both runtimes. Do NOT use Bun-specific APIs outside of `db.ts`. All other modules must work on Node.js >= 22.

**No auto-execution of destructive operations**: Never run `collection add`, `embed`, or `update` automatically. The CLI must present commands for the user to run manually.

## Cross-Cutting Concerns

**Error handling**: Provider errors (network failures, API limits) return `null` from LLM methods — callers handle gracefully (skip reranking, fall back to BM25-only). CLI errors go to stderr. Process exits with code 1 on fatal errors.

**Logging**: Minimal — stderr for warnings/errors only. No logging framework. `QUERY_LLAMA_GPU` and similar env vars emit warnings on invalid values. Production mode (`enableProductionMode()`) suppresses verbose output.

**Testing**: Vitest for unit/integration tests. Benchmark fixtures (`src/bench/fixtures/`) for search quality regression. Target >80% coverage for new code.

**Configuration**: YAML config files for collections (`query.yml`), environment variables for model overrides (`QUERY_EMBED_MODEL`, `QUERY_RERANK_MODEL`, `QUERY_GENERATE_MODEL`), SQLite `store_collections` table as source of truth at runtime.

**Caching**: LLM responses (query expansion, rerank scores) cached in `llm_cache` SQLite table keyed by content hash. Embedding/reranking contexts auto-disposed after 5 min idle to free VRAM.

## Quality Notes

**Well-tested**: `src/bench/` has scoring logic with fixtures. Search quality can be measured via `query bench`. The core search pipeline in `store.ts` is battle-tested from query.

**Fragile**: `src/store.ts` is 4700+ lines — a monolith containing search, indexing, chunking, and database operations. Refactoring should be done carefully with integration tests.

**Technical debt**:
- AI SDK provider (`src/providers/`) is implemented but not yet wired into `createStore()` — currently only accessible by manually configuring `LlamaCpp.setProvider()`
- MCP server references `QueryStore` (SDK wrapper) but some method signatures don't match the raw `Store` type
- `bench-rerank.ts` and `test-preload.ts` excluded from tsconfig due to Bun-specific imports

---

_Last updated: 2026-04-12_
