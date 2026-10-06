# ORC Viewer App Spec

## Purpose

Open Apache ORC files locally and inspect schema, stripes, column statistics, metadata, and a paged data preview.

## v1.0.1 scope

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

## Non-goals for v1.0.1

- Editing or rewriting ORC
- SQL/query engine
- Whole-file CSV export
- LZO decompression

## Root values and header labels

- Non-STRUCT roots retain the schema field name `root` in decoded row wrappers, Table, Record, Cell Inspector, current-page sorting, and CSV. Null, list, map, union, binary, and logical values are preserved by this wrapper; STRUCT root fields remain unchanged.
- The header language button shows the target language as EN or JA, with a localized accessible name and tooltip. Keep the existing Japanese/English fully-local badge and privacy explanation.
- Timestamp decoding is unchanged: presentation is limited to milliseconds and has known writer-time-zone limitations. In the Apache `TestOrcFile.testTimestamp.orc` fixture, records 10 and 12 render one hour earlier than the gold wall-clock values. This patch repairs missing fields, not timestamp fidelity.

## Page result ownership and CSV readiness

- Each file owns independent inspection and page-request generations. Only the latest page request for the same header, page number, and page size may commit rows, errors, or loading state.
- Starting a page clears the previous result and disables both Copy CSV and Save CSV. Their handlers also reject unavailable results.
- CSV becomes available only after successful inspection and completion of the selected page. A successful empty page can export its column headers.
- Rapid page jumps and page-size changes must not mix the range label, visible records, and CSV. Superseded reads stop after their current stripe completes.
- Switching tabs preserves each file's latest result, sort, hidden columns, filename, and two-stripe cache. A completed empty page is not reloaded just because its tab is activated.
- A failed page can be retried by changing the rows per page or switching away and back. Inspection or page work from a closed tab cannot restore its rows, cache, progress, or UI.
- Reinspection invalidates old page results and cached stripes before parsing again. ORC decoding and compression support are unchanged.

## Column selection and current-page sorting

- Columns includes a Japanese/English column-name search, clear action, matching/total count, and no-match state.
- Search is a literal case-insensitive substring of top-level field names, including Japanese and punctuation. It does not search values or decode more stripes.
- All checkbox drafts stay mounted while nonmatching labels are hidden. Searching alone never changes visibility, rows, sorting, or CSV output.
- Done applies every checkbox, including search-hidden labels. Show all checks every column regardless of the query. Cancel, close, backdrop, and native Esc discard pending changes; opening Columns resets the query and focuses search.
- Table column names are native keyboard-operable buttons. Sorting retains the existing ascending → descending → original-order cycle and current-page comparator, including null-last ordering.
- Header `aria-sort` and a visible indicator expose direction; after a sort rerender, focus returns to the activated header button when it held focus.
- Keyboard-activated dialog controls must not be treated as backdrop clicks; only a click targeting the dialog itself and outside its bounds dismisses it.
- Column indexes remain the identity even for duplicate names. Labels render as text. DECIMAL fields sort by exact numeric value using normalized sign/integer/fraction digits, with nulls last and source-stable equal values in both directions. Other field types retain their comparator. Parser, nested values, BigInt/binary formatting, CSV schema, page ownership, and two-stripe cache are unchanged.

## Automated regression checks

Run `scripts/check-repository.ps1` with PowerShell and Node.js 24 or later. It builds both standalone variants and runs the same small synthetic page-state and column-inspection regressions against source, readable HTML, the self-extract payload, and tracked root HTML. The page-state tests use decoder/DOM doubles. The root-value tests also parse genuine pinned Apache ORC timestamp, STRUCT, decimal and empty fixtures and verify Table/Record/Inspector/CSV functions. Collection-root controls isolate the row adapter with a decoder double. None of these Node.js tests execute a browser. Fixture provenance and known timestamp exceptions are documented in `scripts/fixtures/orc/README.md`.
