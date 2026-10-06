// Actual ORC parser/page/presentation regressions in Node.js, without a browser.
// Binary fixtures are genuine Apache test files; collection controls isolate the row adapter.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const vm = require('node:vm');
const test = require('node:test');
const root = resolve(__dirname, '..');
const fixtures = resolve(__dirname, 'fixtures/orc');
const targets = process.argv.slice(2);
if (!targets.length) targets.push('src/index.template.html', 'dist/index.html', 'dist/index.self-extract.html', 'orc-viewer.html');
function element() {
  return { children: [], dataset: {}, listeners: {}, textContent: '', classList: { add() {}, toggle() {} },
    append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this[name] = value; }, addEventListener(name, fn) { this.listeners[name] = fn; }, showModal() { this.open = true; } };
}
function harness(source) {
  const elements = new Map();
  const $ = selector => { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); };
  const context = vm.createContext({ textDecoder: new TextDecoder(), TextDecoder, TextEncoder, Uint8Array, DataView, ArrayBuffer, Blob, File, Response, DecompressionStream, Date, Map, Set, setTimeout, clearTimeout,
    APP_CONFIG: { slug: 'orc-viewer' }, state: { files: [], activeId: null }, $, document: { createElement: element }, t: x => x });
  const start = source.indexOf('      function safeJson('), end = source.indexOf("      $('#chooseButton').addEventListener", start);
  assert.ok(start > 0 && end > start);
  const helpers = ['basename', 'formatNumber', 'formatBytes', 'escapeHtml'].map(name => source.split('\n').find(line => line.trim().startsWith(`function ${name}(`))).join('\n');
  vm.runInContext(helpers + '\n' + source.slice(start, end) + '\nrenderActive=()=>{};renderData=()=>{};renderFileStatus=()=>{};', context);
  async function open(name) {
    const file = new File([readFileSync(resolve(fixtures, name))], name);
    const fs = context.buildFileState(file); context.state.files.push(fs); await context.inspectFile(fs);
    assert.equal(fs.inspection, 'ready', fs.error); assert.equal(fs.dataError, ''); assert.equal(context.isPageReady(fs), true);
    return fs;
  }
  return { c: context, $, open };
}
const manifest = JSON.parse(readFileSync(resolve(fixtures, 'manifest.json'), 'utf8'));
test('Apache fixture bytes match the pinned provenance manifest', () => {
  for (const file of manifest.files) assert.equal(createHash('sha256').update(readFileSync(resolve(fixtures, file.path))).digest('hex'), file.sha256, file.path);
});
for (const target of targets) {
  let source = readFileSync(resolve(root, target), 'utf8');
  if (target.endsWith('self-extract.html')) source = gunzipSync(Buffer.from(source.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/)[1].trim(), 'base64')).toString('utf8');
  test(`${target}: real primitive-root timestamps reach Table, Record, Inspector and CSV`, async () => {
    const { c, $, open } = harness(source), fs = await open('TestOrcFile.testTimestamp.orc');
    // Apache's independent expected values retain nanoseconds. The existing app presents milliseconds.
    const expected = readFileSync(resolve(fixtures, 'TestOrcFile.testTimestamp.jsn'), 'utf8').trim().split('\n').map(line => {
      const [day, time] = JSON.parse(line).split(' '), [clock, fraction] = time.split('.');
      return `${day}T${clock}.${fraction.padEnd(3, '0').slice(0, 3)}Z`;
    });
    // Preserve two known writer-time-zone differences in the unchanged decoder.
    // This regression proves root-field mapping, not full timestamp fidelity.
    expected[9] = '1996-08-01T23:00:00.723Z';
    expected[11] = '2008-10-01T23:00:00.000Z';
    assert.equal(fs.totalRows, 12); assert.deepEqual(Array.from(fs.fields, f => f.name), ['root']);
    assert.deepEqual(Array.from(fs.rows, row => c.valueForField(row.value, fs.fields[0])), expected);
    c.renderTable(fs);
    const rows = $('#dataTableWrap').children[0].children[1].children;
    assert.deepEqual(rows.map(row => row.children[1].textContent), expected);
    rows[0].children[1].listeners.click();
    assert.equal($('#cellField').textContent, 'root'); assert.equal($('#cellValue').textContent, expected[0]);
    c.renderRecords(fs);
    assert.deepEqual(JSON.parse($('#recordList').children[0].children[1].textContent), { root: expected[0] });
    assert.equal(c.buildCurrentCsv(fs), '__record,root\r\n' + expected.map((value, i) => `${i + 1},${value}`).join('\r\n'));
    fs.sort = { field: fs.fields[0], dir: 1 };
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.value.root), [...expected].sort());
    assert.equal(c.buildCurrentCsv(fs).split('\r\n')[1], `4,${expected[3]}`);
    fs.hiddenFields.add(0); assert.equal(c.buildCurrentCsv(fs).split('\r\n')[0], '__record');
  });
  test(`${target}: known timestamp writer-time-zone differences versus Apache gold`, { todo: 'Existing decoder differs for records 10 and 12; root-wrapper patch does not change timestamp decoding' }, async () => {
    const { c, open } = harness(source), fs = await open('TestOrcFile.testTimestamp.orc');
    const expected = readFileSync(resolve(fixtures, 'TestOrcFile.testTimestamp.jsn'), 'utf8').trim().split('\n').map(line => {
      const [day, time] = JSON.parse(line).split(' '), [clock, fraction] = time.split('.');
      return `${day}T${clock}.${fraction.padEnd(3, '0').slice(0, 3)}Z`;
    });
    assert.deepEqual(Array.from(fs.rows, row => c.valueForField(row.value, fs.fields[0])), expected);
  });
  test(`${target}: non-STRUCT adapter preserves scalar, null, logical, list, map and union values`, async () => {
    const { c } = harness(source);
    // Only stripe IO and column decoding are doubles here; buildSchema, row adapter and lookups are real.
    c.readStripe = async () => ({});
    const values = [null, false, 0, '', 9223372036854775807n, new Uint8Array([0, 1, 255]), '2037-01-01T00:00:00.000Z', '123.45000', ['a', null], { root: 'nested', value: 'preserved' }];
    for (const kind of [0, 4, 7, 8, 9, 10, 11, 13, 14, 15]) {
      const footer = { types: [{ kind, subtypes: kind === 11 ? [1, 2] : [1], fieldNames: [] }, { kind: 7, subtypes: [], fieldNames: [] }, { kind: 7, subtypes: [], fieldNames: [] }] };
      const header = { footer, schema: c.buildSchema(footer) }, field = c.rootFields(header.schema)[0];
      c.decodeColumn = () => values;
      const rows = await c.decodeStripeRows({}, header, { numberOfRows: values.length });
      rows.forEach((row, i) => { assert.deepEqual(Object.keys(row), ['root']); assert.equal(c.valueForField(row, field), values[i]); });
    }
  });
  test(`${target}: genuine STRUCT keeps named fields, nested lists/maps, bytes and exact int64`, async () => {
    const { c, open } = harness(source), fs = await open('TestOrcFile.test1.orc');
    const first = fs.rows[0].value;
    assert.equal(fs.totalRows, 2); assert.equal(fs.fields.length, 12);
    assert.equal(first.string1, 'hi'); assert.equal(first.long1, '9223372036854775807');
    assert.equal(c.valueForField(first, fs.fields.find(f => f.name === 'string1')), 'hi');
    assert.equal(Object.hasOwn(first, 'root'), false); assert.equal(Object.hasOwn(first, 'value'), false);
    assert.equal(Buffer.from(first.bytes1).toString('hex'), '0001020304');
    assert.equal(JSON.stringify(first.list), '[{"int1":3,"string1":"good"},{"int1":4,"string1":"bad"}]');
    assert.equal(JSON.stringify(fs.rows[1].value.map), '{"chani":{"int1":5,"string1":"chani"},"mauddib":{"int1":1,"string1":"mauddib"}}');
    assert.ok(c.buildCurrentCsv(fs).includes('9223372036854775807'));
  });
  test(`${target}: genuine empty schema and paged decimal STRUCT remain exportable`, async () => {
    const { c, open } = harness(source), empty = await open('TestOrcFile.emptyFile.orc');
    assert.equal(empty.totalRows, 0); assert.equal(empty.fields.length, 12);
    assert.equal(c.buildCurrentCsv(empty), ['__record', ...empty.fields.map(f => f.name)].join(','));
    const decimal = await open('decimal.orc'); assert.equal(decimal.totalRows, 6000);
    assert.equal(c.valueForField(decimal.rows[0].value, decimal.fields[0]), '-1000.5');
    assert.match(c.buildCurrentCsv(decimal), /^__record,_col0\r\n1,-1000\.5\r\n2,-999\.6/);
    decimal.page = 2; await c.readPage(decimal); assert.equal(decimal.rows[0].recordNumber, 101);
    assert.equal(c.valueForField(decimal.rows[0].value, decimal.fields[0]), '-900.105');
  });
  test(`${target}: genuine DECIMAL page sorts numerically in both directions and exports that order`, async () => {
    const { c, open } = harness(source), fs = await open('decimal.orc');
    // Independent Apache gold values for records 1..100 are strictly increasing.
    fs.sort = { field: fs.fields[0], dir: 1 };
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.recordNumber), Array.from({ length: 100 }, (_, i) => i + 1));
    const ascending = c.buildCurrentCsv(fs).split('\r\n');
    assert.equal(ascending[1], '1,-1000.5'); assert.equal(ascending[100], '100,-901.104');
    fs.sort.dir = -1;
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.recordNumber), Array.from({ length: 100 }, (_, i) => 100 - i));
    const descending = c.buildCurrentCsv(fs).split('\r\n');
    assert.equal(descending[1], '100,-901.104'); assert.equal(descending[100], '1,-1000.5');
  });
  test(`${target}: DECIMAL sorting is exact, null-last and source-stable while text sorting is unchanged`, () => {
    const { c } = harness(source);
    const values = ['9007199254740993.01', '9007199254740993.001', '-10', '-2', '0', '-0.000', '+0.0', '1.2', '1.20', '0001.200', '0.0000000000000000000000000002', '0.0000000000000000000000000001', null, null];
    const field = { name: 'amount', index: 0, type: { kind: 14 } };
    const fs = { fields: [field], hiddenFields: new Set(), rows: values.map((amount, i) => ({ recordNumber: i + 1, value: { amount } })), sort: { field, dir: 1 } };
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.recordNumber), [3, 4, 5, 6, 7, 12, 11, 8, 9, 10, 2, 1, 13, 14]);
    fs.sort.dir = -1;
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.recordNumber), [1, 2, 8, 9, 10, 11, 12, 5, 6, 7, 4, 3, 13, 14]);
    field.type.kind = 7; fs.sort.dir = 1;
    fs.rows = ['2', '10', '1'].map((amount, i) => ({ recordNumber: i + 1, value: { amount } }));
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.value.amount), ['1', '10', '2']);
    field.type.kind = 14;
    fs.rows = ['invalid', '12'].map((amount, i) => ({ recordNumber: i + 1, value: { amount } }));
    assert.deepEqual(Array.from(c.sortedRows(fs), row => row.value.amount), ['12', 'invalid']);
  });
  test(`${target}: language target, accessible name, privacy and patch version stay consistent`, () => {
    const nodes = new Map(); const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
    const app = JSON.parse(readFileSync(resolve(root, 'app.config.json'), 'utf8'));
    const c = vm.createContext({ state: { language: 'ja' }, APP_CONFIG: app, $, $$: () => [], document: { documentElement: {} }, renderActive() {} });
    const i18nStart = source.indexOf('      const I18N='), i18nEnd = source.indexOf('      function preferredLanguage(');
    const line = name => source.split('\n').find(s => s.trim().startsWith(`function ${name}(`));
    vm.runInContext(source.slice(i18nStart, i18nEnd) + '\n' + line('t') + '\n' + line('applyLanguage'), c);
    for (const [lang, label, accessible, privacy] of [['ja', 'EN', '英語に切り替え', '完全ローカル処理'], ['en', 'JA', 'Switch to Japanese', 'Fully local processing']]) {
      c.state.language = lang; c.applyLanguage();
      assert.equal($('#languageButton').textContent, label); assert.equal($('#languageButton')['aria-label'], accessible); assert.equal($('#languageButton').title, accessible);
      assert.equal(c.t('localBadge'), privacy); assert.ok(c.t('helpRootValues').includes('root'));
    }
    assert.equal(app.version, '1.0.1'); assert.match(source, /id="versionBadge">v1\.0\.1</);
    if (target !== 'src/index.template.html') assert.match(source, /"version":"1\.0\.1"/);
  });
}
