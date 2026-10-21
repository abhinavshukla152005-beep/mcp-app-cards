/** Zero-framework tests: node --test is not required, just `npm test`. */
import assert from 'node:assert/strict';
import {
  cardsTemplate,
  timelineTemplate,
  createHost,
  renderToHtml,
  RESOURCE_MIME_TYPE
} from '../src/index.js';
import { esc, start, BRIDGE_JS } from '../src/browser.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('ok - ' + name);
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

test('renderToHtml rejects unknown kinds', () => {
  assert.throws(() => renderToHtml('nope', {}), /Unknown card kind/);
});

console.log('\n' + passed + ' tests passed');
