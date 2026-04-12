# Query — Product Guidelines

## Code Style
- **Language**: TypeScript (strict mode), ESM modules
- **Runtime**: Bun (primary), Node.js >= 22 (compatible)
- **Formatting**: Follow existing query conventions — no semicolons in imports, 2-space indent
- **Naming**: camelCase for functions/variables, PascalCase for types/classes, kebab-case for files

## API Design Principles
- **Provider-agnostic**: All LLM operations go through the `LLMProvider` interface — never import provider-specific code in core modules
- **AI SDK first**: Default to Vercel AI SDK for embedding, reranking, and generation; local models (node-llama-cpp) as optional fallback
- **Backward compatible**: Maintain query's public SDK API (`createStore`, `QueryStore`) so existing consumers can migrate
- **Explicit over magic**: Require explicit provider configuration rather than auto-detecting models

## Documentation
- Code comments only where logic is non-obvious
- Public API functions must have JSDoc with `@example`
- README covers quick start, SDK usage, and MCP setup

## Error Handling
- Throw descriptive errors at system boundaries (user input, provider API calls)
- Internal functions return `null` for "not available" cases (e.g., no provider configured)
- Never swallow errors silently — log to stderr at minimum

## Testing
- Unit tests with Vitest
- Integration tests for provider implementations
- Benchmark fixtures for search quality regression
