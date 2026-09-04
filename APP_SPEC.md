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

