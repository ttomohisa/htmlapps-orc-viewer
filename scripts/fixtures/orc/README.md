# Apache ORC regression fixtures

These repository-only synthetic test files are unmodified Apache ORC fixtures from commit `4dbfe28864d73a20c331ec59cc93249aed37dfef`:

- [Binary examples](https://github.com/apache/orc/tree/4dbfe28864d73a20c331ec59cc93249aed37dfef/examples): `TestOrcFile.testTimestamp.orc` (12 primitive-root timestamps), `TestOrcFile.test1.orc` (2 nested STRUCT records), `TestOrcFile.emptyFile.orc` (empty STRUCT schema), `decimal.orc` (6,000 decimal STRUCT records).
- [Independent expected data](https://github.com/apache/orc/tree/4dbfe28864d73a20c331ec59cc93249aed37dfef/examples/expected): the included timestamp and STRUCT `.jsn` files. Decimal checks use gold rows 1, 2, 100 and 101: -1000.50000, -999.60000, -901.10400, -900.10500. Gold records 1–100 are strictly increasing, so ascending/descending checks assert their independent source order and actual CSV boundary rows.
- `manifest.json` records binary SHA-256 hashes, verified by the tests.
- The original Apache `LICENSE` and `NOTICE` are included. Fixtures are not embedded in either distributed HTML variant.

The timestamp regression checks that all decoded values reach the `root` field and its Table, Record, Inspector, sorting and CSV consumers. It deliberately preserves the current decoder's millisecond presentation and two pre-existing writer-time-zone differences: record 10 renders `1996-08-01T23:00:00.723Z` instead of the gold wall-clock `1996-08-02 00:00:00.723100809`; record 12 renders `2008-10-01T23:00:00.000Z` instead of `2008-10-02 00:00:00.0`. Passing this test does not claim exact timestamp fidelity.

Non-STRUCT collection/null/logical-value tests isolate the real row adapter with decoded-value doubles. Genuine nested collection preservation is additionally checked through the Apache STRUCT fixture. Browser picker, download and clipboard behavior require separate browser QA.
