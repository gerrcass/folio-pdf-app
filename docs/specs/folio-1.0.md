# Folio 1.0 — local-first PDF reader and signature-safe annotation app

## Problem Statement

Reading and marking up a PDF on Windows should be immediate, but most tools force a trade-off: lightweight viewers cannot annotate or sign; full editors are heavy, cluttered, cloud-bound, or coy about what a “signature” actually proves. Readers also lose the thread between sessions—last page, zoom, night mode, sidebar state—or, worse, reopen an old document when the user explicitly opened a new one.

The person reading a long report at night wants the page to be comfortable without turning the whole interface into a black slab. The person marking up a contract wants highlights, ink, notes, and a visible signature placed accurately on a rotated scan, with no risk that the signature was added automatically. The person installing the app wants a Windows installer that upgrades cleanly, tells them which edition they are running, and does not silently update from an unauthorized feed. The privacy-conscious user wants all of this to happen on their device.

## Solution

Folio is a warm, restrained Windows desktop PDF reader with a feature-complete Browser Edition. It opens PDFs from a picker, drag-and-drop, Windows file association, or “Open with”; remembers the Reading Session; provides continuous reading, thumbnails, search, highlights, ink, text notes, and a deliberate signature flow; and exports real PDF annotations rather than flattening the page. It stores Recent Documents, Annotations, sessions, and settings locally in IndexedDB, with no uploads or telemetry.

The interface uses a warm off-white light theme, a near-black dark theme, a custom title bar, compact controls, a collapsible thumbnail sidebar, and a spacious reading area. Night Reading applies an independent page treatment and persists immediately. The signature flow detects unsigned signature widgets and likely labels on the current page, previews the signature, and requires “Approve and add signature” before committing a transparent native stamp. Existing digital signatures trigger a warning and suppress automatic suggestions. A reusable signature is strictly opt-in, stored locally and unencrypted, and can be forgotten.

Folio ships as a secure Electron application (sandboxed renderer, narrow preload bridge, `app://` production origin, video-only camera permission, validated IPC), an NSIS installer with PDF association and shortcuts, a portable build that honestly disables self-update, and a deployed Browser Edition that shares the same reader core.

## User Stories

1. As a reader, I want to open a PDF from a file picker so that I can start reading without leaving the app.
2. As a reader, I want to drag a PDF onto Folio so that opening is fast and discoverable.
3. As a Windows user, I want Folio registered for PDF files and “Open with” so that it behaves like a real PDF reader.
4. As a Windows user, I want opening a second PDF to reuse the running Folio window so that I do not accumulate duplicate apps.
5. As a returning reader, I want Folio to restore my last page, zoom, rotation, spread mode, sidebar state, and scroll position so that I can continue exactly where I stopped.
6. As a returning reader, I want my window size and position restored within the available monitors so that Folio opens where I can see it.
7. As a reader, I want an explicitly opened file to take precedence over session restoration so that the file I chose is the file I get.
8. As a reader, I want returning to the Library to stop automatic re-opening so that the app does not hijack my next launch.
9. As a night reader, I want Night Reading to persist immediately and restore independently of the interface theme so that both my page comfort and my UI preference survive restarts.
10. As a night reader, I want Night Reading to adapt the PDF page itself, not just the chrome, so that white pages stop glaring.
11. As a reader, I want a Recent Documents library with thumbnails so that I can reopen a document quickly.
12. As a reader, I want to remove a Recent Document without deleting my original file so that the Library stays under my control.
13. As a privacy-conscious reader, I want documents processed locally with no uploads or telemetry so that confidential files stay on my device.
14. As a reader of large PDFs, I want only nearby pages rendered and stale work cancelled so that scrolling and zooming stay responsive.
15. As a reader, I want immediate zoom feedback and a sharper redraw shortly after so that zooming feels direct.
16. As a reader, I want page navigation, an editable page number, and a page count so that I can jump precisely.
17. As a reader, I want Fit Width and Fit Page so that I can choose readability or layout overview.
18. As a reader, I want to rotate the viewer and switch to a two-page spread so that landscape and booklet documents read naturally.
19. As a reader, I want a collapsible thumbnail sidebar so that I can navigate visually and reclaim reading space.
20. As a reader, I want a focus/fullscreen mode so that distractions disappear while I read.
21. As a reader, I want a password prompt with retry and cancel for protected PDFs so that I can open them without the app hanging.
22. As a reader, I want useful loading, empty, and error states so that I always know what is happening.
23. As a reader, I want document information and printing controls so that I can inspect and reproduce what I am reading.
24. As a reader, I want clear tooltips, keyboard focus, active states, and accessible labels so that the interface is usable with a keyboard and assistive technology.
25. As a reader on a small window, I want the layout to adapt so that controls and reading space remain usable.
26. As a reader, I want to search within a document and see the current and total match count so that I can locate information.
27. As a reader, I want next/previous match navigation with scroll-to-result so that I can move through hits efficiently.
28. As a reader, I want a results panel with page numbers and contextual snippets so that I can choose the right match at a glance.
29. As a reader, I want match highlighting in the page text so that I can see the hit in context.
30. As a reader, I want clear no-results feedback so that an empty query state is unambiguous.
31. As a reader of long PDFs, I want search indexing to happen in the background without blocking typing or scrolling so that the app remains usable.
32. As an annotator, I want to select text and highlight it in several colors so that I can mark important passages.
33. As an annotator, I want to draw freehand in a color and thickness I choose so that I can mark diagrams and scanned pages.
34. As an annotator, I want to place a text note with a chosen color and size so that I can add context.
35. As an annotator, I want to select, recolor, move, and delete my annotations so that I can correct mistakes.
36. As an annotator, I want undo and redo for every annotation change so that experimentation is safe.
37. As an annotator, I want my annotations to persist with the document across restarts so that I do not lose work.
38. As an annotator, I want repeated exports to be deterministic and to include all annotations so that sharing the PDF does not require special software.
39. As an annotator, I want annotations exported as native PDF annotations so that other PDF viewers can list and remove them.
40. As an annotator, I want handle rotated PDF pages, viewer rotation, and nonzero CropBox origins correctly so that highlights, ink, and notes land where I drew them.
41. As a signer, I want to draw, type, upload, or camera-capture a signature so that I can use the method I have available.
42. As a signer, I want Folio to suggest unsigned signature fields or likely signature labels on the current page so that signing a form is quick.
43. As a signer, I want to preview, reposition, and resize the signature on any page, including scans, so that it lands correctly.
44. As a signer, I want the signature added only after I click “Approve and add signature” so that nothing is signed automatically.
45. As a signer, I want my signature embedded as a transparent native PDF stamp with undo support so that it looks right and can be removed.
46. As a signer, I want the option to remember a signature off by default, with a clear explanation that it is stored locally and unencrypted, so that I can choose convenience knowingly.
47. As a signer, I want a “Forget saved signature” action so that I can remove reusable signature data.
48. As a signer, I want the app to state that visual signatures are not cryptographic certificates so that I do not overestimate what approval proves.
49. As a signer, I want a warning when the PDF already contains digital signatures so that I understand editing may affect their validity.
50. As a signer, I want camera capture to stop the camera when I close or cancel so that the indicator does not stay on.
51. As a user, I want Folio to distinguish Installed, Portable, Development, and Browser Editions so that I know which capabilities apply.
52. As an installed user, I want update checks, progress, readiness, and actionable errors so that updates are not a mystery.
53. As an installed user, I want unsaved annotations protected before a restart so that an update cannot discard my work.
54. As a portable user, I want Folio to state that self-update is unavailable so that I do not expect an installer path that cannot exist.
55. As a user, I want About Folio to show version, edition, install location, update controls, and an install-folder action so that I can manage the app.
56. As a user, I want Windows security/elevation prompts explained so that an unexpected SmartScreen dialog is not mistaken for a Folio failure.
57. As a distributor, I want the update feed configurable at runtime and unset by default so that Folio never publishes or updates without explicit authorization.
58. As a security reviewer, I want context isolation, sandboxing, no renderer Node integration, validated IPC, a stable secure origin, and a narrow bridge so that the desktop attack surface is bounded.
59. As a security reviewer, I want camera permission restricted to the trusted window and video-only requests so that Folio cannot silently record audio or serve arbitrary pages.
60. As a reviewer, I want representative performance measurements and cleanup evidence so that performance and resource claims are checkable.
61. As a reviewer, I want the Browser Edition deployed so that I can exercise the reader without installing anything.
62. As a maintainer, I want an installer built on Windows CI and a README screenshot so that the delivered product is visible and reproducible.

## Implementation Decisions

### Product surfaces and architecture

- Two build targets share one renderer codebase: an Electron desktop target and a static browser target. The renderer detects a preload bridge; its absence selects the Browser Edition. Edition detection is explicit, not inferred from user-agent text.
- The Reader is a single application-level state machine: Library ↔ Reader, with dialogs (password, print, document info, signature, about) layered above. Document loading has explicit loading, ready, password-required, error, and closed states.
- All local persistence flows through one storage module that owns a single IndexedDB connection. Documents, annotations, sessions, settings, and remembered signatures are separate stores. Persistence is debounced for high-frequency state and flushed on teardown/visibility change.
- The Document Fingerprint (SHA-256 of bytes) is the document identity. The Library is bounded to 24 Recent Documents and 200 MB of cached PDF bytes, evicting least-recently-opened entries except the open document.
- The update bridge, app-info bridge, print bridge, and open-file bridge are optional platform capabilities. Browser Edition capability flags are false; UI switches to browser-native alternatives or hides the action with an explanation.

### PDF engine

- PDF.js handles loading, password callbacks, page rendering, text layers, search text extraction, annotation/widget metadata, and page geometry. The worker is bundled locally; CMap and standard-font data are served from local assets for offline operation.
- Rendering uses a virtualized continuous scroll. Page frames reserve layout size from PDF page dimensions; an intersection observer schedules nearby pages through a render queue (concurrency two). A bounded LRU canvas cache keeps recently visible pages. Render tasks are cancelled on scroll-away, document switch, rotation, and unmount.
- Zoom updates the layout immediately; re-rendering is debounced. Canvases are painted at `min(devicePixelRatio, 2)` and CSS-scaled during the interim. Fit Width and Fit Page derive from the Reading Area and current rotation.
- Two-page spread is a layout transformation over the same continuous page list; the first page may be standalone depending on document parity and the chosen spread start.
- Night Reading applies a page-only CSS filter (invert, hue correction, slight dimming) to canvases and thumbnails. It is independent of Interface Theme and persisted immediately in settings.

### Annotation model and geometry

- Annotations use a discriminated union: Highlight (page, rects, color), Ink (page, strokes, color, thickness), Text Note (page, rect, text, color, fontSize), Signature Stamp (page, rect, image data, rotation, label). Every annotation has a stable id and creation timestamp.
- Geometry is stored in PDF user-space points. Client coordinates are converted through the active PDF.js viewport on creation; stored geometry is converted back through the viewport on paint. Page Rotation, Viewer Rotation, and CropBox origin are handled by these shared helpers. See ADR-0002.
- Highlights can contain multiple text-line rectangles and may span pages by producing one highlight per page. Ink points are stored in user space and painted on a dedicated canvas during pointer interaction so the React tree does not re-render per move. Text notes scale with zoom.
- Every mutation is a command on a per-document undo stack with redo. Moving/resizing a signature or text note is one command. Annotation persistence is debounced; the dirty flag reflects changes not yet persisted.
- Export always rebuilds from the original document bytes plus the current annotation set, producing native `/Highlight`, `/Ink`, `/FreeText`, and `/Stamp` annotations with appearance streams. Signature PNGs remain transparent. Repeated exports do not accumulate annotations.
- Encrypted documents can be read after password entry. Annotation export requires a writable, unencrypted copy; if the loaded document cannot be exported, the failure is explained rather than silently flattening.
- Print renders selected pages at print resolution with annotations composited, then invokes the platform print path (Electron print or browser print window). Page range validation is shared with export.

### Search

- Search indexing starts after a document becomes ready. Text extraction is chunked and yields to the event loop; progress is reported. A new document generation token invalidates all in-flight results.
- Matching is case-insensitive by default with a literal-text fallback; results are grouped by page and include normalized snippets. Counts update as pages are indexed.
- Next/previous navigation scrolls the page into view, selects the current match, and highlights all visible matches. The results panel remains usable while indexing continues. No-results and still-indexing states are distinct.

### Signatures

- Signature capture supports draw (pointer, high-DPI, smoothing), type (bundled handwriting font), upload (PNG/JPEG), and camera capture (video-only `getUserMedia`).
- Captured images are trimmed, downscaled to a bounded size, and converted to transparent PNG by thresholding near-white background pixels. Camera tracks are stopped on every close, cancel, error, and unmount path.
- Signature field detection runs only for the current page after navigation settles. It checks PDF signature widgets first, then likely labels from the text layer (“signature”, “sign here”, “signed by”, with a conservative proximity rule). Existing digital signatures suppress automatic suggestions and display a Signature Warning. There is no OCR and the UI makes no OCR claim.
- The Signature Preview is movable and resizable with handles, supports manual placement on any page, and displays on top of the page at the correct user-space location. Only “Approve and add signature” commits. Cancel discards the preview and any unsaved reusable image.
- A “Remember this signature” control is off by default and only takes effect at Approval. Remembered signatures are stored in IndexedDB with an explicit unencrypted-at-rest explanation and a “Forget saved signature” action. No reusable signature is saved before approval.
- Signature stamps export as `/Stamp` annotations with a transparent PNG appearance stream, unique annotation names, print flag, and correct rectangle under rotation/CropBox. The app never creates a cryptographic signature field and never claims verification.

### Desktop shell, security, and delivery

- Electron uses a frameless window with a custom title bar. Native minimize/maximize/close controls call a narrow window bridge. The title bar is draggable and double-click maximizes. Window bounds and maximized state are persisted and validated against available displays.
- Single-instance lock; second-instance and “open-file” events focus the existing window and deliver a validated PDF path to the renderer. Startup resolves explicit-file intent before automatic restoration.
- Production assets load from `app://folio`; the Vite dev server origin is separately allow-listed for development. Renderer: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, navigation and window-open denied, CSP applied, permissions limited to video for the trusted origin.
- Preload exposes a minimal typed bridge: open dialog, open path events, window controls, print, app info, show installation folder, update check/download/install, and update state. Main validates IPC sender and arguments, rejects non-PDF paths, and never exposes arbitrary filesystem reads.
- Packaging: electron-builder NSIS per-user assisted installer with stable `appId`, PDF file association, Start Menu shortcut, optional desktop shortcut, upgrade-in-place behavior, and a portable target. A Windows CI workflow builds both; Linux builds are for verification only.
- Updates: runtime-configurable `FOLIO_UPDATE_URL` (or a resources config file), disabled in Development, Browser, and Portable Editions. Check and download are explicit; restart requires confirmation when annotations are dirty. About Folio shows version, edition, install location, update state, and open-install-folder. No feed is published by the repository.
- The Browser Edition is built with a GitHub Pages base path, deployed by GitHub Actions, and labeled accurately in About and the README.

### Performance and lifecycle

- All asynchronous work carries a generation/token. Document switches cancel indexing, search, thumbnail generation, page renders, and pending persistence from the previous document.
- Search/snippet work batches and yields; annotation persistence is debounced; high-frequency pointer drawing bypasses React state; zoom re-render is deferred; signature detection is page-scoped and delayed until navigation settles.
- Event listeners, observers, render tasks, object URLs, camera tracks, IndexedDB transactions, and PDF workers are cleaned up on unmount/close. A bounded canvas/thumbnail cache prevents unbounded memory growth.
- A repeatable benchmark on a generated ~300-page PDF records open-to-first-page, text-index time, search response, and interaction yielding. Only measured results are published as evidence.

## Testing Decisions

- **Good tests assert external behavior:** a rendered page, a search count, an annotation visible at a location, an exported PDF opened and inspected, a persisted setting after reload, an IPC rejection. Tests do not assert internal React state, private function names, or exact DOM class names.
- **Unit seams (fast, node/jsdom):** PDF user-space conversion under page rotation 0/90/180/270, Viewer Rotation, and nonzero CropBox origin; search normalization/snippets/counting; annotation command stack and hit-testing; signature image trimming/transparency; annotation export (open exported bytes with `pdf-lib` and PDF.js and assert annotation types, rects, transparency, and idempotent re-export); storage schema and eviction policy with fake IndexedDB; session precedence reducer; edition capability matrix.
- **Integration seam:** the reader runtime against real PDF fixtures and fake storage — open, navigate, search, annotate, undo/redo, sign, export, reload session. This is the highest seam below the UI and keeps byte-level checks close to the PDF engine.
- **End-to-end seam:** Playwright on the real browser build with committed fixtures: Library empty → open → navigate/zoom → search → highlight/ink/note/signature approval → export → reload and restore; theme/night persistence; password-protected PDF retry and cancel; large-document responsiveness. Electron smoke test covers the custom title bar, secure preload, and app-info path.
- **Prior art / fixture strategy:** generate deterministic PDFs in a script (normal multi-page, rotated, offset CropBox, large 300-page, signature widget) and vendor the bytes; generate an encrypted fixture with `pypdf`; use mandatory fixtures only, never the user's documents or saved signatures. Camera tests use Chromium fake media devices.
- **Performance checks:** the benchmark script is not a CI flake gate; it produces an artifact committed under `docs/` for review. E2E responsiveness checks assert that typing/search interactions complete within a generous upper bound while indexing continues.

## Out of Scope

- OCR, scanned-field detection beyond text heuristics, and any claim of such detection.
- Cryptographic signing, certificate management, signature validation, and long-term validation.
- Cloud storage, accounts, sync, collaboration, comments/threads, and telemetry.
- Mobile apps, macOS/Linux installers, and store distribution.
- Redaction, form filling beyond signature stamps, editing existing third-party annotations beyond displaying and removing Folio's own, OCR text layers, EPUB/Office support, plugins, and text reflow.
- Publishing an update feed or signing Windows installers with a commercial certificate.

## Further Notes

- The design decisions and rejected alternatives are recorded in `docs/adr/0001`–`0006`; the full design-tree interview is in `docs/design/grill-session.md`.
- The product language is defined in `GLOSSARY.md`; UI copy should prefer “visual signature”, “stamp”, “Approval”, “Night Reading”, and “Browser Edition” exactly as defined.
- The app must remain useful with no network connection. No runtime network request is required for reading, annotating, signing, exporting, or printing.
- This repository is the delivery vehicle: GitHub Actions builds the Windows artifacts, GitHub Pages hosts the Browser Edition, and the README links both with evidence. No update feed is configured.
