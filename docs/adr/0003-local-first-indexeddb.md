# Local-first IndexedDB library with content fingerprints

**Status:** accepted

Recent Documents and their Annotations, Reading Sessions, settings, and Remembered Signatures live in IndexedDB on the device. A Document's identity is the SHA-256 fingerprint of its bytes. PDF bytes are cached for reopening, bounded to 24 Recent Documents and 200 MB; the least-recently-opened cached documents are evicted first, never the open Document. Annotation records are keyed by content fingerprint and survive cache eviction; only an explicit remove deletes them. No PDF or signature data leaves the device, and there is no telemetry.

**Why:** paths break when files move and do not exist in the Browser Edition; names collide; IndexedDB works identically in Electron's sandboxed renderer and on GitHub Pages. Content identity makes annotations survive renames and deduplicates imports. A byte budget is necessary because PDFs are large and IndexedDB quota is finite.

**Consequences:** the app must handle quota errors and eviction honestly, show cached-document state in the Library, reuse one IndexedDB connection, debounce persistence, and flush on teardown. Remembered Signatures are explicitly unencrypted and can be forgotten in one action. Cached bytes are a convenience, not a backup.

**Considered options:** file paths (rejected: moves, browser incompatibility); File System Access handles (rejected: Chromium-only, permission prompts, brittle); server storage (rejected: violates local-first privacy).
