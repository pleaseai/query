/**
 * tei-provider.ts - Hugging Face Text Embeddings Inference provider
 *
 * Implements LLMProvider by calling the TEI native API (/embed, /rerank, /info).
 * Uses the runtime's built-in fetch — no extra dependencies — and works on both
 * Bun and Node.js ≥ 22. Targets self-hosted TEI deployments; authentication
 * and custom headers are intentionally out of scope in this initial version.
 */

import type {
  EmbedOptions,
  EmbeddingResult,
  GenerateOptions,
  GenerateResult,
  LLMProvider,
  ModelInfo,
  Queryable,
  RerankDocument,
  RerankOptions,
  RerankResult,
} from './types.js'
import type {
  TEIEmbedRequest,
  TEIEmbedResponse,
  TEIInfoResponse,
  TEIRerankRequest,
  TEIRerankResponse,
  TruncationDirection,
} from './tei-types.js'

export type TEIProviderConfig = {
  baseUrl: string
  timeoutMs?: number
  maxBatchSize?: number
  modelName?: string
  truncate?: boolean
  truncationDirection?: TruncationDirection
  normalize?: boolean
  promptName?: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BATCH_SIZE = 32

export class TEIProvider implements LLMProvider {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxBatchSize: number
  private readonly modelName: string
  private readonly embedDefaults: {
    truncate: boolean
    truncationDirection: TruncationDirection
    normalize: boolean
    promptName?: string
  }

  private disposed = false

  constructor(config: TEIProviderConfig) {
    if (!config.baseUrl) {
      throw new Error('TEIProvider: baseUrl is required')
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const batchSize = config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error(`TEIProvider: maxBatchSize must be a positive integer, received ${batchSize}`)
    }
    this.maxBatchSize = batchSize
    this.modelName = config.modelName ?? 'tei'
    this.embedDefaults = {
      truncate: config.truncate ?? true,
      truncationDirection: config.truncationDirection ?? 'Right',
      normalize: config.normalize ?? true,
      promptName: config.promptName,
    }
  }

  async embed(text: string, _options?: EmbedOptions): Promise<EmbeddingResult | null> {
    if (this.disposed) return null
    const embeddings = await this.requestEmbed(text)
    const first = embeddings?.[0]
    if (!first) return null
    return { embedding: first, model: this.modelName }
  }

  async embedBatch(texts: string[], _options?: EmbedOptions): Promise<(EmbeddingResult | null)[]> {
    if (this.disposed) return texts.map(() => null)
    if (texts.length === 0) return []

    const results: (EmbeddingResult | null)[] = Array.from({ length: texts.length }, () => null)
    for (let start = 0; start < texts.length; start += this.maxBatchSize) {
      const end = Math.min(start + this.maxBatchSize, texts.length)
      const chunk = texts.slice(start, end)
      const embeddings = await this.requestEmbed(chunk)
      if (!embeddings) continue
      for (let i = 0; i < chunk.length; i++) {
        const vector = embeddings[i]
        if (vector) results[start + i] = { embedding: vector, model: this.modelName }
      }
    }
    return results
  }

  async rerank(query: string, documents: RerankDocument[], _options?: RerankOptions): Promise<RerankResult> {
    if (this.disposed || documents.length === 0) {
      return { results: [], model: 'none' }
    }

    const texts = documents.map((d) => (d.title ? `${d.title}\n` : '') + d.text)
    const request: TEIRerankRequest = {
      query,
      texts,
      truncate: this.embedDefaults.truncate,
      truncation_direction: this.embedDefaults.truncationDirection,
      raw_scores: false,
    }
    const response = await this.post<TEIRerankResponse>('/rerank', request)
    if (!response) {
      return {
        results: documents.map((doc, i) => ({
          file: doc.file,
          score: 1 - i / Math.max(documents.length, 1),
          index: i,
        })),
        model: 'none',
      }
    }

    return {
      results: response
        .filter((entry) => entry.index >= 0 && entry.index < documents.length)
        .map((entry) => ({
          file: documents[entry.index].file,
          score: entry.score,
          index: entry.index,
        })),
      model: this.modelName,
    }
  }

  async generate(_prompt: string, _options?: GenerateOptions): Promise<GenerateResult | null> {
    // TEI does not expose a text-generation endpoint.
    return null
  }

  async expandQuery(query: string, _options?: { context?: string; includeLexical?: boolean }): Promise<Queryable[]> {
    // TEI cannot synthesize alternative queries — return the original query
    // for both lexical and vector retrieval so callers degrade gracefully.
    return [
      { type: 'lex', text: query },
      { type: 'vec', text: query },
    ]
  }

  async modelExists(model: string): Promise<ModelInfo> {
    const info = await this.getInfo()
    if (!info) return { name: model, exists: false }
    return { name: info.model_id || model, exists: true }
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }

  // ---------------------------------------------------------------------------
  // Internal helpers

  private async requestEmbed(inputs: string | string[]): Promise<number[][] | null> {
    const body: TEIEmbedRequest = {
      inputs,
      truncate: this.embedDefaults.truncate,
      truncation_direction: this.embedDefaults.truncationDirection,
      normalize: this.embedDefaults.normalize,
    }
    if (this.embedDefaults.promptName) body.prompt_name = this.embedDefaults.promptName
    return this.post<TEIEmbedResponse>('/embed', body)
  }

  private async getInfo(): Promise<TEIInfoResponse | null> {
    return this.fetchJson<TEIInfoResponse>('/info', { method: 'GET' })
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    return this.fetchJson<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async fetchJson<T>(path: string, init: RequestInit): Promise<T | null> {
    if (this.disposed) return null
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) {
        console.error(`[TEIProvider] ${init.method ?? 'GET'} ${path} failed: ${response.status} ${response.statusText}`)
        return null
      }
      try {
        return (await response.json()) as T
      }
      catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : String(parseError)
        console.error(`[TEIProvider] ${init.method ?? 'GET'} ${path} invalid JSON body (HTTP ${response.status}): ${message}`)
        return null
      }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[TEIProvider] ${init.method ?? 'GET'} ${path} error: ${message}`)
      return null
    }
    finally {
      clearTimeout(timer)
    }
  }
}
