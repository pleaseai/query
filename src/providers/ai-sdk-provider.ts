/**
 * ai-sdk-provider.ts - AI SDK based LLM provider
 *
 * Uses Vercel AI SDK for embedding, reranking, and text generation.
 * Supports any AI SDK compatible provider (OpenAI, Cohere, Google, etc.)
 * and the Vercel AI Gateway for unified model access.
 */

import { embed, embedMany, rerank, generateText } from "ai";
import type { EmbeddingModel, RerankingModel, LanguageModel } from "ai";
import type { LLMProvider, EmbeddingResult, EmbedOptions, GenerateResult, GenerateOptions, ModelInfo, Queryable, RerankDocument, RerankOptions, RerankResult } from "./types.js";

function getModelId(model: EmbeddingModel | LanguageModel | RerankingModel): string {
  if (typeof model === "string") return model;
  if ("modelId" in model) return model.modelId;
  return "unknown";
}

export type AISDKProviderConfig = {
  embedModel: EmbeddingModel;
  generateModel?: LanguageModel;
  rerankModel?: RerankingModel;
  maxParallelEmbedCalls?: number;
};

export class AISDKProvider implements LLMProvider {
  private readonly config: AISDKProviderConfig;
  private disposed = false;

  constructor(config: AISDKProviderConfig) {
    this.config = config;
  }

  async embed(text: string, _options?: EmbedOptions): Promise<EmbeddingResult | null> {
    if (this.disposed) return null;
    const result = await embed({ model: this.config.embedModel, value: text });
    return { embedding: result.embedding, model: getModelId(this.config.embedModel) };
  }

  async embedBatch(texts: string[], _options?: EmbedOptions): Promise<(EmbeddingResult | null)[]> {
    if (this.disposed) return texts.map(() => null);
    if (texts.length === 0) return [];
    const result = await embedMany({
      model: this.config.embedModel,
      values: texts,
      maxParallelCalls: this.config.maxParallelEmbedCalls ?? 5,
    });
    const modelId = getModelId(this.config.embedModel);
    return result.embeddings.map((embedding) => ({ embedding, model: modelId }));
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult | null> {
    if (this.disposed || !this.config.generateModel) return null;
    const result = await generateText({
      model: this.config.generateModel,
      prompt,
      maxOutputTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
    return { text: result.text, model: getModelId(this.config.generateModel), done: true };
  }

  async expandQuery(query: string, options?: { context?: string; includeLexical?: boolean }): Promise<Queryable[]> {
    if (this.disposed || !this.config.generateModel) {
      return [{ type: "lex", text: query }, { type: "vec", text: query }];
    }

    const contextLine = options?.context ? `\nDomain context: ${options.context}` : "";
    const result = await generateText({
      model: this.config.generateModel,
      system: `You are a search query expansion assistant.${contextLine}\n\nReturn exactly 2 lines:\n1. A keyword-focused query for BM25\n2. A natural language query for vector search\n\nNo labels or prefixes.`,
      prompt: query,
      maxOutputTokens: 200,
      temperature: 0.7,
    });

    const lines = result.text.trim().split("\n").filter((l) => l.trim());
    const queries: Queryable[] = [
      { type: "lex", text: query },
      { type: "vec", text: query },
    ];
    if (lines.length >= 1) queries.push({ type: "lex", text: lines[0].trim() });
    if (lines.length >= 2) queries.push({ type: "vec", text: lines[1].trim() });
    return queries;
  }

  async rerank(query: string, documents: RerankDocument[], _options?: RerankOptions): Promise<RerankResult> {
    if (this.disposed || !this.config.rerankModel || documents.length === 0) {
      return {
        results: documents.map((doc, i) => ({ file: doc.file, score: 1 - i / Math.max(documents.length, 1), index: i })),
        model: "none",
      };
    }

    const docTexts = documents.map((d) => (d.title ? `${d.title}\n` : "") + d.text);
    const result = await rerank({ model: this.config.rerankModel, documents: docTexts, query, topN: documents.length });
    return {
      results: result.ranking.map((ranked) => ({ file: documents[ranked.originalIndex].file, score: ranked.score, index: ranked.originalIndex })),
      model: getModelId(this.config.rerankModel),
    };
  }

  async modelExists(model: string): Promise<ModelInfo> {
    return { name: model, exists: true };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}
