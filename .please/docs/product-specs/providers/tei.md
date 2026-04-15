---
id: SPEC-001
level: V_M
domain: providers
feature: tei
depends: []
conflicts: []
traces: []
created_at: 2026-04-15T18:50:00Z
updated_at: 2026-04-15T18:50:00Z
source_tracks: ["tei-embedding-support-20260415"]
---

# TEI (Text Embeddings Inference) Provider Specification

## Purpose

TEI (Text Embeddings Inference) Provider 관련 요구사항.

## Requirements

### Requirement: TEIProvider class implements LLMProvider

The system MUST provide a `TEIProvider` class implementing the `LLMProvider` interface at `src/providers/tei-provider.ts`.

#### Scenario: TEIProvider class implements LLMProvider

- GIVEN 시스템이 정상 동작 중일 때
- WHEN TEIProvider 인스턴스가 생성된다
- THEN LLMProvider 인터페이스의 모든 메서드가 호출 가능한 상태로 노출된다

### Requirement: embed and embedBatch call TEI /embed

The system MUST translate `embed(text)` / `embedBatch(texts)` into a TEI `POST /embed` request with `{inputs, truncate, truncation_direction, normalize, prompt_name}` payload and convert the response to `EmbeddingResult`.

#### Scenario: embed request to /embed

- GIVEN TEI 서버가 정상 응답하는 상태일 때
- WHEN embed 또는 embedBatch가 호출된다
- THEN POST /embed로 요청이 전송되고 응답이 EmbeddingResult로 변환된다

### Requirement: rerank calls TEI /rerank

The system MUST translate `rerank(query, documents)` into a TEI `POST /rerank` request with `{query, texts, truncate, raw_scores}` payload and convert the response to `RerankResult`.

#### Scenario: rerank request to /rerank

- GIVEN TEI 서버가 정상 응답하는 상태일 때
- WHEN rerank가 호출된다
- THEN POST /rerank로 요청이 전송되고 응답이 RerankResult로 변환된다

### Requirement: constructor accepts baseUrl and options

The system MUST accept `baseUrl` (required), `timeoutMs`, `maxBatchSize`, and embed/rerank default options (`truncate`, `truncationDirection`, `normalize`, `promptName`) via constructor.

#### Scenario: constructor configures runtime options

- GIVEN 사용자가 TEIProvider를 구성한다
- WHEN baseUrl 및 옵션들이 생성자에 전달된다
- THEN 전달된 값이 후속 요청에 반영된다

### Requirement: modelExists calls TEI /info

The system MUST implement `modelExists(model)` by calling TEI `GET /info` and returning `ModelInfo` (loaded model_id and embedding dimensions).

#### Scenario: modelExists returns loaded model info

- GIVEN TEI 서버가 /info에 정상 응답하는 상태일 때
- WHEN modelExists가 호출된다
- THEN ModelInfo가 반환된다

### Requirement: generate and expandQuery degrade gracefully

The system MUST return `null` or empty array from `generate` / `expandQuery` since TEI does not support them, allowing the upstream engine to degrade gracefully.

#### Scenario: unsupported methods degrade

- GIVEN TEI가 generate/expandQuery를 지원하지 않을 때
- WHEN 해당 메서드가 호출된다
- THEN null 또는 기본 Queryable 쌍이 반환되고 상위 엔진이 fallback한다

### Requirement: failures return null with stderr warning

The system MUST return `null` and write a warning to stderr when the TEI server returns network failure / 413 / 422 / 429 / 5xx, following the LLMProvider contract.

#### Scenario: server failure triggers null return and log

- GIVEN TEI 서버가 실패 응답 또는 네트워크 에러를 반환할 때
- WHEN provider 메서드가 호출된다
- THEN null 또는 원본 순서 기반 fallback이 반환되고 stderr에 경고가 기록된다

## Non-functional Requirements

### Requirement: zero new runtime dependencies

The system SHOULD add zero new runtime dependencies — use built-in `fetch` only, working on both Bun and Node.js ≥ 22.

### Requirement: request/response schemas in tei-types.ts

The system SHOULD separate request/response schemas into `src/providers/tei-types.ts`, aligning with the TEI OpenAPI spec.

### Requirement: store.ts remains unchanged (provider isolation)

The system SHOULD keep `store.ts` unchanged and rely solely on the provider abstraction (Provider isolation invariant).
