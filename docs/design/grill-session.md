# Folio design grill — 2026-10-28

> **Facilitation note.** The user delegated the decisions in the brief: “I just want you to move forward, don’t wait for me to make decisions for the ‘grilling’ session—just go ahead and choose what you would recommend.” The questions below are therefore written as a real frontier, each with a recommended answer, and the recommendation is recorded as the adopted decision. The grill still does its job: every branch is exposed, challenged, and closed before design work starts.

## Objective

Ship **Folio 1.0**, a local-first PDF reader for Windows with a browser-compatible twin, that is *provable* rather than asserted:

- A reader that stays responsive on a 300-page document while text search, annotation, and page rendering compete for the main thread.
- Signature placement that is trustworthy in the only sense a visual signature can be: explicit approval, geometrically correct on rotated and offset scans, embedded as a real PDF stamp, never silently added.
- A desktop shell whose security boundary is small enough to audit: sandboxed renderer, `app://` origin, allow-listed IPC, video-only camera permission.
- A session model with no surprising restores: an explicit file always wins, and returning to the Library never reopens a document behind the reader’s back.
- Packaging and update behavior that tells the truth about the edition it is running in.

The hard part is not “draw a rectangle on a PDF”. It is keeping **PDF user-space geometry, session state, render scheduling, persistence, export, and desktop trust** coherent at the same time. That is the challenge this grill is designed to pin down.

---

## Round 1 — Product boundary and proof

### ❓ Q1 — What does “complete” mean for this run?

Options: (a) a polished prototype with mocked persistence, (b) a real local app covering the full reading/annotation/signature loop, with desktop packaging and a deployed browser edition, or (c) a full production release including OCR, cryptographic signatures, and cloud sync.

➡️ **(b).** “Complete” means a working local application with a real PDF engine, real IndexedDB persistence, native annotation export, a runnable Electron shell, Windows packaging configuration, and a deployed browser edition. OCR, cryptographic signing/validation, and cloud sync are explicitly out of scope. A mock or architecture document does not satisfy the objective.

**Adopted:** (b).

### ❓ Q2 — Which platform leads?

Options: (a) Windows desktop only, (b) browser only, (c) Windows desktop as the primary product with a feature-complete browser edition for reach and review.

➡️ **(c).** Electron + NSIS is the product promise, but GitHub Pages gives reviewers a zero-install way to exercise the same reader core. The browser edition must accurately call itself the Browser Edition and must not pretend to have OS integration or self-updates.

**Adopted:** (c).

### ❓ Q3 — What exactly may the signature feature promise?

Options: (a) “legally binding e-signature”, (b) a visual signature image placed with explicit approval and embedded as a PDF stamp, with no claim of identity or tamper evidence, (c) cryptographic signing via a certificate store.

➡️ **(b).** A visual signature is a picture of a signature, not a certificate. The UI must say so in plain language, warn when existing digital signatures are present, and never use “secure”, “verified”, or “legally binding”. Cryptographic signing is out of scope.

**Adopted:** (b).

### ❓ Q4 — What is the performance bar?

Options: (a) no explicit bar, (b) interaction responsiveness is the bar, even when a large document is indexing/rendering, with a measured baseline committed to the repo.

➡️ **(b).** Targets are budgets, not marketing claims: the UI must yield during indexing, typing in search must remain responsive while indexing continues, page renders must be cancellable, and the repo must contain a repeatable benchmark for a ~300-page document. No “blazing fast” claim without the measurement artifact.

**Adopted:** (b).

---

## Round 2 — PDF engine and annotation model

### ❓ Q5 — Single-page, paged spreads, or continuous scroll?

Options: (a) one page at a time with next/prev, (b) continuous vertical scroll for single-page mode and continuous spread rows for two-page mode, (c) free canvas.

➡️ **(b).** Continuous scroll is what readers expect, gives scroll-position restoration meaning, and lets a lightweight virtualization strategy keep only nearby pages rendered. Page navigation becomes “scroll page into view”. Two-page spread is a layout mode over the same page list, not a separate viewer.

**Adopted:** (b).

### ❓ Q6 — Use PDF.js’s annotation editor or our own annotation layer?

Options: (a) PDF.js `AnnotationEditorLayer` for highlight/ink/free-text plus `saveDocument`, (b) a custom annotation model and renderer over PDF.js canvases/text layers, exporting native PDF annotations with `pdf-lib` and low-level appearance streams.

➡️ **(b).** The signature stamp, deterministic repeat exports, command-stack undo/redo, annotation list, geometry tests, and integration with a custom toolbar all need one source of truth. PDF.js remains the rendering, text, search, form-widget, and password engine. The exported file contains **native** PDF annotations with appearance streams, so this is not a flattened-image workaround.

**Adopted:** (b). See ADR-0001.

### ❓ Q7 — Where do annotation coordinates live?

Options: (a) CSS pixels relative to the visible page, (b) page-relative normalized 0–1 coordinates, (c) PDF user-space points.

➡️ **(c).** CSS pixels break on zoom. Normalized coordinates break on CropBox origin and are ambiguous under rotation. PDF user-space points are the only representation that survives viewer rotation, page rotation, zoom, DPI, and export. Conversion happens exactly twice: client point → PDF user space on creation, PDF user space → viewport point on paint.

**Adopted:** (c). See ADR-0002.

### ❓ Q8 — How do encrypted PDFs behave?

Options: (a) reject them, (b) PDF.js password callback with a modal that supports retry and cancel, and a clear “annotations cannot be exported from encrypted files without a writable copy” boundary.

➡️ **(b).** Reading an encrypted file must work. The password is used only in memory. If the user later exports, re-encryption is not attempted; the export is blocked with a plain explanation if the document cannot be written by the client PDF library.

**Adopted:** (b).

---

## Round 3 — Library, session, and rendering state

### ❓ Q9 — How are recent documents stored and bounded?

Options: (a) file paths only, (b) cached bytes + thumbnails in IndexedDB with an LRU cap and a size budget, (c) upload to a server.

➡️️ **(b).** File paths break after moves and in the browser. Cached bytes are local-only and make reopen immediate. Bound the library at 24 documents and 200 MB of cached PDF bytes; evict least-recently-opened documents, never the currently open one, and explain the eviction in the Library. No uploads, no telemetry.

**Adopted:** (b).

### ❓ Q10 — What identifies a document across renames and paths?

Options: (a) file name, (b) path, (c) SHA-256 fingerprint of the bytes, with name and size as display metadata.

➡️ **(c).** Content identity makes annotations and reading position survive a rename or a different open route, and it deduplicates the Library. The fingerprint is computed asynchronously; until it resolves the document is usable.

**Adopted:** (c).

### ❓ Q11 — How do automatic restoration and explicit opens interact?

Options: (a) always restore the last session, (b) explicit file beats restore, and returning to the Library clears the auto-restore flag, (c) never restore.

➡️ **(b).** This is a race in naive readers: the app launches, starts restoring the last PDF, then a file-association open arrives. Folio resolves startup intent first. An explicit open cancels restoration. Leaving the Reader for the Library marks the session as “not auto-restorable”; the next launch shows the Library. Night reading and theme are independent of this and always restore.

**Adopted:** (b).

### ❓ Q12 — How is night reading applied?

Options: (a) invert the whole UI, (b) a per-page canvas rendering filter independent of the UI theme, (c) a separate night theme only.

➡️ **(b).** Night reading is a rendering treatment for the page only: inverted, hue-corrected, slightly dimmed. It works with either interface theme, persists immediately when toggled, and is restored across documents and process restarts. CSS filters on the page canvas keep the raw PDF untouched and export unaffected.

**Adopted:** (b).

### ❓ Q13 — How is rendering kept fast?

Options: (a) render every page up front, (b) virtualized page frames, an intersection observer, a bounded canvas cache, a small render queue, cancellable render tasks, and CSS-scaled stale canvases during zoom.

➡️ **(b).** The reader renders only near-viewport pages, at `min(devicePixelRatio, 2)`, with a concurrency limit. Zoom updates layout immediately and re-renders after a short debounce. Rendering is cancelled when a page leaves the window or the document switches. Thumbnails are bounded and lazily generated.

**Adopted:** (b). See ADR-0005.

---

## Round 4 — Search and annotation interaction

### ❓ Q14 — How does search stay responsive on a large PDF?

Options: (a) extract all text synchronously on open, (b) index pages in idle chunks with cancellation and a stable generation token, count matches as pages arrive, and batch snippet generation, (c) use a server.

➡️ **(b).** Open never blocks on a full index. The search panel reports “Indexing 84 / 300” while results stream in. A new query cancels pending snippet work. Every async completion checks the document generation, so a late result cannot leak into the next document.

**Adopted:** (b).

### ❓ Q15 — What is the annotation interaction model?

Options: (a) a modal for every action, (b) a compact tool strip with select/highlight/ink/text/signature modes, a selection inspector, and an annotation panel; highlights are created by selecting text, ink by dragging, text notes by clicking.

➡️ **(b).** The reader must remain readable. Tools are explicit, the cursor changes, and a small floating inspector appears only when an annotation is selected. Existing annotations can be selected, recolored, deleted, and moved where meaningful. Undo/redo covers every mutation as one command.

**Adopted:** (b).

### ❓ Q16 — Handwriting on a rotated/offset page?

Options: (a) assume rotation is 0 and CropBox starts at 0,0, (b) store points in PDF user space using PDF.js viewport conversion and test page rotation, viewer rotation, and nonzero CropBox origins explicitly.

➡️ **(b).** This is a correctness requirement, not polish. Unit tests exercise all combinations. The overlay geometry and export use the same conversion helpers so the ink cannot drift between screen and file.

**Adopted:** (b).

---

## Round 5 — Signatures

### ❓ Q17 — What input methods are in scope?

Options: (a) draw only, (b) draw, type, upload an image, and capture with the camera, (c) draw and cryptographic certificate only.

➡️ **(b).** Draw and type are the fast paths. Upload covers a scanned signature. Camera is included behind a video-only, user-initiated permission and is cleaned up on close, cancel, or navigation. All processing is local. A reusable signature is off by default.

**Adopted:** (b).

### ❓ Q18 — How are signature fields suggested?

Options: (a) OCR the page, (b) detect unsigned PDF signature widgets and likely “Signature / Sign here / Signed by” labels from the text layer, scoped to the current page and run after navigation settles, (c) always ask the user to place manually.

➡️ **(b), with (c) always available.** No OCR is implemented and no OCR is claimed. Widget detection is authoritative when present; label detection is a suggestion. Detection never adds anything. The preview is dashed, movable, and resizable; only “Approve and add signature” commits.

**Adopted:** (b) + manual placement.

### ❓ Q19 — How is a remembered signature governed?

Options: (a) save every signature automatically, (b) offer an off-by-default “Remember this signature” setting, save only after approval, explain local unencrypted storage, and provide “Forget saved signature”, (c) never remember.

➡️ **(b).** The control appears in the approval step, not before. The explanatory copy is unavoidable: the image is stored locally in IndexedDB and is not encrypted. Approval without remembering still adds the signature to the document but stores nothing reusable.

**Adopted:** (b).

### ❓ Q20 — What happens when the PDF already has digital signatures?

Options: (a) ignore them, (b) detect them, suppress automatic suggestions, show a persistent warning in the signature flow that editing may affect validity, and never claim verification.

➡️ **(b).** Visual signatures and digital certificates are different things; the copy says so. Exporting a modified PDF invalidates existing document-integrity signatures in most viewers. We warn rather than pretend to preserve them.

**Adopted:** (b).

### ❓ Q21 — How is the signature embedded?

Options: (a) draw the pixels into the page content stream, (b) add a real `/Stamp` annotation with a transparent appearance stream and a unique annotation name, (c) add an AcroForm signature field.

➡️ **(b).** The exported image is transparent, placed by PDF user-space rectangle, and represented as a native stamp annotation with an appearance stream, so annotation-aware viewers can list and remove it. The app does not create a cryptographic signature field. Repeat exports always regenerate from the original bytes plus the current annotation set.

**Adopted:** (b). See ADR-0001 and ADR-0002.

---

## Round 6 — Desktop shell, security, updates, delivery

### ❓ Q22 — How locked down is Electron?

Options: (a) default BrowserWindow, (b) context isolation + sandbox + no Node integration, a narrow preload API, an `app://` production origin, IPC sender validation, a CSP, navigation/window-open denial, and a media-only permission handler.

➡️ **(b).** Privileged operations are limited to: choose/open a PDF, print, show item in folder, read app info, and update actions. Every handler validates its sender and arguments. The renderer never receives a filesystem path it can arbitrarily read. Camera permission is granted only to the trusted window and only for video.

**Adopted:** (b). See ADR-0004.

### ❓ Q23 — How is Windows delivery produced?

Options: (a) a zip of the source, (b) electron-builder NSIS per-user installer with PDF association and shortcuts, plus a portable target and a CI workflow that builds both on Windows, (c) an MSI with a custom bootstrapper.

➡️ **(b).** NSIS assisted installer, per-user by default (with an elevation path if the user chooses a protected location), stable `appId` so upgrades replace rather than duplicate, PDF association, Start Menu and optional desktop shortcut. Portable copies identify themselves and disable self-update. A GitHub Actions workflow builds the artifacts on Windows; Linux cannot credibly produce the Windows installer alone.

**Adopted:** (b).

### ❓ Q24 — How do updates behave?

Options: (a) always auto-download and restart, (b) opt-in checks against a configurable feed, explicit download, explicit restart, unsaved-annotation guard, no updater in development/browser/portable, (c) no updates.

➡️ **(b).** `electron-updater` is configured at runtime from `FOLIO_UPDATE_URL` (or a resources config file), never hard-coded to an unauthorized publisher. About Folio shows version, edition, install location, update state, and a button to open the installation folder. The copy notes that Windows SmartScreen/elevation prompts may still appear. No update is published as part of this project.

**Adopted:** (b).

### ❓ Q25 — What exactly is the Browser Edition?

Options: (a) a marketing page, (b) the same reader/annotation/signature/export core, with local file picking and IndexedDB, explicitly missing OS integration, native window controls, printing through the browser, and updates.

➡️ **(b).** Deploy it to GitHub Pages. It is a real review surface and a real fallback, not a demo with fake data. It must label itself accurately.

**Adopted:** (b).

---

## Round 7 — Quality, evidence, and scope

### ❓ Q26 — Where are the test seams?

Options: (a) only end-to-end tests, (b) unit tests for pure geometry/search/annotation-command/export modules, storage integration tests against fake IndexedDB, and a small number of Playwright end-to-end flows through the real app, (c) only manual testing.

➡️ **(b).** The high seam is the browser application: Playwright exercises the real UI with real PDF fixtures. Below it, pure modules get fast unit tests, because geometry and PDF byte-level export are exactly where UI tests give poor failure messages. Electron gets a smoke test for the secure shell and window controls.

**Adopted:** (b).

### ❓ Q27 — What evidence must the PR carry?

Options: (a) a written claim, (b) test output, build output, screenshots of Library/Reader/Search/Signature, a benchmark artifact, and a deployed link.

➡️ **(b).** Screenshots are captured from the running app, attached to the PR with `gh --attach`, and one representative shot is committed to the README. No performance claim without the benchmark output.

**Adopted:** (b).

### ❓ Q28 — What is explicitly out of scope?

OCR/field detection beyond text heuristics; cryptographic signing/validation; cloud sync/accounts; mobile apps; real-time collaboration; redaction; EPUB/Office; editing pre-existing third-party annotations beyond display/removal of ours; arbitrary plugin support; publishing an update feed.

**Adopted:** yes. These exclusions go into the spec so they cannot be mistaken for missing work.

### ❓ Q29 — What is the delivery sequence?

Options: (a) one giant commit, (b) spec → tickets → vertical implementation on an integration branch → two independent subagent reviews per round, two rounds, with dispatch refinement between rounds → PR with evidence → merge to main → Pages deployment and artifact build.

➡️ **(b).** The double-review loop is part of the quality bar: two independent reviewers examine the app from different angles, their answers are compared, the dispatch briefs are refined, and a second round checks the fixes. Only then is the final PR opened.

**Adopted:** (b).

---

## Closing statement

The frontier is empty: every branch above is settled, with the adopted options recorded. The objective is deliberately demanding but bounded: **a beautiful local reader with a rigorous geometry/persistence/export core, a truthful signature flow, a hardened desktop shell, and evidence that it all works.** The spec that follows is the synthesis of these decisions.
