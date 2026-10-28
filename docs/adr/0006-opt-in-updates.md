# Updates are opt-in, edition-aware, and never self-published

**Status:** accepted

The Installed Edition may check and download updates only when a feed URL is explicitly configured at runtime (`FOLIO_UPDATE_URL` or a resources config file). Download and restart are separate user actions. Restart is blocked while Unsaved Annotations exist until the user confirms or saves. Development, Browser, and Portable Editions report their edition and do not offer self-update. The repository does not publish an Update Feed.

**Why:** silent self-update is a one-way trust decision that belongs to the distributor, not to a demo repository. Portable builds have no installer context and would create duplicate or broken installations if they attempted an update. Unsaved annotation loss is unacceptable. Truthful edition labeling is part of the product's trust story.

**Consequences:** About Folio must explain configuration, edition, install location, and potential Windows elevation prompts. electron-updater is loaded only in the Installed Edition. Packaging CI produces installers but does not configure a publisher feed. A distributor who wants updates must set the feed deliberately and accept responsibility for signing and release hygiene.

**Considered options:** hard-coded GitHub Releases feed (rejected: publishes without authorization, and unsigned artifacts would create a poor update experience); auto-download and restart (rejected: data-loss risk and user-hostile); no updater at all (rejected: the product brief requires in-app update controls).
