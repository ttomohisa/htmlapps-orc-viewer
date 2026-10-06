// Runs the app's actual page/UI/export functions with small DOM and decoder doubles.
// No browser, ORC parser, clipboard, downloads, networking, or real user files run here.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { gunzipSync } = require('node:zlib');
const root = resolve(__dirname, '..');
const targets = process.argv.slice(2);
if (!targets.length) targets.push('src/index.template.html', 'dist/index.html', 'dist/index.self-extract.html', 'orc-viewer.html');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function element(tag = 'div') {
  const classes = new Set();
  return {
    tag, children: [], textContent: '', value: '', disabled: false, hidden: false,
    style: {}, dataset: {}, listeners: {},
    classList: {
      toggle(name, value) { if (value ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); },
    },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; this.textContent = ''; },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { const index = selector.match(/^\[data-sort-field="(\d+)"\]$/)?.[1]; return this.children.find(child => child.dataset?.sortField === index && index !== undefined) || this.children.map(child => child.querySelector(selector)).find(Boolean) || null; },
    showModal() { this.open = true; }, close() { this.open = false; }, click() { return this.listeners.click?.({ target: this }); },
  };
}
function functionLine(source, name) {
  const line = source.split('\n').find(line => new RegExp(`^\\s*(?:async )?function ${name}\\(`).test(line));
  assert.ok(line, `actual helper ${name}`);
  return line;
}
function appHarness(source) {
  const elements = new Map(), decodes = [], inspections = [], copies = [], downloads = [], statuses = [];
  const $ = selector => {
    if (!elements.has(selector)) {
      const node = element();
      node.disabled = new RegExp(`id="${selector.slice(1)}"[^>]*\\bdisabled\\b`).test(source);
      node.focus = () => { context.document.activeElement = node; };
      elements.set(selector, node);
    }
    return elements.get(selector);
  };
  const context = {
    state: { activeId: null, files: [] }, $, $$: selector => selector === '#columnsList input' ? $('#columnsList').children.map(label => label.children[0]) : [],
    Uint8Array, Date, Map, Set, Blob, Math, Intl, APP_CONFIG: { slug: 'orc-viewer' },
    setTimeout() {}, formatNumber: String,
    t: (key, args = {}) => key + ' ' + JSON.stringify(args), toast() {},
    setStatus: (...args) => statuses.push(args),
    copyText: async text => { copies.push(text); return true; },
    document: { body: element('body'), createElement: tag => {
      const node = element(tag);
      node.focus = () => { context.document.activeElement = node; };
      if (tag === 'a') node.click = () => downloads.push({ name: node.download, href: node.href });
      return node;
    } },
    URL: { createObjectURL: blob => { downloads.push({ blob }); return 'test:csv'; }, revokeObjectURL() {} },
    decodeStripeRows: (file, header, stripe) => { const work = deferred(); decodes.push({ file, header, stripe, ...work }); return work.promise; },
    parseOrcFile: (file, progress) => { const work = deferred(); inspections.push({ file, progress, ...work }); return work.promise; },
  };
  vm.createContext(context);
  const start = source.indexOf('      function schemaAsJson(');
  const end = source.indexOf('      function setMobilePage(');
  assert.ok(start >= 0 && end > start, 'application page functions exist');
  const helpers = ['cellText', 'safeJson', 'bytesToHex', 'basename', 'escapeHtml', 'prettyValue', 'typeOfValue'].map(name => functionLine(source, name)).join('\n');
  vm.runInContext(helpers + '\n' + source.slice(start, end), context);
  // Unrelated metadata UI and native clipboard are controlled sinks; page/table/record UI remains real.
  context.renderOverview = () => {};
  context.copyText = async text => { copies.push(text); return true; };
  for (const prefix of ["$('#pageSizeSelect').addEventListener", "$('#tableModeButton').addEventListener", "$('#columnsButton').addEventListener"]) {
    vm.runInContext(source.split('\n').find(line => line.trim().startsWith(prefix)), context);
  }
  const outputLine = source.split('\n').find(line => line.trim().startsWith("$('#outputFilename').addEventListener"));
  vm.runInContext(outputLine.slice(0, outputLine.indexOf("$('#languageButton')")), context);
  function makeFile(name = 'sample.orc', total = 101) {
    const fs = context.buildFileState({ name, size: 100, lastModified: 0 });
    const fields = [{ name: 'label', index: 0 }, { name: 'note', index: 1 }];
    const stripes = Array.from({ length: Math.ceil(total / 50) }, (_, index) => ({ index, rowStart: index * 50, rowEnd: Math.min(total, (index + 1) * 50), numberOfRows: Math.min(50, total - index * 50) }));
    Object.assign(fs, { pageSize: 50, totalRows: total, header: { stripes, totalRows: total, schema: { fields } }, fields, inspection: 'ready' });
    context.state.files.push(fs);
    return fs;
  }
  const file = makeFile(); context.state.activeId = file.id;
  const emit = (id, name, value) => {
    if (value !== undefined) $(id).value = String(value);
    assert.equal(typeof $(id).listeners[name], 'function', `${id} has an actual ${name} handler`);
    return $(id).listeners[name]({ target: $(id) });
  };
  const jump = page => emit('#pageJump', 'change', page);
  const rows = (prefix, count = 50) => Array.from({ length: count }, (_, i) => ({ label: `${prefix}${i + 1}`, note: 'fictitious' }));
  const settle = async (work, promise, prefix = 'Alpha') => { work.resolve(rows(prefix, work.stripe.numberOfRows)); await promise; };
  const tableRows = () => $('#dataTableWrap').children[0]?.children[1]?.children || [];
  const exportBlocked = async () => {
    assert.equal($('#copyCsvButton').disabled, true);
    assert.equal($('#downloadCsvButton').disabled, true);
    const copied = copies.length, saved = downloads.length;
    await context.copyCsv(); context.downloadCsv();
    assert.equal(copies.length, copied); assert.equal(downloads.length, saved);
  };
  return { context, file, $, decodes, inspections, copies, downloads, statuses, makeFile, emit, jump, rows, settle, tableRows, exportBlocked };
}

for (const target of targets) {
  let source = readFileSync(resolve(root, target), 'utf8');
  if (target.endsWith('.self-extract.html')) {
    const payload = source.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(payload, 'self-extract payload exists');
    source = gunzipSync(Buffer.from(payload[1].trim(), 'base64')).toString('utf8');
  }
  for (const script of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  const check = (name, run) => test(`${target}: ${name}`, () => run(appHarness(source)));
  check('late page 1 success cannot overwrite page 2 rows, range, table, or CSV', async h => {
    const a = h.jump(1), b = h.jump(2);
    await h.settle(h.decodes[1], b, 'Beta');
    await h.settle(h.decodes[0], a);
    assert.equal(h.file.page, 2); assert.equal(h.file.rows[0].recordNumber, 51);
    assert.match(h.$('#pageRangeLabel').textContent, /"start":"51"/);
    assert.equal(h.tableRows()[0].children[0].textContent, '51');
    assert.match(h.context.buildCurrentCsv(h.file), /51,Beta1/);
    await h.context.copyCsv(); assert.match(h.copies[0], /51,Beta1/);
  });
  check('older finally cannot clear a newer loading spinner', async h => {
    const a = h.jump(1), b = h.jump(2);
    await h.settle(h.decodes[0], a);
    assert.equal(h.file.loading, true); assert.equal(h.$('#dataLoading').classList.contains('show'), true);
    assert.equal(h.file.rows.length, 0); await h.exportBlocked();
    await h.settle(h.decodes[1], b, 'Beta'); assert.equal(h.file.loading, false);
  });
  check('older error cannot erase a newer success', async h => {
    const a = h.jump(1), b = h.jump(2);
    await h.settle(h.decodes[1], b, 'Beta');
    h.decodes[0].reject(Error('Old read failed')); await a;
    assert.equal(h.file.dataError, ''); assert.equal(h.file.rows[0].recordNumber, 51);
    assert.equal(h.$('#copyCsvButton').disabled, false);
  });
  check('Copy and Save cannot export previous-page rows while a new page loads', async h => {
    const previous = h.jump(3); await h.settle(h.decodes[0], previous, 'Gamma');
    assert.equal(h.$('#copyCsvButton').disabled, false);
    const next = h.jump(1); await h.exportBlocked(); assert.equal(h.file.rows.length, 0);
    await h.settle(h.decodes[1], next); assert.equal(h.$('#copyCsvButton').disabled, false);
  });
  check('older success cannot replace a current failure; retry can recover', async h => {
    const a = h.jump(1), b = h.jump(2);
    h.decodes[1].reject(Error('Current read failed')); await b;
    await h.settle(h.decodes[0], a);
    assert.equal(h.file.dataError, 'Current read failed'); assert.equal(h.file.rows.length, 0); await h.exportBlocked();
    const retry = h.jump(2); await h.settle(h.decodes[2], retry, 'Retry');
    assert.equal(h.file.dataError, ''); assert.equal(h.file.rows[0].recordNumber, 51);
    await h.context.copyCsv(); assert.match(h.copies[0], /51,Retry1/);
  });
  check('page-size changes own the result even when an old page completes last', async h => {
    const a = h.jump(3), b = h.emit('#pageSizeSelect', 'change', 100);
    h.decodes[1].resolve(h.rows('Alpha')); await new Promise(setImmediate);
    h.decodes[2].resolve(h.rows('Beta')); await b;
    await h.settle(h.decodes[0], a, 'Gamma');
    assert.equal(h.file.page, 1); assert.equal(h.file.pageSize, 100);
    assert.equal(h.file.rows.length, 100); assert.equal(h.file.rows[99].recordNumber, 100);
  });
  check('sequential next/previous and page jump retain the two-stripe cache contract', async h => {
    const first = h.jump(1); await h.settle(h.decodes[0], first);
    const next = h.emit('#nextButton', 'click'); await h.settle(h.decodes[1], next, 'Beta');
    await h.emit('#prevButton', 'click'); assert.equal(h.decodes.length, 2); assert.equal(h.file.rows[0].recordNumber, 1);
    const last = h.jump(3); await h.settle(h.decodes[2], last, 'Gamma');
    assert.equal(h.file.stripeCache.size, 2); assert.equal(h.file.stripeCache.has(0), false);
    await h.jump(2); assert.equal(h.decodes.length, 3); assert.equal(h.file.rows[0].recordNumber, 51);
  });
  check('sort, visible columns, Record view, CSV values, and edited filename remain usable', async h => {
    const p = h.jump(3); h.decodes[0].resolve([{ label: 'A,"B"\nC', note: 'private column' }]); await p;
    h.emit('#columnsButton', 'click');
    const boxes = h.$('#columnsList').children.map(label => label.children[0]);
    boxes[1].checked = false;
    h.context.$$ = selector => selector === '#columnsList input' ? boxes : [];
    h.emit('#applyColumnsButton', 'click');
    assert.equal(h.file.hiddenFields.has(1), true);
    h.context.sortByField(h.file, h.file.fields[0]);
    h.emit('#recordModeButton', 'click'); assert.equal(h.$('#recordList').children.length, 1);
    h.emit('#outputFilename', 'input', 'custom-name'); h.$('#outputFilename').value = 'custom-name';
    await h.context.copyCsv(); h.context.downloadCsv();
    assert.equal(h.copies[0], '__record,label\r\n101,"A,""B""\nC"');
    assert.equal(h.downloads[1].name, 'custom-name.csv');
    assert.equal(Buffer.from(await h.downloads[0].blob.arrayBuffer()).toString('utf8'), '\uFEFF' + h.copies[0]);
    h.emit('#tableModeButton', 'click'); assert.equal(h.tableRows()[0].children.length, 2);
  });
  check('ascending, descending, and unsorted current-page CSV order is preserved', async h => {
    const p = h.jump(1); h.decodes[0].resolve(h.rows('Alpha').reverse()); await p;
    h.context.sortByField(h.file, h.file.fields[0]);
    const asc = h.context.sortedRows(h.file).map(r => r.value.label);
    assert.equal(asc[0], 'Alpha1');
    h.context.sortByField(h.file, h.file.fields[0]); assert.equal(h.context.sortedRows(h.file)[0].value.label, 'Alpha9');
    h.context.sortByField(h.file, h.file.fields[0]); assert.equal(h.context.sortedRows(h.file)[0].value.label, 'Alpha50');
  });
  check('a successful empty page exports headers and does not reread on tab activation', async h => {
    const empty = h.makeFile('empty.orc', 0); h.context.state.activeId = empty.id;
    await h.context.readPage(empty);
    const readPage = h.context.readPage; let rereads = 0;
    h.context.readPage = fs => { rereads++; return readPage(fs); };
    h.context.activateFile(empty.id); assert.equal(rereads, 0);
    assert.equal(h.decodes.length, 0); assert.equal(empty.loading, false);
    assert.equal(h.$('#copyCsvButton').disabled, false);
    await h.context.copyCsv(); assert.equal(h.copies[0], '__record,label,note');
  });
  check('switching files preserves each result without cross-tab rendering', async h => {
    const a = h.jump(1), other = h.makeFile('other.orc');
    h.context.activateFile(other.id);
    const otherWork = h.decodes[1]; otherWork.resolve(h.rows('Other')); await new Promise(setImmediate);
    await h.settle(h.decodes[0], a);
    assert.equal(h.file.rows[0].value.label, 'Alpha1'); assert.equal(other.rows[0].value.label, 'Other1');
    assert.equal(h.tableRows()[0].children[1].textContent, 'Other1');
    h.context.activateFile(h.file.id); assert.equal(h.tableRows()[0].children[1].textContent, 'Alpha1');
    assert.equal(h.decodes.length, 2);
  });
  check('closing a loading file prevents late rows, errors, cache writes, and UI changes', async h => {
    const pending = h.jump(1), other = h.makeFile('other.orc', 0);
    h.context.state.activeId = other.id; await h.context.readPage(other);
    h.context.closeFile(h.file.id); await h.settle(h.decodes[0], pending);
    assert.equal(h.file.rows.length, 0); assert.equal(h.file.stripeCache.size, 0);
    assert.equal(h.context.getActiveFile(), other); assert.equal(h.$('#copyCsvButton').disabled, false);
    h.context.closeFile(other.id); await h.exportBlocked();
  });
  check('initial inspection and inspection errors cannot export stale data', async h => {
    const inspect = h.context.inspectFile(h.file); await h.exportBlocked();
    h.inspections[0].reject(Error('Invalid file')); await inspect;
    assert.equal(h.file.inspection, 'error'); await h.exportBlocked();
  });
  check('reinspection invalidates older page results and cache writes', async h => {
    const old = h.jump(1), inspect = h.context.inspectFile(h.file);
    await h.settle(h.decodes[0], old);
    assert.equal(h.file.rows.length, 0); assert.equal(h.file.stripeCache.size, 0); await h.exportBlocked();
    h.inspections[0].reject(Error('New inspection failed')); await inspect;
    assert.equal(h.file.inspection, 'error'); await h.exportBlocked();
  });
  check('two requests for the same page still give the latest request ownership', async h => {
    const a = h.jump(1), b = h.jump(1);
    await h.settle(h.decodes[1], b, 'Current');
    h.decodes[0].reject(Error('Obsolete same-page error')); await a;
    assert.equal(h.file.dataError, ''); assert.equal(h.file.rows[0].value.label, 'Current1');
    assert.equal(h.$('#copyCsvButton').disabled, false);
  });
  check('inspection enables export only after its initial page has completed', async h => {
    const header = h.file.header, inspect = h.context.inspectFile(h.file);
    h.inspections[0].resolve(header); await new Promise(setImmediate);
    await h.exportBlocked(); assert.equal(h.file.loading, true);
    await h.settle(h.decodes[0], inspect);
    assert.equal(h.file.inspection, 'ready'); assert.equal(h.file.loading, false);
    assert.equal(h.$('#copyCsvButton').disabled, false);
    await h.context.copyCsv(); assert.match(h.copies[0], /1,Alpha1/);
  });
  check('older inspection failure cannot erase a newer successful empty result', async h => {
    const a = h.context.inspectFile(h.file), b = h.context.inspectFile(h.file);
    h.inspections[1].resolve({ totalRows: 0, schema: { fields: [] }, stripes: [] }); await b;
    h.inspections[0].progress(20); h.inspections[0].reject(Error('Old inspection failed')); await a;
    assert.equal(h.file.inspection, 'ready'); assert.equal(h.file.inspectionProgress, 100);
    assert.equal(h.file.error, ''); assert.equal(h.$('#copyCsvButton').disabled, false);
    await h.context.copyCsv(); assert.equal(h.copies[0], '__record');
  });
  check('closing during inspection discards late progress, parse success, and page work', async h => {
    const inspect = h.context.inspectFile(h.file); h.context.closeFile(h.file.id);
    h.inspections[0].progress(50);
    h.inspections[0].resolve({ totalRows: 0, schema: { fields: [] }, stripes: [] }); await inspect;
    assert.equal(h.file.header, null); assert.equal(h.file.inspectionProgress, null);
    assert.equal(h.decodes.length, 0); await h.exportBlocked();
  });
  check('column-name search is literal, case-insensitive, localized and keeps all indexed drafts mounted', h => {
    h.file.fields = ['amount', '名前', '[a.*]', '<b>name</b>', 'amount', ' spaced '].map((name, i) => ({ name, index: i * 2 }));
    h.file.hiddenFields.add(8);
    h.emit('#columnsButton', 'click');
    const labels = h.$('#columnsList').children, boxes = labels.map(label => label.children[0]);
    const visible = () => labels.filter(label => !label.hidden).map(label => label.children[1].textContent);
    boxes[0].checked = false;
    h.emit('#columnSearch', 'input', 'AMO');
    assert.deepEqual(visible(), ['amount', 'amount']);
    assert.match(h.$('#columnSearchCount').textContent, /"shown":"2","total":"6"/);
    assert.equal(h.$('#columnsList').children, labels);
    assert.deepEqual(boxes.map(box => box.dataset.index), ['0', '2', '4', '6', '8', '10']);
    h.emit('#columnSearch', 'input', '名前'); assert.deepEqual(visible(), ['名前']);
    h.emit('#columnSearch', 'input', '.*'); assert.deepEqual(visible(), ['[a.*]']);
    h.emit('#columnSearch', 'input', '<B>'); assert.deepEqual(visible(), ['<b>name</b>']);
    assert.equal(labels[3].children[1].children.length, 0);
    h.emit('#columnSearch', 'input', ' '); assert.deepEqual(visible(), [' spaced ']);
    h.emit('#clearColumnSearchButton', 'click');
    assert.equal(h.$('#columnSearch').value, ''); assert.equal(visible().length, 6);
    assert.equal(h.context.document.activeElement, h.$('#columnSearch'));
    assert.equal(boxes[0].checked, false); assert.equal(boxes[4].checked, false);
    assert.deepEqual([...h.file.hiddenFields], [8]);
    assert.match(source, /\.column-option\[hidden\]\s*\{\s*display:\s*none/);
    const i18n = vm.runInNewContext(source.slice(source.indexOf('      const I18N='), source.indexOf('      function preferredLanguage(')) + '\nI18N');
    for (const lang of ['ja', 'en']) for (const key of ['findColumns', 'clearColumnSearch', 'columnSearchCount', 'noMatchingColumns', 'columnSearchNote', 'sortColumn', 'cancel']) {
      assert.equal(typeof i18n[lang][key], 'string', `${lang} ${key}`);
    }
    assert.match(source, /<label[^>]*for="columnSearch"/);
    assert.match(source, /id="columnSearch"[^>]*type="search"/);
    assert.match(source, /id="columnSearchCount"[^>]*role="status"/);
  });
  check('no-match and empty-schema counts do not alter choices; Show all and Done include hidden labels', h => {
    h.file.hiddenFields.add(1); h.emit('#columnsButton', 'click');
    const boxes = h.$('#columnsList').children.map(label => label.children[0]);
    h.emit('#columnSearch', 'input', 'no such column');
    assert.equal(h.$('#noMatchingColumns').hidden, false);
    assert.ok(h.$('#columnsList').children.every(label => label.hidden));
    assert.match(h.$('#columnSearchCount').textContent, /"shown":"0","total":"2"/);
    assert.deepEqual([...h.file.hiddenFields], [1]);
    h.emit('#showAllColumnsButton', 'click'); assert.ok(boxes.every(box => box.checked));
    boxes[0].checked = false;
    h.emit('#applyColumnsButton', 'click');
    assert.deepEqual([...h.file.hiddenFields], [0]);
    assert.equal(h.$('#columnsDialog').open, false);
    h.emit('#columnsButton', 'click');
    assert.equal(h.$('#columnSearch').value, '');
    assert.equal(h.context.document.activeElement, h.$('#columnSearch'));
    assert.equal(h.$('#columnsList').children[0].children[0].checked, false);
    h.file.fields = []; h.emit('#columnsButton', 'click');
    assert.equal(h.$('#columnsList').children.length, 0);
    assert.match(h.$('#columnSearchCount').textContent, /"shown":"0","total":"0"/);
  });
  check('Cancel, close and native dialog cancellation discard all pending visibility changes on reopen', h => {
    h.file.hiddenFields.add(1);
    for (const dismissal of ['#cancelColumnsButton', '#closeColumnsButton', 'native-cancel']) {
      h.emit('#columnsButton', 'click');
      h.$('#columnsList').children[0].children[0].checked = false;
      h.$('#columnsList').children[1].children[0].checked = true;
      h.emit('#columnSearch', 'input', 'note');
      if (dismissal === 'native-cancel') {
        // Model the dialog's native Esc default; do not claim a browser keyboard test.
        assert.equal(h.$('#columnsDialog').listeners.cancel, undefined);
        h.$('#columnsDialog').close();
      } else h.emit(dismissal, 'click');
      assert.deepEqual([...h.file.hiddenFields], [1]);
      h.emit('#columnsButton', 'click');
      assert.equal(h.$('#columnSearch').value, '');
      assert.deepEqual(h.$('#columnsList').children.map(label => label.children[0].checked), [true, false]);
    }
  });
  check('searching 200 columns never changes values, CSV, sort, page ownership or cache and never decodes', async h => {
    const p = h.jump(1);
    const payload = { label: 'comma,"quote"\nline', note: { precise: 9007199254740993n, nil: null, binary: new Uint8Array([0, 255]) } };
    h.decodes[0].resolve([payload]); await p;
    h.file.fields = [...h.file.fields, ...Array.from({ length: 198 }, (_, index) => ({ name: `field_${index}`, index: index + 2 }))];
    h.context.sortByField(h.file, h.file.fields[0]);
    const csv = h.context.buildCurrentCsv(h.file), refs = { ...h.file }, cache = [...h.file.stripeCache];
    h.emit('#columnsButton', 'click');
    const labels = h.$('#columnsList').children;
    assert.equal(labels.length, 200);
    for (const query of ['FIELD_19', 'no-match', '', 'comma', '9007199254740993']) {
      h.emit('#columnSearch', 'input', query);
      assert.equal(h.$('#columnsList').children, labels);
      assert.equal(h.context.buildCurrentCsv(h.file), csv);
      for (const key of Object.keys(refs)) assert.equal(h.file[key], refs[key], key);
      assert.deepEqual([...h.file.stripeCache], cache);
      assert.equal(h.decodes.length, 1);
    }
    assert.ok(labels.every(label => label.hidden), 'values are not searched');
    assert.equal(h.file.rows[0].value, payload);
    assert.equal(payload.note.precise, 9007199254740993n);
    assert.deepEqual([...payload.note.binary], [0, 255]);
  });
  check('native sort buttons expose direction, preserve focus and cycle current-page CSV exactly once', async h => {
    h.file.totalRows = 103; h.file.header.totalRows = 103;
    Object.assign(h.file.header.stripes[2], { rowEnd: 103, numberOfRows: 3 });
    const p = h.jump(3); h.decodes[0].resolve([{ label: 'Beta', note: null }, { label: 'Alpha', note: 'z' }, { label: 'Gamma', note: 'a' }]); await p;
    const headers = () => h.$('#dataTableWrap').children[0].children[0].children[0].children;
    const button = () => headers()[1].children[0];
    assert.equal(button()?.tag, 'button', 'sortable TH must contain a native button');
    assert.equal(button().type, 'button'); assert.equal(button().dataset.sortField, '0');
    assert.equal(headers()[1].listeners.click, undefined, 'no bubbling duplicate sort activation');
    assert.equal(button().listeners.keydown, undefined, 'native Enter/Space activation needs no duplicate handler');
    assert.equal(headers()[1]['aria-sort'], 'none');
    const originalRows = h.file.rows, originalResult = h.file.pageResult, cache = [...h.file.stripeCache];
    for (const [direction, first, indicator] of [['ascending', 'Alpha', '↑'], ['descending', 'Gamma', '↓'], ['none', 'Beta', '↕']]) {
      button().focus(); const oldButton = button(); button().click();
      assert.notEqual(button(), oldButton); assert.equal(h.context.document.activeElement, button());
      assert.equal(headers()[1]['aria-sort'], direction);
      assert.equal(button().children[1].textContent, indicator); assert.equal(button().children[1]['aria-hidden'], 'true');
      assert.equal(h.context.sortedRows(h.file)[0].value.label, first);
      assert.equal(h.context.buildCurrentCsv(h.file).split('\r\n')[1].split(',')[1], first);
      assert.equal(h.file.page, 3); assert.equal(h.file.rows, originalRows); assert.equal(h.file.pageResult, originalResult);
      assert.deepEqual([...h.file.stripeCache], cache); assert.equal(h.decodes.length, 1);
    }
    const other = headers()[2].children[0]; other.focus(); other.click();
    assert.equal(headers()[1]['aria-sort'], 'none'); assert.equal(headers()[2]['aria-sort'], 'ascending');
    assert.equal(h.context.sortedRows(h.file)[0].value.note, 'a');
    assert.equal(h.context.sortedRows(h.file).at(-1).value.note, null, 'existing null-last order is unchanged');
    h.emit('#columnsButton', 'click'); h.$('#columnsList').children[1].children[0].checked = false;
    h.emit('#applyColumnsButton', 'click'); assert.equal(h.file.sort.field.index, 1);
    assert.equal(headers().length, 2); assert.equal(headers()[1]['aria-sort'], 'none');
  });

  check('sort controls preserve literal replacement-token field names in English and Japanese accessible labels', async h => {
    const name = '$& $` $\' <名前>';
    h.file.fields = [{ name, index: 7 }];
    const p = h.jump(1); h.decodes[0].resolve([{ [name]: 'synthetic' }]); await p;
    vm.runInContext(source.slice(source.indexOf('      const I18N='), source.indexOf('      function preferredLanguage(')) + '\n' + functionLine(source, 't'), h.context);
    for (const language of ['en', 'ja']) {
      h.context.state.language = language; h.context.renderTable(h.file);
      const button = h.$('#dataTableWrap').children[0].children[0].children[0].children[1].children[0];
      assert.equal(button.children[0].textContent, name);
      assert.ok(button['aria-label'].includes(name), `${language}: the accessible name must contain the literal visible field name`);
    }
  });

  check('keyboard clicks inside Columns cannot be mistaken for a backdrop dismissal', h => {
    h.emit('#columnsButton', 'click');
    const dialog = h.$('#columnsDialog');
    dialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 600, bottom: 700 });
    vm.runInContext(functionLine(source, 'closeDialogOnBackdrop'), h.context);
    h.context.closeDialogOnBackdrop(dialog);
    const box = h.$('#columnsList').children[0].children[0]; box.checked = false;
    h.emit('#columnSearch', 'input', 'no-match');
    h.emit('#clearColumnSearchButton', 'click');
    for (const target of [h.$('#clearColumnSearchButton'), h.$('#showAllColumnsButton'), box]) {
      dialog.listeners.click({ target, detail: 0, clientX: 0, clientY: 0 });
      assert.equal(dialog.open, true, 'a descendant keyboard click must leave the dialog open');
    }
    assert.equal(h.context.document.activeElement, h.$('#columnSearch'));
    assert.equal(box.checked, false);
    dialog.listeners.click({ target: dialog, detail: 1, clientX: 200, clientY: 200 });
    assert.equal(dialog.open, true, 'dialog padding is not the backdrop');
    dialog.listeners.click({ target: dialog, detail: 1, clientX: 10, clientY: 10 });
    assert.equal(dialog.open, false, 'a genuine outside backdrop click still closes');
    assert.equal(h.file.hiddenFields.size, 0, 'backdrop dismissal does not apply drafts');
  });

}
