# Independent review — round 1 synthesis

Two independent reviewers audited the integration branch before the first PR. Both used the repository spec, ADRs, source, tests, and committed evidence. Neither edited files.

## Verdicts

- **Engineering:** “Not ready for the first PR as-is” — five blockers around camera cleanup, annotation eviction, note clipping, launch precedence, and rotated-page QuadPoints.
- **Product/UX:** “NO-SHIP” — additionally found the 820px thumbnail overlap, rotated signature preview mismatch, missing annotation movement, search scroll-to-page, print scaling, deterministic-export gap, accessibility contrast/target issues, and delivery links that were not live yet.

The reviewers converged on the same data-loss and geometry issues from different directions. That overlap drove the fix order below.

## Findings and dispositions

| Finding | Source | Disposition |
| --- | --- | --- |
| Camera stream could outlive a dialog closed while `getUserMedia` was pending | Engineering | **Fixed.** Request generations + stream refs; pending streams are stopped after close. Regression test with delayed fake camera. |
| Automatic eviction deleted annotation records; open document could be evicted | Both | **Fixed.** Eviction deletes cached metadata/bytes only; annotations remain keyed by fingerprint. Open and new documents are protected. Tests added. |
| Long text notes clipped on screen and in export | Both | **Fixed.** Notes auto-grow, export expands the appearance/Rect to the wrapped content, and an E2E test exercises a long note. |
| Launch-file intent lost after a 1.5 s race | Both | **Fixed.** Boot awaits the launch IPC result; the timer race was removed. |
| Rotated highlight QuadPoints were emitted in the wrong order | Engineering | **Fixed.** Corners are sorted into PDF upper-left/upper-right/lower-left/lower-right order; rotated CropBox export test added. |
| Canceling during the cache-write phase could still open the document | Engineering | **Fixed.** Token check after the save step; cancellation bumps the generation. |
| Opening another PDF did not flush the current Reader | Engineering | **Fixed.** The previous Reader is flushed and must succeed before a new open proceeds. |
| Annotation read failure could be treated as an empty set and overwrite data | Engineering | **Fixed.** The read error propagates and aborts the open, keeping the current document. |
| Signature preview and approved stamp disagreed on rotated pages | Product | **Fixed.** Preview uses the same quad transform as the committed stamp; drag/resize remaps the screen quad and preserves orientation. E2E comparison test added. |
| Text notes and signatures could not be moved after creation | Product | **Fixed.** Select tool drags box annotations; a corner handle resizes them. Each gesture is one undoable command. E2E move/undo test added. |
| Search scrolled only to the page, not the match | Product | **Fixed.** The active text range is scrolled into the reading viewport; active-match anchor + E2E at 200% zoom. |
| Print rendered at 2× physical size | Product | **Fixed.** Raster remains 2× for quality, but CSS inches derive from scale-1 page dimensions with automatic height; unit coverage added. Viewer rotation is passed through. |
| Repeated exports differed by timestamps | Both | **Fixed.** Annotation `/M` uses stable annotation timestamps; unit test now compares full bytes. |
| 820px thumbnail rail covered the page | Product | **Fixed.** The rail stays in flow at 820px; below 760px it is an overlay and is collapsed by default/on resize. E2E geometry assertion added. |
| Search navigation hidden while indexing | Product | **Fixed.** Navigation stays available as partial results arrive; active results scroll into view. |
| “Forget saved signature” reported success before deletion | Engineering | **Fixed.** Deletion is awaited and errors are surfaced. |
| Modal-open keyboard shortcuts mutated the background | Product | **Fixed.** Reader shortcuts return early while a dialog is open. |
| Library advertised Ctrl+O but did not implement it | Product | **Fixed.** Library-level shortcut opens the picker; E2E added. |
| Unbounded thumbnail/signature caches | Engineering | **Fixed.** Bounded LRU caps for both caches. |
| Signature label heuristic suggested prose | Engineering | **Fixed.** Labels are limited to short standalone phrases and prose sentences are rejected; unit test added. |
| Camera permission checks were broader than video-only main-frame content | Engineering | **Fixed.** Request/check handlers validate security origin, main frame, and video-only media types. |
| Accessibility: low contrast, target sizes, hover-only destructive actions | Product | **Addressed.** Contrast tokens meet 4.5:1 in the light theme; primary controls are 32px, secondary controls ≥24px, touch devices get larger targets and visible remove/delete actions; missing tooltips added. |
| README evidence/delivery links not live at audit time | Product | **Sequenced.** Pages deployment and the Windows release run after merge; README claims are checked again after deployment. The library screenshot was regenerated from a populated state. |
| True fullscreen vs focus mode | Product | **Deferred, documented.** Focus mode hides chrome but does not request OS fullscreen. |
| Non-Latin text-note glyph coverage | Engineering | **Improved, limited.** Export embeds DejaVu Sans, covering Latin extended, Greek, Cyrillic, and monochrome emoji. CJK glyphs remain a documented font limitation rather than a silent export failure. |
| Signed-PDF fixture / tri-state digital-signature check | Product | **Improved.** The check is tri-state (checking/none/present/unavailable); unavailable suppresses suggestions and warns. A signed fixture is not committed. |
| Print preview visual output on a printer | Product | **Partially verified.** HTML dimensions and page range are unit-tested; physical printing still requires a printer/CI device. |

## Round 2 dispatch refinement

Round 1 was split as broad engineering vs broad product. Round 2 narrows the dispatch:

- **Reviewer A (technical verification):** adversarial re-check of every fixed blocker, with emphasis on camera cleanup, eviction/annotation retention, rotated QuadPoints/preview, launch precedence, byte-identical export, print dimensions, and packaging/CI behavior. Verify through tests and runtime probes, not prose.
- **Reviewer B (release/UX verification):** regression check at 820/390px, modal keyboard isolation, search-match visibility, annotation move/resize, trusted signature copy, accessibility tokens/targets, and every README link/claim. Treat post-merge Pages/release steps as pending delivery, not as code defects, but list anything that must be verified after merge.

Both reviewers receive this document as context for what changed, but are asked to verify independently rather than accept the dispositions.
