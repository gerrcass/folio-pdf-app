# Custom annotation layer with native PDF export

**Status:** accepted

Folio renders PDFs with PDF.js but keeps its own Annotation model instead of using PDF.js's `AnnotationEditorLayer`. PDF.js remains responsible for page rendering, text layers, search text, form widgets, and password handling; Folio paints Highlights, Ink, Text Notes, and Signature Stamps in a separate geometry layer and exports them as native PDF annotations using `pdf-lib` plus low-level annotation and appearance-stream construction.

**Why:** one annotation model must serve screen rendering, selection, undo/redo, the Annotation Panel, session persistence, and byte-level export. The PDF.js editor does not cover transparent Signature Stamps or the deterministic “regenerate from original bytes” export that this product promises, and its internal storage is not a stable API surface. Exporting real `/Highlight`, `/Ink`, `/FreeText`, and `/Stamp` annotations keeps the result editable in other PDF software.

**Consequences:** Folio owns geometry, hit-testing, appearance streams, and export tests. It must not flatten annotations into page content, and it must always export from the original Document bytes plus the current command state so repeated exports are deterministic. See ADR-0002 for coordinates.

**Considered options:** using PDF.js's editor and `saveDocument` (rejected: insufficient control over stamps, undo/redo, and export determinism); flattening annotations into page pixels (rejected: destructive, not native, poor text quality).
