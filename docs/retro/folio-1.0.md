# Folio 1.0 retrospective

Session date: 2026-10-28. Scope: the full Folio 1.0 delivery, from grill and spec through implementation, two review rounds, merge, Pages deployment, and the Windows release tag.

## Outcome

Folio 1.0 shipped as a local-first PDF reader with annotations, visual signatures, native PDF export, and two editions: Electron for Windows and a static Browser Edition. The spec and ten delivery tickets were published as issues #1–#11 before implementation. The work landed as one integration PR (#12, merged as `71beb3e`), followed by the `v1.0.0` tag.

Verification at merge:

- Typecheck, lint, 33 unit/integration tests, 23 browser E2E tests, and 2 Electron tests passed.
- The Browser Edition deployed at <https://gerrcass.github.io/folio-pdf-app/> and passed a live smoke test: the Library rendered, the committed 10-page fixture opened, the first canvas painted at 618 px, all 10 page frames were present, and the browser console was clean.
- The 300-page performance baseline is committed in `docs/performance.md`.
- Windows installer and portable artifacts are built by the tagged Windows workflow and attached to the release. The installer is unsigned and no update feed is published.

Round-1 and round-2 reviews are recorded in `docs/design/review-round-1.md` and `docs/design/review-round-2.md`, including every finding and its disposition.

## What worked

**The docs chain front-loaded the expensive decisions.** The grill session, GLOSSARY, six ADRs, and spec fixed the vocabulary and boundaries before code existed: PDF user-space geometry, a custom annotation layer, local-first IndexedDB, the hardened Electron surface, virtualized scrolling, and opt-in updates. Those choices did not need to be relitigated during implementation.

**The tracer bullet covered both targets early.** The shell ticket proved Electron, the static browser build, the preload bridge, and the design tokens together. Later work inherited a working two-target build instead of discovering platform differences at delivery time.

**Round 2 used a sharper dispatch.** Round 1 split reviewers into broad engineering and broad product audits. Both found the same data-loss and geometry issues, and neither exercised the packaged export path deeply enough. Round 2 split by verification surface: one reviewer attacked the technical trust boundary and every claimed fix, the other checked release/UX requirements and links. That dispatch found the blank text-note appearance that only appeared in a production build and the annotation-store failure path that blocked opening any PDF.

**Independent rendering caught a class of bug the app tests missed.** Reopening exported PDFs in PyMuPDF, not only PDF.js, exposed the Identity-H font-string bug. The fix used `font.encodeText()` with a hex `/Contents` string and added a real-font test.

**Post-merge delivery was treated as its own phase.** Pages enablement, the Windows build, the live smoke test, and release artifacts were checked after merge rather than being asserted as complete in the PR. That kept code readiness separate from deployment readiness.

## What cost time

**Broad review briefs duplicated coverage.** Round 1 produced two long lists with overlapping blockers. The overlap was useful confirmation, but the reviewers spent attention on the same surfaces while the production export path went unexercised.

**The first Pages deploy failed on a repository setting, not code.** The workflow assumed Pages was enabled. It was not, so `configure-pages` returned `Resource not accessible by integration`. Enabling Pages through the API and rerunning the job fixed it. This was a predictable preflight check that no ticket owned.

**Windows packaging could not be verified locally.** The local environment is WSL/Linux, so NSIS and portable artifacts depend on the Windows CI runner. The workflow was written early, but its first real execution happened at the tag, which puts packaging risk at the end of the delivery.

**A single integration PR made the final review large.** It concentrated the evidence in one place, which matched the delivery ticket, but it also meant reviewers had to hold the whole feature surface at once. Stacked PRs per risk area would have produced smaller, more targeted reviews.

## Improvements, in severity order

1. **Add a packaged-artifact export smoke test to CI.** Build the web bundle, export an annotated document from that build, render the result with an independent parser, and assert that text-note appearances are non-blank. This would have caught the round-2 blocker before review. Add the parser as a dev-only CI dependency or a small script with a pinned wheel.
2. **Make deployment settings a preflight, not a post-merge discovery.** Before merging a delivery PR, check that Pages exists and that the repository homepage, workflow permissions, and environment are configured. A short `scripts/preflight-delivery.sh` could assert these through `gh api` and fail loudly.
3. **Dispatch reviews by risk surface with required probes.** The round-2 split worked. Make it the default: data integrity and storage, geometry and export math, Electron security and packaging, and release UX and accessibility. Give each reviewer the specific commands or artifacts to exercise, not just a topic.
4. **Commit a digitally signed PDF fixture.** The tri-state signature warning and suggestion suppression are code-reviewed but not exercised by an automated fixture. This remains the largest untested trust-surface behavior.
5. **Add a physical print check to the release checklist.** Print ranges and CSS dimensions are tested, but no real printer or print-to-PDF device has produced a page. A manual check on Windows belongs in the release checklist, not in unit tests.
6. **Record the Windows install checklist.** File association, in-place upgrade, portable identity, SmartScreen copy, and update-feed absence need a real Windows install. Keep the checklist next to the release workflow so it is run for every tag.
7. **Keep the review documents as navigation targets.** `AGENTS.md` points at the spec and ADRs but not at the review records or this retrospective. Add pointers so a later agent sees the known limitations before reopening a settled decision.

## Follow-ups left open

- CJK glyphs are not embedded in exported text notes. Latin extended, Greek, Cyrillic, and monochrome emoji are. The limitation is documented in the README and spec.
- A committed digitally signed PDF fixture is still absent.
- Physical printing is verified at the HTML/layout level only.
- Windows file association, NSIS upgrade behavior, and the installed updater flow need a real Windows install; the CI build proves packaging, not installation.
- The installer is unsigned. No update feed is configured or published.

## Lesson

The review process improved when it stopped asking reviewers to be broadly skeptical and started assigning them surfaces to break with specific probes. The remaining gaps are the ones with no automated probe yet: installed Windows behavior, physical printing, and signed-PDF detection.
