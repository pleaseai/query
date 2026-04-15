---
product_spec_domain: providers/tei
---

# TEI (Text Embeddings Inference) Provider

> Track: tei-embedding-support-20260415

## Overview

Hugging Face Text Embeddings Inference (TEI) 서버의 native API 형식을 지원하는 새 제공자를 추가한다. 사용자가 self-hosted TEI 인스턴스 (로컬/사내)를 query의 embedding 및 reranking 백엔드로 사용할 수 있도록 한다. AI SDK나 OpenAI 호환 레이어를 거치지 않고 TEI의 `/embed`와 `/rerank` 엔드포인트를 직접 호출하는 `TEIProvider` 클래스를 `src/providers/` 아래에 구현한다.

## Requirements

### Functional Requirements

- [ ] FR-1: `TEIProvider` 클래스가 `LLMProvider` 인터페이스를 구현하여 `src/providers/tei-provider.ts`에 위치한다
- [ ] FR-2: `embed(text)` / `embedBatch(texts)`는 TEI `POST /embed`에 `{inputs, truncate, truncation_direction, normalize, prompt_name}` payload로 요청하고 `EmbeddingResult`로 변환한다
- [ ] FR-3: `rerank(query, documents)`는 TEI `POST /rerank`에 `{query, texts, truncate, raw_scores}` payload로 요청하고 `RerankResult`로 변환한다
- [ ] FR-4: 생성자 옵션으로 `baseUrl`(필수), `timeoutMs`, `maxBatchSize`, `embed`/`rerank` 기본 옵션(`truncate`, `truncationDirection`, `normalize`, `promptName`)을 받는다
- [ ] FR-5: `modelExists(model)`은 TEI `GET /info`를 호출하여 `ModelInfo`(로드된 model_id와 임베딩 차원)를 반환한다
- [ ] FR-6: `generate` / `expandQuery`는 TEI가 지원하지 않으므로 `null` 또는 빈 배열을 반환하여 상위 엔진이 gracefully degrade한다
- [ ] FR-7: 네트워크 실패 / 413 / 422 / 429 / 5xx 시 LLMProvider 규약에 따라 `null`을 반환하고 stderr에 경고를 기록한다

### Non-functional Requirements

- [ ] NFR-1: 의존성 0추가 — 내장 `fetch`만 사용하여 Bun과 Node.js ≥ 22 두 런타임에서 동작한다
- [ ] NFR-2: 요청/응답 스키마는 `src/providers/tei-types.ts`에 분리하여 TEI OpenAPI 스펙과 일치시킨다
- [ ] NFR-3: 기존 `store.ts`는 변경되지 않고 provider 추상화만을 사용한다 (Provider isolation 불변식 준수)

## Acceptance Criteria

- [ ] AC-1: `TEIProvider`의 `embed` / `embedBatch`가 mock 서버를 사용한 unit test에서 통과한다
- [ ] AC-2: `TEIProvider`의 `rerank`이 mock 서버를 사용한 unit test에서 통과한다
- [ ] AC-3: TEI 서버가 사용 불가할 때 provider가 null / 빈 배열을 반환하여 검색이 BM25-only로 fallback된다
- [ ] AC-4: 전체 테스트 스위트 및 `bun run typecheck`가 실패 없이 통과한다
- [ ] AC-5: README에 TEI provider 설정 예시가 추가되고 ARCHITECTURE.md의 provider 목록이 갱신된다

## Out of Scope

- `/predict` (classification / regression) 엔드포인트 — query 파이프라인과 무관
- `/similarity`, `/embed_sparse`, `/embed_all` 엔드포인트 — 이번 범위에 불필요
- OpenTelemetry 연동 (TEI `X-Otel-*` 헤더)
- API key / Bearer token 인증 — self-hosted 배포를 기본으로 가정 (향후 확장 여지 두고 생성자 훅으로 러틸 예정)
- Custom HTTP 헤더 주입 — 초기 버전에서 제외
- `createStore()`에서 TEIProvider 자동 선택 — AI SDK provider 배선 작업 완료 후에 일괄 처리 계획 (별도 track)

## Assumptions

- 대상 TEI 서버 버전은 OpenAPI 스펙에 정의된 스키마를 따르며 Hugging Face `text-embeddings-inference` 1.x 대역에서 동작한다
- 사용자는 TEI 서버를 별도로 구동하며 query는 HTTP 클라이언트 역할만 담당한다
- Embedding 차원 수는 모델이 결정하며 query는 첫 응답에서 추론해 `collections` 스키마에 기록한다 (기존 패턴 따름)
- 권장 옵션 조합: `truncate=true`, `truncation_direction="Right"`, `normalize=true`, `prompt_name`은 미설정 (모델별 E5 / BGE 계열 사용자가 명시)
