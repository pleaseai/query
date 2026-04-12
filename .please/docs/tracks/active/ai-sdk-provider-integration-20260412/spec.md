# AI SDK Provider Integration — Specification

## Overview
Wire up the AISDKProvider as a first-class LLM backend alongside the existing node-llama-cpp implementation. Enable users to configure cloud AI providers (OpenAI, Cohere, Google, etc.) for embedding, reranking, and query expansion through the Vercel AI SDK.

## Goals
1. AISDKProvider fully implements the LLMProvider interface (embed, embedBatch, rerank, generate, expandQuery)
2. createStore() accepts provider configuration to use AI SDK instead of node-llama-cpp
3. Hybrid mode: mix local and cloud models per capability (e.g., local embed + cloud rerank)
4. All existing search functionality (BM25, vector, hybrid) works with AI SDK providers
5. Comprehensive test coverage for provider layer

## User Stories
- **US-1**: As a developer, I can configure an OpenAI embedding model and use it for vector search
- **US-2**: As a developer, I can configure Cohere reranking and get better search results without local GGUF models
- **US-3**: As a developer, I can mix local embedding with cloud reranking for cost optimization
- **US-4**: As a developer, I can use the Vercel AI Gateway for unified model access

## Success Criteria
- SC-1: AISDKProvider passes all embedding tests with a mock provider
- SC-2: AISDKProvider passes all reranking tests with a mock provider
- SC-3: createStore() works with AISDKProvider configuration
- SC-4: Existing qmd test suite continues to pass
- SC-5: TypeScript compiles without errors
