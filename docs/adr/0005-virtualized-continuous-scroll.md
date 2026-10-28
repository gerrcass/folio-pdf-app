# Virtualized continuous scroll with a bounded render budget

**Status:** accepted

Single-page mode is continuous vertical scrolling; two-page mode lays facing pages into continuous spread rows. Only pages near the viewport are painted, through a render queue with a concurrency of two and a small LRU canvas cache. Zoom updates the layout immediately and re-renders at the new scale after a short debounce; stale canvases are CSS-scaled in the meantime. Page render tasks are cancelled when a page leaves the window, the document changes, or the component unmounts.

**Why:** rendering every page of a 300-page document up front consumes memory and blocks navigation. Paged-only navigation makes scroll restoration meaningless and feels less like a reader. Continuous scroll plus virtualization gives the expected reading experience while keeping work proportional to what is on screen. Immediate layout feedback keeps zoom feeling direct even though high-quality redraw is deferred.

**Consequences:** page frames need stable, precomputed dimensions for correct scroll anchors; thumbnails are a separate bounded cache. The Reader must handle fast scroll, document switches, and rotation changes without painting a stale page into a new layout. Performance evidence must measure this path rather than claim it.

**Considered options:** render-all (rejected: memory and latency); single page at a time (rejected: worse reading feel, no meaningful scroll restoration); virtualized CSS transforms over a fixed canvas (rejected: poor text-layer alignment and accessibility).
