# Independent review — round 2 verification

A second pair of independent reviewers audited the round-1 fixes. The dispatch was narrowed: one reviewer checked the technical trust surface adversarially, the other checked release/UX/requirements with post-merge delivery treated separately from code.

## Round 2 blockers found

1. **Text-note appearance was blank in production builds** (the round-1 Unicode font work had used a solid-font string with an Identity-H font). Fixed by encoding lines with `font.encodeText()` and using a hex string for `/Contents`; added a real-font unit test. Verified by rendering an exported PDF with PyMuPDF.
2. **An annotation-store read failure blocked opening any PDF.** Fixed with an explicit reading-only mode: the document opens, the warning is visible, annotation tools are disabled, and no empty set is written. E2E test with IndexedDB disabled.
3. **A failed annotation save deadlocked Export and leaving.** Fixed: export proceeds from in-memory annotations with a warning, and leaving offers an explicit “Leave without saving?” path. E2E test with a forced `QuotaExceededError`.
4. **Signature preview, stamp, and export used different image-fit policies.** Fixed to a single fill policy so the preview, on-screen stamp, print, and PDF appearance agree.
5. **Toolbar controls were clipped at 820/780px.** Fixed with a compact toolbar layout and E2E bounds assertions.
6. **The 390px signature footer clipped the trust copy.** Fixed with a wrapped modal footer and E2E bounds assertions.
7. **Search did not scroll horizontally to the active match at high zoom.** Fixed with a two-axis match scroll and an explicit navigation token; E2E now forces horizontal scroll before selecting the result.
8. **A capture-processing error left the camera live.** Fixed by stopping the stream in the capture error path (and on `video.play()` failure); E2E forces a canvas error and checks track cleanup.
9. **Other hardening from the same review:** long notes clamp inside page bounds, box annotation drags/ink clamp to the page, signature preparation ignores late completion after Cancel, signed widgets with values are not suggested, the AcroForm note font uses a unique resource name, annotation writes have a quota-prune retry, close grace was extended, and the 760px breakpoint/compact overlay behavior was aligned.

## Deferred or post-merge verification

- A committed digitally signed PDF fixture is still absent; the tri-state detection UI is code-reviewed but not exercised by an automated fixture. Add one and test warning/suppression/unavailable copy.
- Physical printing was validated at the HTML/layout level, not against a real printer.
- Windows file association, NSIS upgrade behavior, and the installed updater flow require the Windows CI job and a real Windows install.
- Pages and the latest release are created after merge; those links are checked in the post-merge checklist.
- CJK glyphs are not in the bundled export font. The limitation is documented; Latin extended, Greek, Cyrillic, and monochrome emoji are embedded.

## Final gate

After these fixes, typecheck, lint, 33 unit tests, 23 browser E2E tests, and 2 Electron tests pass. The branch is ready to open as a PR with the understanding that the Windows installer, live Browser Edition, signed-PDF fixture check, and physical printer check remain post-merge delivery/verification items.
