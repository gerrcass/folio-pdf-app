# Folio glossary

The shared language of the product. This file contains definitions, not implementation decisions.

## Product and surfaces

**Folio** — the PDF reader and annotation application described by this repository.

**Library** — the home surface listing Recent Documents and offering Open. It is not a file manager.

**Reader** — the surface in which a Document is read and annotated.

**Browser Edition** — Folio running in a web browser. It has the same reader core but no operating-system integration, custom window controls, native installer, or self-update.

**Installed Edition** — Folio installed by the Windows installer. It may self-update when an Update Feed is configured.

**Portable Edition** — Folio running from an unpacked portable build. It has no installer and must not offer self-update.

**Development Edition** — Folio run from source. It must not offer self-update.

**Trusted Application Content** — the Folio renderer served from the application origin. Only this content may use privileged operations.

## Documents and sessions

**Document** — a PDF opened in Folio.

**Document Fingerprint** — the SHA-256 digest of a Document's bytes. It is the identity used for annotations, Recent Documents, and reading history, so a rename or a different open route does not create a second document.

**Recent Document** — a Document cached in the Library for quick reopening, with its name, page count, thumbnail, and last-opened time. Recent Documents are local to the device.

**Reading Session** — the remembered position and view of a Document: page, zoom, rotation, scroll position, sidebar visibility, spread mode, and the Document identity.

**Explicit Open** — a Document opened by the user through a file picker, drag-and-drop, file association, or “Open with”. An Explicit Open always takes precedence over automatic restoration.

**Automatic Restoration** — reopening the last Reading Session on launch when no Explicit Open has occurred. Returning to the Library disables the next Automatic Restoration.

**Night Reading** — a page-rendering treatment that darkens and hue-corrects PDF pages for comfortable reading at night. It is independent of the interface theme.

**Interface Theme** — the light or dark appearance of Folio's own controls and surfaces.

## Reading and navigation

**Page Frame** — the layout box that reserves a page's size in the Reader, whether or not its content has been painted yet.

**Single-page Mode** — continuous vertical scrolling with one Page Frame per row.

**Two-page Spread** — a layout mode that places facing pages in one row, with continuous scrolling by spread.

**Viewer Rotation** — rotation applied by Folio at read time, in addition to any rotation stored in the PDF page.

**Page Rotation** — rotation stored in the PDF page itself.

**CropBox Origin** — the lower-left offset of a page's visible box. It is often nonzero in scanned documents.

**Fit Width** — a zoom mode that makes a page as wide as the available reading area.

**Fit Page** — a zoom mode that makes a page fit entirely within the available reading area.

**Focus Mode** — a reading layout that hides non-essential chrome while preserving access to essential controls.

**Reading Area** — the space in the Reader occupied by Page Frames, excluding sidebars and toolbars.

## Search

**Search Index** — the per-page plain text extracted from a Document for searching. It is built after opening and may still be filling while results appear.

**Search Match** — one occurrence of the query in a page's text.

**Search Result** — a page-grouped list entry showing a snippet around a Search Match.

**Snippet** — a short, whitespace-normalized excerpt around a Search Match, with the match emphasized.

## Annotations

**Annotation** — a user-created overlay belonging to a Document: a Highlight, Ink stroke, Text Note, or Signature Stamp.

**Highlight** — an Annotation created from a text selection, composed of one or more rectangular bands.

**Ink** — a freehand Annotation made of one or more strokes with a color and thickness.

**Text Note** — a short text Annotation placed at a point on a page, with a color and font size.

**Signature Stamp** — a Signature placed as a transparent visual stamp Annotation.

**Signature** — a visual image of a person's signature, created by drawing, typing, uploading, or camera capture. It is not a cryptographic digital certificate.

**Signature Field Suggestion** — a proposed location for a Signature Stamp, derived from an unsigned PDF signature widget or a likely signature label on the current page. A suggestion is never committed automatically.

**Approval** — the explicit “Approve and add signature” action that commits a Signature Stamp to a Document.

**Remembered Signature** — an optional, off-by-default Signature image stored locally for reuse. It is not encrypted at rest.

**Annotation Inspector** — the compact control surface for the selected Annotation.

**Annotation Panel** — the Reader panel listing Annotations for the Document.

**Undo Stack / Redo Stack** — the ordered commands available to undo or redo Annotation mutations.

**Native Annotation** — an annotation represented in the exported PDF as a PDF annotation object with an appearance stream, rather than pixels burned into page content.

**Export** — producing a new PDF from the original bytes of a Document plus its Annotations.

**Dirty** — a Document with Annotation changes that have not yet been persisted or exported.

**Unsaved Annotations** — Annotation changes that would be lost by closing or restarting.

## Signatures and trust

**Digital Signature** — a cryptographic PDF signature that can support integrity and identity checks in compatible software. Folio can detect the presence of signature fields and warns about editing; it does not create, verify, or repair Digital Signatures.

**Signature Warning** — the notice shown when a Document already contains a Digital Signature, explaining that editing may affect its validity.

**Signature Preview** — the movable, resizable presentation of a Signature Stamp before Approval.

## Desktop and delivery

**Custom Title Bar** — the Folio-drawn top strip that provides window dragging, the application menu, and native minimize, maximize, and close controls in the Installed and Portable Editions.

**File Association** — the operating-system registration that lets Folio open PDF files from Explorer or “Open with”.

**Single-instance Behavior** — the guarantee that opening a second PDF targets the existing Folio process instead of starting a second copy.

**Update Feed** — the configured source of installer updates for electron-updater. It is unset unless the application is deliberately configured by its distributor.

**Update Channel** — the feed and release selection used by the updater. Folio never publishes a feed by itself.

**Update Ready** — the state in which an update has downloaded and is waiting for an explicit restart.

**Installation Folder** — the directory containing the installed Folio executable, shown in About Folio.

**Eviction** — removal of the least-recently-opened Recent Document's cached bytes and thumbnail when the Library exceeds its count or byte budget. Annotations remain keyed to the Document Fingerprint and return if the file is reopened; eviction never deletes the user's original file. Only an explicit remove deletes annotation data.
