/** mcp-app-cards — self-contained MCP Apps UI templates + host bridge.
 *
 *  Serves two generic card layouts as MCP `ui://` resources with mimeType
 *  `text/html;profile=mcp-app`. Every generated document is fully offline:
 *  no remote scripts, styles, fonts or artwork.
 *
 *  postMessage contract between a generated template (iframe) and a host page:
 *    iframe -> host : {jsonrpc:"2.0", method:"ui/ready",        params:{protocol, template}}
 *    host  -> iframe: {jsonrpc:"2.0", method:"ui/render",       params:{...data}}
 *    iframe -> host : {jsonrpc:"2.0", method:"ui/size-changed", params:{height}}
 *
 *  Hosts use `createHost(iframeEl)`; frames get the matching runtime baked
 *  into the HTML as an inline <script> (see src/browser.js, BRIDGE_JS).
 */

import { BRIDGE_JS, esc } from './browser.js';

export { esc, start as startFrame } from './browser.js';

/** Exact mimeType MCP Apps-style HTML resources are registered under. */
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

/** True when an MCP resource is an HTML UI template a host should render in a frame. */
export function isAppResource(resource) {
  const mimeType = resource?.mimeType ?? resource?.mime_type;
  return typeof mimeType === 'string' && mimeType.startsWith('text/html;profile=mcp-app');
}

/** Default theme; every colour in the CSS references a `--var`, never a literal.
 *  `bg` is an opaque colour on purpose: a transparent canvas paints white in
 *  browsers regardless of the host's own background, which would put light
 *  text on a white page. Hosts that want blending must theme `bg` themselves. */
const DEFAULT_THEME = {
  bg: '#ffffff',
  card: '#f4f6f8',
  ink: '#16202b',
  dim: '#5c6f82',
  accent: '#2563eb',
  ring: '#d4dbe2',
  ok: '#16a34a',
  warn: '#d97706',
  error: '#dc2626'
};

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--ink)}
.wrap{padding:14px}
h2{font-size:14px;margin:0 0 12px;color:var(--dim);text-transform:uppercase;letter-spacing:.03em}
.empty{color:var(--dim);font-size:13px;padding:16px}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

const CARDS_CSS = `
.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;scroll-snap-type:x mandatory}
.row:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card{flex:0 0 auto;width:152px;background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:10px;scroll-snap-align:start}
.card.chosen{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}
.art{height:94px;border-radius:9px;background:var(--ring);display:flex;align-items:center;justify-content:center;font-size:30px;margin-bottom:8px;overflow:hidden}
.art img{width:100%;height:100%;object-fit:cover}
.t{font-size:13px;font-weight:600;line-height:1.25}
.s{font-size:11px;color:var(--dim);margin-top:3px;line-height:1.3}
.p{font-size:12px;color:var(--accent);margin-top:6px}
.tag{display:inline-block;font-size:10px;padding:2px 7px;border-radius:999px;background:var(--accent);color:var(--bg);margin-top:6px}
.tile{background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:13px;margin-bottom:10px}
.tile .body{font-size:14px;line-height:1.45;margin:6px 0 0}
.tile .meta{font-size:11px;color:var(--dim);margin-top:8px}
ul.list{list-style:none;padding:0;margin:0 0 10px}
ul.list li{padding:9px 0;border-bottom:1px solid var(--ring);font-size:13px}
ul.list li:last-child{border:0}
ul.list small{display:block;color:var(--dim);font-size:11px;margin-top:2px}
.note{background:var(--card);border-left:3px solid var(--accent);padding:10px 12px;border-radius:0 10px 10px 0;font-size:13px;line-height:1.5;margin-bottom:12px}
`;

const TIMELINE_CSS = `
ol{list-style:none;margin:0;padding:0 0 0 4px}
li{position:relative;padding:0 0 15px 22px;border-left:2px solid var(--ring);margin-left:6px}
li:last-child{border-left-color:transparent}
li::before{content:"";position:absolute;left:-7px;top:3px;width:12px;height:12px;border-radius:50%;background:var(--dim)}
li.ok::before,.done::before,.confirmed::before{background:var(--ok)}
li.added-by-agent::before,.pending::before{background:var(--accent)}
li.skipped::before{background:var(--warn)}
li.error::before{background:var(--error)}
.tool{font-size:13px;font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace}
.why{font-size:12px;color:var(--dim);margin-top:2px;line-height:1.4}
.err{font-size:12px;color:var(--error);margin-top:2px}
.sum{font-size:12px;margin-top:4px}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);float:right}
.verdict{background:var(--card);border:1px solid var(--ring);border-radius:12px;padding:12px;font-size:13px;line-height:1.45;margin-top:8px}
`;

/** Renderer for card data: {cards:[{type:'carousel'|'list'|'hero'|'note',...}]}.
 *  Shipped unminified so `.toString()` can inline it into a generated document;
 *  exported so it can also be unit-tested in Node without a DOM.
 *  Only `esc` (defined alongside it in the frame) is referenced.
 */
export function renderCards(d) {
  const cards = (d.cards || []).map((c) => {
    if (c.type === 'carousel') {
      return '<h2>' + esc(c.title) + '</h2>'
        + '<div class="row" role="region" aria-label="' + esc(c.title) + '" tabindex="0">'
        + (c.items || []).map((i) =>
            '<article class="card' + (i.chosen ? ' chosen' : '') + '">'
            + (i.art
                ? '<div class="art"><img src="' + esc(i.art) + '" alt="' + esc(i.alt || i.title || '') + '"></div>'
                : '<div class="art" aria-hidden="true"></div>')
            + '<h3 class="t">' + esc(i.title) + '</h3>'
            + '<div class="s">' + esc(i.sub) + '</div>'
            + (i.price ? '<div class="p">' + esc(String(i.price)) + '</div>' : '')
            + (i.chosen ? '<span class="tag">selected</span>' : '')
            + '</article>').join('')
        + '</div>';
    }
    if (c.type === 'list') {
      return '<h2>' + esc(c.title) + '</h2><ul class="list">'
        + (c.items || []).map((i) => '<li>' + esc(i.title) + '<small>' + esc(i.sub) + '</small></li>').join('')
        + '</ul>';
    }
    if (c.type === 'note') {
      return '<div class="note">' + esc(c.body || c.title) + '</div>';
    }
    return '<article class="tile"><h3 class="t">' + esc(c.title) + '</h3>'
      + '<p class="body">' + esc(c.body) + '</p>'
      + (c.meta ? '<div class="meta">' + esc(c.meta) + '</div>' : '')
      + '</article>';
  }).join('');
  return cards || '<p class="empty">' + esc(d.emptyMessage || 'Nothing to show yet.') + '</p>';
}

/** Renderer for timeline data: {title, trace:[{status,tool,why,error,summary}], spoken}. */
export function renderTimeline(d) {
  const rows = (d.trace || []).map((s) =>
    '<li class="' + esc(s.status) + '">'
    + '<span class="badge">' + esc(s.status) + (s.ms ? ' · ' + esc(String(s.ms)) + 'ms' : '') + '</span>'
    + '<div class="tool">' + esc(s.tool) + '</div>'
    + (s.why ? '<div class="why">' + esc(s.why) + '</div>' : '')
    + (s.error ? '<div class="err">' + esc(s.error) + '</div>' : '')
    + (s.summary ? '<div class="sum">' + esc(s.summary) + '</div>' : '')
    + '</li>').join('');
  const verdict = d.spoken
    ? '<div class="verdict"><b>' + esc(d.spokenLabel || 'What the agent said') + '</b><br>' + esc(d.spoken) + '</div>'
    : '';
  return (rows
    ? '<h2>' + esc(d.title || 'Plan') + '</h2><ol>' + rows + '</ol>' + verdict
    : '<p class="empty">' + esc(d.emptyMessage || 'No steps yet.') + '</p>');
}

const CARDS_RENDERER = renderCards.toString();
const TIMELINE_RENDERER = renderTimeline.toString();

const THEMABLE = Object.keys(DEFAULT_THEME);

function themeCss(theme) {
  const merged = { ...DEFAULT_THEME, ...(theme || {}) };
  return ':root{' + THEMABLE.map((key) => {
    // Only let through characters valid in CSS values; block braces/angles.
    const value = String(merged[key]).replace(/[^0-9a-zA-Z#%(),.\s"'-]/g, '');
    return '--' + key + ':' + value;
  }).join(';') + '}';
}

function doc({ template, css, renderer, options = {} }) {
  const placeholder = esc(options.placeholder ?? 'Waiting for data from the host…');
  const padding = Number(options.padding) || 28;
  // Lets UA chrome (the carousel scrollbar, text selection) match a dark theme.
  const scheme = /^(light|dark|light dark)$/.test(String(options.colorScheme || ''))
    ? `html{color-scheme:${options.colorScheme}}` : '';
  return `<!doctype html>
<html lang="en" data-template="${template}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${scheme}${BASE_CSS}${themeCss(options.theme)}${css}</style></head>
<body><div class="wrap" id="root"><p class="empty">${placeholder}</p></div>
<script>${options.prelude ?? ''}window.__mcpAppPadding=${padding};window.__mcpAppRender=${renderer};
${BRIDGE_JS}
</script></body></html>`;
}

/** Cards template: hero tiles, headline lists, callout notes and a
 *  keyboard-scrollable horizontal media carousel. Fully generic.
 *  @param {object} [options] { theme, placeholder, padding, colorScheme }
 */
export function cardsTemplate(options = {}) {
  return doc({ template: 'mcp-app-cards', css: CARDS_CSS, renderer: CARDS_RENDERER, options });
}

/** Timeline template: renders an ordered trace of steps with status dots and
 *  an optional spoken-summary verdict block.
 *  @param {object} [options] { theme, placeholder, padding, colorScheme }
 */
export function timelineTemplate(options = {}) {
  return doc({ template: 'mcp-app-timeline', css: TIMELINE_CSS, renderer: TIMELINE_RENDERER, options });
}

/** Build a complete, standalone HTML document for `kind` ('cards'|'timeline')
 *  with `data` preloaded, so it renders without a host posting ui/render.
 *  Data is embedded as JSON with `<` escaped, so no payload can break out of
 *  the script tag. */
export function renderToHtml(kind, data, options = {}) {
  const build = { cards: cardsTemplate, timeline: timelineTemplate }[kind];
  if (!build) throw new Error(`Unknown card kind: ${kind} (expected 'cards' or 'timeline')`);
  const json = JSON.stringify(data ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return build({ ...options, prelude: `window.__mcpAppData=${json};` });
}

/** Host side of the bridge. Tracks one iframe's ready/height protocol and
 *  buffers renders until the frame announces ui/ready.
 *  @param {HTMLIFrameElement} iframeEl
 *  @param {object} [opts] { minHeight = 160, targetOrigin = '*' }
 *  @returns {{render:(params:object)=>void, isReady:()=>boolean,
 *             on:(fn:(evt:object)=>void)=>()=>void, destroy:()=>void}}
 */
export function createHost(iframeEl, opts = {}) {
  const minHeight = opts.minHeight ?? 160;
  const targetOrigin = opts.targetOrigin ?? '*';
  const listeners = new Set();
  let ready = false;
  let pending = null;

  const emit = (evt) => { for (const fn of listeners) fn(evt); };

  const send = (params) =>
    iframeEl.contentWindow.postMessage({ jsonrpc: '2.0', method: 'ui/render', params }, targetOrigin);

  const onMessage = (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (event.source !== iframeEl.contentWindow) return;
    if (message.method === 'ui/ready') {
      ready = true;
      if (pending) { send(pending); pending = null; }
      emit({ type: 'ready', template: message.params?.template });
    }
    if (message.method === 'ui/size-changed') {
      const height = Math.max(minHeight, Number(message.params?.height) || 0);
      iframeEl.style.height = height + 'px';
      emit({ type: 'size', height });
    }
  };

  window.addEventListener('message', onMessage);

  return {
    /** Push render params; queued until the frame reports ui/ready. */
    render(params) {
      if (ready) send(params);
      else pending = params;
    },
    isReady: () => ready,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      window.removeEventListener('message', onMessage);
      listeners.clear();
    }
  };
}
