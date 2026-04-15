# Query — Gotchas

Project-specific pitfalls and workarounds. Check here when something "should work" but doesn't.

## Runtime & Tooling

- **`bun run <script>`가 `vitest: command not found` / `tsc: command not found`로 실패한다.**
  - 원인: `bun install`이 일부 패키지의 `node_modules/.bin/` 심볼링크를 생성하지 않는 경우가 있다 (workspace / optionalDependencies 조합 시 특히).
  - 해결: `package.json` scripts에 `bunx` 프리픽스를 추가한다 (예: `"test": "bunx vitest run --reporter=verbose"`, `"typecheck": "bunx tsc --noEmit"`).
  - 적용 시점: 새 스크립트를 추가하거나 기존 스크립트가 위 에러로 실패할 때.

- **`tsc --noEmit` baseline이 700+ 에러인 상태.**
  - 원인: `tsconfig.json`의 `lib: ["ES2022"]`에 DOM / node 타입이 포함되지 않아 `fetch`, `AbortController`, `console`, `URL` 등이 미정의로 표시된다.
  - 현재 baseline(2026-04-15): 734개 (store.ts 등 대부분이 동일 패턴).
  - 해결(미완): `lib`에 `DOM` 추가 또는 `@types/node` 도입이 필요하지만 범위가 커서 별도 트랙에서 처리 예정.
  - 적용 시점: 새 provider / fetch 사용 코드 추가 시 기존 패턴을 따른다 (즉 신규 에러 추가는 불가피).

## Providers

- **fetch 래퍼는 세 가지 실패 모드를 모두 구분해서 로깅해야 한다.**
  - 세 분기: (1) 네트워크/abort 에러 — `fetch` 자체가 throw, (2) HTTP 실패 — `response.ok === false`, (3) 성공 응답의 JSON 파싱 실패 — 2xx인데 HTML / truncated body.
  - 이유: (3)을 (1)과 같이 묶어 로깅하면 프록시 오설정(HTML 에러 페이지를 200으로 내려주는 경우)을 transport 장애로 오인한다.
  - 구현 패턴: `src/providers/tei-provider.ts`의 `fetchJson`이 레퍼런스. `response.ok` 체크 후 별도 nested try로 `response.json()`을 감싸 "invalid JSON body (HTTP N)" 로그로 구분.
  - 적용 시점: 새 provider의 HTTP 래퍼를 작성할 때.
