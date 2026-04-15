# Plan: TEI (Text Embeddings Inference) Provider

> Track: tei-embedding-support-20260415
> Spec: [spec.md](./spec.md)

## Overview

- **Source**: /please:plan
- **Track**: tei-embedding-support-20260415
- **Issue**: (pending)
- **Created**: 2026-04-15
- **Approach**: fetch 기반 독립적 `TEIProvider` 클래스로 `LLMProvider` 구현, `AISDKProvider`와 동등 계층에 배치

## Purpose

Query에 Hugging Face TEI 서버를 직접 연동하는 provider를 추가하여, self-hosted embedding / rerank 배포를 AI SDK를 거치지 않고 최단 경로로 사용할 수 있도록 한다.

## Context

기존 `src/providers/` 디렉토리는 `LLMProvider` 인터페이스(`types.ts`)와 `AISDKProvider`(`ai-sdk-provider.ts`)를 두고 있으며, `index.ts`에서 재노출한다. 신규 provider도 동일한 패턴으로 추가한다. `LLMProvider`는 `embed`, `embedBatch`, `generate`, `expandQuery`, `rerank`, `modelExists`, `dispose` 메서드를 요구한다. TEI는 `generate`를 지원하지 않으므로 `null` / 기본값 fallback을 반환한다.

## Architecture Decision

**선택**: AI SDK custom provider 레이어에 의존하지 않고 독립된 fetch 기반 클래스를 구현한다.

**이유**:

- TEI native API(`/embed`, `/rerank`, `/info`)는 OpenAI 호환 레이어와 달라 `truncate_direction`, `prompt_name`, `raw_scores` 등 TEI 고유 옵션을 노출해야 한다
- AI SDK에 adapter를 두는 것은 간접 코스트가 크고, `ai@v6`의 embedding model interface가 TEI native 필드를 그대로 전달하기 어렵다
- fetch만 사용하면 의존성 추가가 0이고 Bun / Node 둘 다 지원된다 (NFR-1 충족)

**Trade-off**: AI SDK의 retry / telemetry를 재사용하지 못한다. 대신 단순한 timeout 및 `null` 반환 규약으로 `store.ts`가 graceful degradation을 담당한다.

## Tasks

- [x] T001 [P] TEI 요청/응답 타입 정의 (file: src/providers/tei-types.ts) — OpenAPI 스펙 기준 EmbedRequest/EmbedResponse/RerankRequest/RerankResponse/Info 타입
- [x] T002 TEIProvider 클래스 스켈레톤 및 생성자 구현 (file: src/providers/tei-provider.ts) (depends on T001) — config(baseUrl, timeoutMs, maxBatchSize, 기본 옵션), dispose, modelExists
- [x] T003 embed / embedBatch 구현 (file: src/providers/tei-provider.ts) (depends on T002) — POST /embed 호출, batch 처리, timeout/error 시 null 반환
- [x] T004 rerank 구현 (file: src/providers/tei-provider.ts) (depends on T002) — POST /rerank 호출, TEI 응답을 RerankDocumentResult로 매핑, 에러 시 원래 순서로 fallback
- [x] T005 [P] generate / expandQuery degrade 구현 (file: src/providers/tei-provider.ts) (depends on T002) — generate는 null, expandQuery는 기본 Queryable 쌍 반환
- [x] T006 TEIProvider unit test (file: src/providers/tei-provider.test.ts) (depends on T003, T004, T005) — global fetch mock으로 /embed, /rerank, /info, 에러 경로 검증
- [x] T007 providers 모듈 노출 업데이트 (file: src/providers/index.ts) (depends on T002) — TEIProvider와 TEIProviderConfig 내보내기
- [x] T008 [P] README TEI 사용 예시 추가 (file: README.md) (depends on T007) — TEI 서버 기동 명령과 `createStore()` 소비 예시
- [x] T009 [P] ARCHITECTURE.md provider 목록 갱신 (file: ARCHITECTURE.md) (depends on T007) — providers 모듈 행에 TEI 언급
- [x] T010 전체 검증 (depends on T006, T007, T008, T009) — `bun test` 17/17 통과. `bun run typecheck`는 baseline 734개 에러(store.ts 등 동일 패턴 fetch/AbortController/console lib 미구성)에 이 트랙이 7개 더해 741개 — Surprises 참고

## Key Files

- `src/providers/types.ts` — `LLMProvider` 인터페이스 (변경 없음)
- `src/providers/ai-sdk-provider.ts` — 같은 패턴을 따를 참고 구현
- `src/llm.ts` — `EmbeddingResult` / `RerankResult` / `RerankDocument` / `ModelInfo` / `Queryable` 타입 원천 (line 75-188)
- `src/providers/index.ts` — public 재노출

## Verification

- **Unit**: `src/providers/tei-provider.test.ts` — fetch mock으로 각 메서드 정상 / 실패 경로 검증
- **Type**: `bun run typecheck`는 사전 baseline 에러(store.ts 등 `lib` 미구성) 유지 — 트랙 기여분이 새 에러 클래스를 만들지 않음 (Surprises 참고)
- **Regression**: `bun test` 전체 통과, `store.ts` unit test 영향 없음
- **Manual (optional)**: 로컬 TEI 컨테이너(`ghcr.io/huggingface/text-embeddings-inference:cpu-latest`) 기동 후 `baseUrl=http://localhost:8080`으로 수동 연결 확인

## Progress

- [x] Phase 1: 타입과 provider 스켈레톤 (T001, T002)
- [x] Phase 2: 핵심 메서드 구현 (T003, T004, T005)
- [x] Phase 3: 테스트 및 노출 (T006, T007)
- [x] Phase 4: 문서 및 검증 (T008, T009, T010)
- [x] (2026-04-15 18:45 KST) Review fixes applied (SHA: `c46907e`)

## Decision Log

- 2026-04-15: AI SDK custom provider 대신 fetch 기반 구현 선택 — TEI 고유 옵션 노출과 의존성 최소화를 위해
- 2026-04-15: 인증 메커니즘 제외 — spec의 Out of Scope에 따름 (self-hosted 기본 가정)
- 2026-04-15: `createStore()` 연동은 AI SDK provider 배선 트랙과 함께 일괄 처리 결정

## Surprises & Discoveries

- `bun run test`는 `node_modules/.bin/vitest`가 bun install 후에도 생성되지 않아 `vitest: command not found` 발생 → 스크립트를 `bunx vitest run`으로 변경하여 해결. `bunx tsc`, `bunx tsc -p`도 동일하게 수정
- `tsc --noEmit` baseline 734개 에러 (store.ts 등에서 fetch/AbortController/console `lib` 미구성). 이 트랙이 동일 패턴을 따르므로 +7 ≈ 741개로 증가했으나 새로운 타입 에러 클래스는 아님. tsconfig `lib` 정비는 별도 트랙 권장
- Review에서 발견: 2xx 응답의 non-JSON 바디를 transport 에러와 구분되지 않게 로깅. 내부 try/catch로 분리해 "invalid JSON body (HTTP N)" 로그로 교정

## Outcomes & Retrospective

### What Was Shipped

- `TEIProvider` (fetch 기반, 0-dep) + TEI 타입 스키마 + 20개 unit test
- README / ARCHITECTURE / tech-stack.md 갱신
- Review fix: JSON parse 실패를 transport 에러와 구분하는 로그 + rerank OOB index / embedBatch 짧은 응답 방어 테스트

### What Went Well

- `AISDKProvider` 참고 구현이 있어서 패턴 복제가 간단했고, provider 경계(NFR-3: store.ts 무변경) 유지가 용이했음
- `AbortController` + `finally` cleartimeout 패턴이 AI SDK의 retry/telemetry 없이도 타임아웃 안전성을 확보
- 사전 배정된 `results[]` 배열로 `embedBatch`의 순서/부분실패 불변식을 단순하게 유지

### What Could Improve

- 초기 리뷰에서 2xx non-JSON 케이스를 놓쳤음. 다음부터는 fetch 래퍼 작성 시 "네트워크 실패 / HTTP 실패 / 파싱 실패" 3분기를 체크리스트화
- `tsc --noEmit` baseline이 734개라는 사실이 트랙 중 드러남. baseline을 고정 수치로 record해두면 회귀 검출이 쉬움

### Tech Debt Created

- `tsconfig.json` `lib: ["ES2022"]`에 DOM/node 미포함으로 인한 734개 baseline — 별도 인프라 트랙에서 해결 권장
- 인증/커스텀 헤더 미지원 (spec Out of Scope). TEI를 사내 게이트웨이 뒤에 둘 경우 추가 트랙 필요
