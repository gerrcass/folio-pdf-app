# AGENTS.md

Folio is a local-first PDF reader and annotation app for Windows with a browser-compatible twin. Read `GLOSSARY.md` before naming anything, then the spec and ADRs below.

## Start here

1. `docs/specs/folio-1.0.md` — the current spec and acceptance bar.
2. `docs/adr/0001`–`0006` — decisions that must not be silently reversed.
3. `docs/design/grill-session.md` — why the boundaries are where they are.
4. `docs/design/review-round-1.md` and `docs/design/review-round-2.md` — resolved findings and known limitations.
5. `docs/retro/folio-1.0.md` — delivery retrospective and open verification gaps.
6. `CODING_STANDARDS.md` — the rules a reviewer will enforce.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Electron + Vite development app |
| `npm run dev:web` | Browser-only development |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit/integration tests |
| `npm run test:e2e` | Playwright browser flows |
| `npm run test:electron` | Playwright Electron smoke test |
| `npm run build:web` | Static Browser Edition |
| `npm run build` | Desktop renderer + Electron bundles |
| `npm run dist:dir` | Unpacked desktop build for inspection |
| `npm run dist:win` | NSIS installer + portable (Windows or Wine) |
| `npm run bench` | Large-document measurements → `docs/performance.md` |
| `npm run fixtures` | Regenerate committed PDF test fixtures |

Run `npm run typecheck && npm test` before declaring a change complete. UI changes also need `npm run test:e2e` and a screenshot.

## Architecture map

- `electron/` — main process, preload bridge, window state, updater, security policy. The renderer never gets Node or arbitrary filesystem access.
- `src/platform/` — the only place that branches between Electron, Browser, and test bridges.
- `src/pdf/` — PDF.js loading, rendering, text extraction, search, page geometry, signature detection, export.
- `src/annotations/` — annotation types, command stack, hit-testing, painting.
- `src/storage/` — the single IndexedDB connection, document cache/eviction, sessions, settings, remembered signatures.
- `src/features/library/` and `src/features/reader/` — product surfaces.
- `src/components/` — shared visual primitives and dialogs.
- `tests/` — Vitest; `e2e/` — Playwright. Fixtures live under `tests/fixtures/`.

## Invariants

- Annotation geometry is PDF user-space points. Convert through the PDF.js viewport at creation and paint time. Do not store CSS pixels or normalized boxes.
- Exports are rebuilt from the original bytes plus current annotations. Never mutate page content or accumulate annotations between exports.
- A Signature Stamp is committed only by “Approve and add signature”. Never auto-add, never claim cryptographic verification, never call it OCR.
- Explicit opens beat Automatic Restoration. Leaving the Reader for the Library disables the next restore.
- All processing is local. No uploads, telemetry, or network dependency for core reading/annotation/signing/export.
- Long-lived resources get a teardown: render tasks, observers, listeners, object URLs, workers, camera tracks, timers, IndexedDB transactions.
- Every async document operation carries a generation token; stale results are discarded.
- Development, Browser, and Portable Editions must not offer self-update. No update feed is published from this repo.
- The renderer is sandboxed. New privileged behavior belongs behind a validated preload/main IPC method, not `nodeIntegration`.

## Conventions

- TypeScript strict; avoid `any` in exported interfaces. Prefer pure functions in `src/pdf`, `src/annotations`, and `src/storage` so they can be tested without React.
- Keep React components free of PDF.js lifecycle details where possible; use reader hooks/services.
- Use design tokens from `src/styles/tokens.css`; do not invent one-off colors or shadows.
- Two-space indentation, single quotes, trailing commas, named exports. No class components. No state-management dependency.
- Tests use committed fixtures only. Never open the user's real documents or saved signatures.
- Update `docs/performance.md` only with produced measurements, including hardware and environment.
- When a change conflicts with an ADR, surface the conflict and update the ADR rather than silently diverging.
