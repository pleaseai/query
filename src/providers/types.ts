/**
 * types.ts - AI SDK provider types for query engine
 */

import type {
  EmbeddingResult,
  GenerateResult,
  EmbedOptions,
  GenerateOptions,
  RerankDocument,
  RerankOptions,
  RerankResult,
  ModelInfo,
  Queryable,
} from "../llm.js";

export type { EmbeddingResult, GenerateResult, EmbedOptions, GenerateOptions, RerankDocument, RerankOptions, RerankResult, ModelInfo, Queryable };

/**
 * Abstract LLM provider interface for AI SDK backends.
 */
export interface LLMProvider {
  embed(text: string, options?: EmbedOptions): Promise<EmbeddingResult | null>;
  embedBatch(texts: string[], options?: EmbedOptions): Promise<(EmbeddingResult | null)[]>;
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult | null>;
  expandQuery(query: string, options?: { context?: string; includeLexical?: boolean }): Promise<Queryable[]>;
  rerank(query: string, documents: RerankDocument[], options?: RerankOptions): Promise<RerankResult>;
  modelExists(model: string): Promise<ModelInfo>;
  dispose(): Promise<void>;
}
