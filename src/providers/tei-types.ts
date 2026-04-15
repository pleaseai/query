/**
 * tei-types.ts - Request/response schemas for Hugging Face Text Embeddings Inference (TEI)
 *
 * Mirrors the TEI native API (https://huggingface.github.io/text-embeddings-inference/openapi.json).
 * Kept minimal: only fields used by TEIProvider are declared.
 */

export type TruncationDirection = 'Left' | 'Right'

export type TEIEmbedRequest = {
  inputs: string | string[]
  truncate?: boolean
  truncation_direction?: TruncationDirection
  prompt_name?: string
  normalize?: boolean
  dimensions?: number
}

export type TEIEmbedResponse = number[][]

export type TEIRerankRequest = {
  query: string
  texts: string[]
  truncate?: boolean
  truncation_direction?: TruncationDirection
  raw_scores?: boolean
  return_text?: boolean
}

export type TEIRerankEntry = {
  index: number
  score: number
  text?: string
}

export type TEIRerankResponse = TEIRerankEntry[]

export type TEIInfoResponse = {
  model_id: string
  model_sha?: string | null
  model_dtype?: string
  model_type?: { [key: string]: unknown }
  max_concurrent_requests?: number
  max_input_length?: number
  max_batch_tokens?: number
  max_batch_requests?: number | null
  max_client_batch_size?: number
  auto_truncate?: boolean
  tokenization_workers?: number
  version?: string
  docker_label?: string | null
}

export type TEIErrorResponse = {
  error: string
  error_type?: string
}
