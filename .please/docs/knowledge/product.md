# Query — Product Guide

## Vision
A universal hybrid search engine that works with any AI model provider. Built on query's proven BM25 + vector + reranking pipeline, extended with a plugin-based architecture for embedding, reranking, and generation across local and cloud models.

## Problem
Existing on-device search solutions (including query) are tightly coupled to specific local model runtimes (node-llama-cpp / GGUF). This limits adoption by teams who prefer cloud AI providers, need multilingual models, or want to mix local and cloud models for cost/quality tradeoffs.

## Target Users
- **Knowledge workers**: Teams managing documentation, notes, meeting transcripts, and knowledge bases who need powerful search across their content.
- **AI agent developers**: Builders who integrate document retrieval into agentic workflows.

## Core Features
1. **Hybrid Search Pipeline** (from query): BM25 full-text + vector semantic + LLM reranking with RRF fusion
2. **AI SDK Integration**: Embedding, reranking, and query expansion via Vercel AI SDK — supports OpenAI, Cohere, Google, Anthropic, and any AI SDK-compatible provider
3. **Hybrid Model Support**: Mix local GGUF models and cloud providers per task (e.g., local embedding + cloud reranking)
4. **Extensible Provider Architecture**: Plugin-based LLMProvider interface for custom backends
5. **MCP Server**: Model Context Protocol integration for AI agent tooling

## Non-Goals
- Real-time streaming search
- Multi-tenant SaaS deployment
- Image/audio embedding (text-only for now)
