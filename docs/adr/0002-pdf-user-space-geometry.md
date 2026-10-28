# PDF user space is the source of truth for annotation geometry

**Status:** accepted

Annotation geometry is stored in PDF user-space points relative to the page, never in CSS pixels or normalized 0–1 coordinates. Creation converts client coordinates through the active PDF.js viewport; rendering converts the stored geometry back through the viewport at its current scale, Viewer Rotation, and Page Rotation. Export uses the stored points directly.

**Why:** the same Annotation must survive zoom changes, Fit Width/Fit Page, Viewer Rotation, PDF Page Rotation, high-DPI rendering, and nonzero CropBox origins. Pixel coordinates fail on the first zoom; normalized coordinates are ambiguous under rotation and offset boxes. PDF.js's viewport conversion is the only conversion that accounts for all four PDF/display transforms at once, so using it in both directions makes screen and file agree by construction.

**Consequences:** every annotation interaction must go through the shared conversion helpers; tests must cover 0°/90°/180°/270° page rotation, Viewer Rotation, and a CropBox whose origin is not `0,0`. Signature placement, hit-testing, export Rect/QuadPoints, and print rendering all share these helpers. Ink points are stored individually in user space.

**Considered options:** normalized page coordinates (rejected: rotation ambiguity, CropBox origin loss); CSS pixels (rejected: not durable); storing viewport rectangles (rejected: becomes wrong after viewer rotation).
