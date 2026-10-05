# ORC Viewer App Spec

## Purpose

Open Apache ORC files locally and inspect schema, stripes, column statistics, metadata, and a paged data preview.

## v1.0.0 scope

- One or many `.orc` files
- Register supported files as separate tabs before parsing, so one broken file does not stop the remaining files from opening
- Allow additional `.orc` drag and drop while files are already open
- Per-file tab state; a broken file never leaks its error or content into another tab
- Tail-first inspection of PostScript and Footer
- Schema Tree / Raw views
- Stripe list and file-level column statistics
- Data preview reads only stripes overlapping the current page
- Primitive types plus struct/list/map/union decoding
- Generic compression: NONE, ZLIB, SNAPPY, LZ4; ZSTD when browser-native decoding is available; LZO unsupported
- Table / Record views, column visibility, current-page sorting, Cell Inspector
- Current-page CSV copy/save
- Japanese / English and mobile bottom navigation
- Fully local processing; `connect-src 'none'`

## Non-goals for v1.0.0

- Editing or rewriting ORC
- SQL/query engine
- Whole-file CSV export
- LZO decompression

## Page result ownership and CSV readiness

- Each file owns independent inspection and page-request generations. Only the latest page request for the same header, page number, and page size may commit rows, errors, or loading state.
- Starting a page clears the previous result and disables both Copy CSV and Save CSV. Their handlers also reject unavailable results.
- CSV becomes available only after successful inspection and completion of the selected page. A successful empty page can export its column headers.
- Rapid page jumps and page-size changes must not mix the range label, visible records, and CSV. Superseded reads stop after their current stripe completes.
- Switching tabs preserves each file's latest result, sort, hidden columns, filename, and two-stripe cache. A completed empty page is not reloaded just because its tab is activated.
- A failed page can be retried by changing the rows per page or switching away and back. Inspection or page work from a closed tab cannot restore its rows, cache, progress, or UI.
- Reinspection invalidates old page results and cached stripes before parsing again. ORC decoding and compression support are unchanged.

## Automated regression checks

Run `scripts/check-repository.ps1` with PowerShell and Node.js 24 or later. It builds both standalone variants and runs the same small synthetic page-state regressions against source, readable HTML, the self-extract payload, and tracked root HTML. These tests do not execute a browser or parse actual ORC files.
