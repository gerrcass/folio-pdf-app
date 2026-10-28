# Coding standards

Reviewers enforce these. Implementation agents should still keep them in view.

## Mechanical rules

- No `any` in exported types or public module signatures. `unknown` plus narrowing at boundaries.
- PDF.js viewport conversions live only in `src/pdf/geometry.ts`. No ad-hoc rotation math elsewhere.
- Annotation geometry crossing a module boundary is PDF user-space points. A CSS-pixel rectangle in a non-UI module is a defect.
- `pdf-lib` is imported only by the export module and fixture generator. It must not leak into rendering or UI code.
- IndexedDB access lives only in `src/storage/`. Components use storage services, never raw `indexedDB`.
- Electron privilege lives behind `src/platform` and validated IPC. No `window.require`, no remote modules, no renderer path reads.
- No `dangerouslySetInnerHTML` except the print document written through a dedicated DOM builder that escapes user text.
- No timers or subscriptions without a matching cleanup in the same module.
- No new runtime dependency without a note in the PR explaining why an existing one cannot do the job.
- No network requests at runtime. Asset and update-feed URLs are exceptions only where explicitly configured.

## Behavior and UI

- Every icon-only control has an accessible name and a tooltip. Every interactive element is keyboard reachable and shows a visible focus ring.
- Dialogs use the native `<dialog>` element and restore focus on close. Escape closes unless an operation is in flight.
- Loading, empty, error, and disabled states are designed, not incidental. Disabled controls explain why where the reason is not obvious.
- User-facing copy uses the glossary. “Signature” is visual unless explicitly qualified; never “secure signature”, “verified”, or “legally binding”.
- Destructive actions confirm, and the confirmation names the exact object and consequence.
- Touch and pointer targets are at least 32×32 CSS px.
- Layouts remain usable at 720×520 (desktop minimum) and 380px viewport width (browser).
- Motion is short and restrained; respect `prefers-reduced-motion`.

## Data and errors

- Persistence failures are visible and do not silently lose state. Include a recovery path.
- Quota errors, corrupt PDFs, wrong passwords, unsupported encryption, and export failures have specific messages.
- Eviction never deletes the user's source file and never removes the open document.
- Remembered Signatures are only stored after Approval with the control enabled; “Forget saved signature” removes them from IndexedDB.
- No logging of PDF content, passwords, signature images, or user file paths to remote destinations. Local console logs must not include those values.

## Tests

- Test external behavior: a rendered page, a search count, a persisted value, an exported annotation. Do not test internal state names.
- Every bug fix gets a regression test at the lowest seam that can express it.
- Geometry and export tests must cover rotation 0/90/180/270, Viewer Rotation, and nonzero CropBox.
- E2E uses committed fixtures and isolated browser profiles. Never touch the user's real documents or saved signatures.
- Performance evidence must be reproducible with `npm run bench` and recorded with the environment.
