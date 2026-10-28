# Hardened Electron surface with a stable application origin

**Status:** accepted

The Electron renderer runs with `contextIsolation`, `sandbox`, and no Node integration, loading production assets from a custom `app://folio` origin. A narrow preload bridge exposes only open-file, print, app-info, install-folder, and update operations. Main validates the sender before privileged IPC, validates file arguments as existing PDFs, denies navigation and window creation, sets a CSP, and grants camera permission only to the trusted origin and only for `video` requests.

**Why:** a PDF reader parses untrusted files and displays untrusted metadata; the renderer is the largest attack surface. A stable secure origin is required for IndexedDB isolation, camera permission scoping, and a CSP that does not need `file://` exceptions. Restricting privileged operations to the trusted window prevents a compromised or navigated renderer from reading arbitrary paths.

**Consequences:** Electron development uses the Vite origin while packaged builds use `app://folio`; both are allow-listed deliberately. File paths never cross into the renderer as capabilities. Print and update flows must be explicit IPC calls, and the web edition must degrade cleanly when the bridge is absent. Camera tracks must be stopped on every close path.

**Considered options:** `file://` loading (rejected: weak origin and CSP story); exposing Node in the renderer (rejected: unacceptable); a localhost server (rejected: extra port, firewall, and lifecycle risk).
