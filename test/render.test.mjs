/** Zero-framework tests: node --test is not required, just `npm test`. */
import assert from 'node:assert/strict';
import {
  cardsTemplate,
  timelineTemplate,
  createHost,
  renderToHtml,
  renderCards,
  renderTimeline,
  isAppResource,
  RESOURCE_MIME_TYPE
} from '../src/index.js';
import { esc, start, BRIDGE_JS } from '../src/browser.js';

let passed = 0;
const failures = [];
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('ok - ' + name);
  } catch (error) {
    failures.push(name);
    console.log('NOT OK - ' + name + '\n  ' + String(error.message).split('\n')[0]);
  }
};

test('both templates build into complete HTML documents', () => {
  const cards = cardsTemplate();
  const timeline = timelineTemplate();
  for (const html of [cards, timeline]) {
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="en"/);
    assert.match(html, /<\/html>$/);
  }
  assert.match(cards, /data-template="mcp-app-cards"/);
  assert.match(timeline, /data-template="mcp-app-timeline"/);
});

test('RESOURCE_MIME_TYPE is the exact mcp-app profile string', () => {
  assert.equal(RESOURCE_MIME_TYPE, 'text/html;profile=mcp-app');
});

test('esc() neutralises HTML metacharacters', () => {
  assert.equal(esc('<script>"a" & \'b\'</script>'),
    '&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;');
  assert.equal(esc(null), '');
});

test('</script> injection in data cannot escape the embedded script tag', () => {
  const evil = {
    cards: [{
      type: 'carousel',
      title: '</script><img onerror=alert(1)>',
      items: [{ title: '</script><script>alert(1)</script>', sub: '" onmouseover="x' }]
    }]
  };
  const docs = [
    renderToHtml('cards', evil),
    renderToHtml('timeline', { trace: [{ tool: evil.cards[0].title }] })
  ];
  for (const html of docs) {
    assert.ok(!html.includes('</script><img'), 'raw </script><img breakout found');
    assert.ok(!html.includes('<img onerror'), 'raw <img onerror tag found');
    assert.ok(!html.includes('</script><script>'), 'nested script breakout found');
    // The payload is still present, but only in < -escaped JSON form.
    assert.ok(html.includes('\\u003c/script>'), 'payload was not escaped to \\u003c form');
    // Script tags stay balanced (the injected </script> never became real markup).
    assert.equal(html.split('<script>').length, html.split('</script>').length);
  }
});

test('generated HTML contains no remote http(s) URLs', () => {
  const docs = [cardsTemplate(), timelineTemplate(), renderToHtml('cards', { cards: [] })];
  for (const html of docs) {
    assert.ok(!/https?:\/\//.test(html), 'remote URL found in generated HTML');
    assert.ok(!html.includes('<link'), 'external link tag found');
    assert.ok(!/<script[^>]+src=/.test(html), 'external script tag found');
  }
});

test('render entry point and full bridge protocol are embedded', () => {
  const html = cardsTemplate();
  assert.ok(html.includes('window.__mcpAppRender'), 'renderer not embedded');
  assert.ok(html.includes('ui/ready'), 'missing ui/ready handshake');
  assert.ok(html.includes('ui/render'), 'missing ui/render listener');
  assert.ok(html.includes('ui/size-changed'), 'missing ui/size-changed report');
  assert.equal(typeof createHost, 'function');
  assert.equal(typeof start, 'function');
  assert.ok(BRIDGE_JS.includes('ui/ready'));
});

test('theme object customises CSS variables and cannot inject markup', () => {
  const custom = cardsTemplate({ theme: { accent: '#ff0000', ink: 'rgb(1, 2, 3)' } });
  assert.ok(custom.includes('--accent:#ff0000'));
  assert.ok(custom.includes('--ink:rgb(1, 2, 3)'));
  const hostile = cardsTemplate({ theme: { accent: '}body{display:none}</style>' } });
  assert.ok(!hostile.includes('}body{'));
  assert.ok(!hostile.includes('display:none'));
});

test('colorScheme is opt-in and allow-listed', () => {
  assert.ok(cardsTemplate({ colorScheme: 'dark' }).includes('html{color-scheme:dark}'));
  assert.ok(!cardsTemplate().includes('color-scheme:'));
  const hostile = cardsTemplate({ colorScheme: 'dark}body{display:none}' });
  assert.ok(!hostile.includes('color-scheme:'));
  assert.ok(!hostile.includes('display:none'));
});

test('the default theme paints an opaque canvas', () => {
  // A transparent --bg leaves the browser's white canvas behind light text.
  assert.ok(cardsTemplate().includes('--bg:#ffffff'));
  assert.ok(timelineTemplate().includes('--bg:#ffffff'));
  const themed = cardsTemplate({ theme: { bg: '#0e1620' } });
  assert.ok(themed.includes('--bg:#0e1620'));
});

test('renderToHtml rejects unknown kinds', () => {
  assert.throws(() => renderToHtml('nope', {}), /Unknown card kind/);
});

test('isAppResource recognises an MCP Apps template', () => {
  assert.equal(isAppResource({ mimeType: RESOURCE_MIME_TYPE }), true);
  assert.equal(isAppResource({ mime_type: RESOURCE_MIME_TYPE }), true);
  assert.equal(isAppResource({ mimeType: 'text/html' }), false);
  assert.equal(isAppResource(), false);
});

test('host options reach the generated document', () => {
  const html = cardsTemplate({ placeholder: 'Loading & <b>stuff</b>', padding: 40 });
  assert.ok(html.includes('window.__mcpAppPadding=40'));
  assert.ok(html.includes('Loading &amp; &lt;b&gt;stuff&lt;/b&gt;'));
  assert.ok(!html.includes('<b>stuff</b>'));
});

test('renderCards escapes every field of a tool payload', () => {
  const evil = '</script><img src=x onerror=alert(1)>';
  const out = renderCards({
    cards: [
      { type: 'carousel', title: evil, items: [{ title: evil, sub: evil, art: evil, price: 5, chosen: true }] },
      { type: 'list', title: evil, items: [{ title: evil, sub: 'Amp & "quotes" <b>bold</b>' }] },
      { type: 'note', body: evil },
      { type: 'hero', title: evil, body: evil, meta: evil },
    ],
  });
  assert.ok(!out.includes('</script>'), 'raw script terminator survived');
  assert.ok(!out.includes('<img src=x'), 'raw injected img tag survived');
  assert.ok(!out.includes('<b>bold</b>'), 'raw markup survived');
  assert.ok(out.includes('&lt;/script&gt;'));
  assert.ok(out.includes('Amp &amp; &quot;quotes&quot; &lt;b&gt;'));
  assert.ok(out.includes('role="region"'), 'carousel should be a labelled scroll region');
  assert.ok(out.includes('<span class="tag">selected</span>'));
});

test('renderCards and renderTimeline degrade on partial data', () => {
  assert.ok(renderCards({}).includes('Nothing to show yet.'));
  assert.ok(renderCards({ emptyMessage: '</script>' }).includes('&lt;/script&gt;'));
  assert.ok(renderCards({ cards: [{ title: 'unknown type falls back' }] }).includes('class="tile"'));
  assert.ok(renderCards({ cards: [{ type: 'note', title: 'body missing' }] }).includes('body missing'));
  assert.ok(renderTimeline({}).includes('No steps yet.'));
  assert.ok(renderTimeline({ trace: [] }).includes('No steps yet.'));
});

test('renderTimeline exposes status, timing and the re-plan marker', () => {
  const out = renderTimeline({
    title: 'run',
    trace: [
      { tool: 'weather_now', status: 'ok', ms: 41, why: 'raining?' },
      { tool: 'media_search', status: 'added-by-agent', summary: 'switched to audio' },
      { tool: 'news_briefing', status: 'skipped' },
      { tool: 'place_order', status: 'error', error: '</script>boom' },
    ],
    spoken: 'here you go',
  });
  assert.ok(out.includes('class="added-by-agent"'));
  assert.ok(out.includes('class="skipped"'));
  assert.ok(out.includes('41ms'));
  assert.ok(out.includes('switched to audio'));
  assert.ok(out.includes('class="verdict"'));
  assert.ok(!out.includes('</script>boom'));
});

/** createHost touches `window`, so drive it with minimal fakes. */
function fakeHostRuntime() {
  const bus = new EventTarget();
  const sent = [];
  globalThis.window = {
    addEventListener: (type, fn) => bus.addEventListener(type, fn),
    removeEventListener: (type, fn) => bus.removeEventListener(type, fn),
  };
  const frame = { contentWindow: { postMessage: (message) => sent.push(message) }, style: {} };
  const emit = (data, source = frame.contentWindow) =>
    bus.dispatchEvent(Object.assign(new Event('message'), { data, source }));
  return { sent, frame, emit };
}

test('createHost queues renders until the frame announces ui/ready', () => {
  const { sent, frame, emit } = fakeHostRuntime();
  const events = [];
  const host = createHost(frame, { minHeight: 120 });
  host.on((evt) => events.push(evt));

  host.render({ cards: [{ type: 'note', body: 'early' }] });
  assert.deepEqual(sent, [], 'render must wait for ui/ready');
  assert.equal(host.isReady(), false);

  emit({ jsonrpc: '2.0', method: 'ui/ready', params: { template: 'mcp-app-cards' } });
  assert.equal(host.isReady(), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, 'ui/render');
  assert.equal(sent[0].params.cards[0].body, 'early');
  assert.deepEqual(events, [{ type: 'ready', template: 'mcp-app-cards' }]);

  host.render({ cards: [] });
  assert.equal(sent.length, 2);

  emit({ jsonrpc: '2.0', method: 'ui/size-changed', params: { height: 400 } });
  assert.equal(frame.style.height, '400px');
  emit({ jsonrpc: '2.0', method: 'ui/size-changed', params: { height: 10 } });
  assert.equal(frame.style.height, '120px', 'minHeight should floor the reported height');
  emit({ jsonrpc: '2.0', method: 'ui/size-changed', params: { height: 'nonsense' } });
  assert.equal(frame.style.height, '120px');

  host.destroy();
  emit({ jsonrpc: '2.0', method: 'ui/size-changed', params: { height: 700 } });
  assert.equal(frame.style.height, '120px', 'destroy() must detach the listener');
  delete globalThis.window;
});

test('createHost ignores traffic from other windows', () => {
  const { sent, frame, emit } = fakeHostRuntime();
  const host = createHost(frame);
  const off = host.on(() => { throw new Error('must not emit for a foreign frame'); });
  emit({ jsonrpc: '2.0', method: 'ui/ready', params: {} }, { someOtherWindow: true });
  emit('not an object');
  emit({ method: 'unrelated' });
  assert.equal(host.isReady(), false);
  assert.deepEqual(sent, []);
  off();
  host.destroy();
  delete globalThis.window;
});

console.log('\n' + passed + ' tests passed' + (failures.length ? ', ' + failures.length + ' failed' : ''));
if (failures.length) process.exitCode = 1;
