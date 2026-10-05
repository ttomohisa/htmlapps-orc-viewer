# Changelog

## Unreleased

- Keep page rows, range labels, and CSV aligned when page reads complete out of order.
- Disable and guard CSV copy/save until the current page is successfully loaded, including initial inspection and read failures.
- Ignore obsolete loading/error updates and work from closed or reinspected tabs; preserve per-file state and the two-stripe cache.
- Add small source-level regressions for page races, retry, empty results, tabs, cache reuse, sorting, columns, and export filenames across all release entry points.

## v1.0.0 - 2026-09-04

- First stable release.
- Finalize the shared Data Viewer-series UI and per-file tab state handling.
- Verify multi-file loading, invalid-file isolation, paging, Cell Inspector, CSV export, Japanese/English UI, and mobile layout.
- Finalize the Browser Kitty `#16624F` labeled-file + magnifier SVG icon and favicon.
- Refresh release documentation and Japanese/English screenshots.

## v0.1.3
- redesign the Viewer icon as a labeled file with a magnifying glass
- use Browser Kitty primary color `#16624F` for the app icon and favicon
- keep the header icon and `assets/favicon.svg` visually consistent

## v0.1.2
- update the app icon and favicon to make the file type easier to recognize
- add a viewer-style magnifier motif while keeping the Browser Kitty look

## 0.1.1

- Align long filename and close-button accessibility with the other Data Viewer apps.
- Translate remaining Japanese file-detail, stripe, metadata, and statistics labels and align footer privacy wording.
- Remove patch-version-specific wording from help text.

## 0.1.0

- Initial ORC Viewer implementation
- Added local schema, stripe, statistics, metadata, and paged row inspection
- Added tab-scoped status and error handling for multi-file use
- Added NONE / ZLIB / SNAPPY / LZ4 decoding with optional browser-native ZSTD
