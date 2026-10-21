# mcp-app-cards

Drop-in HTML templates and a host bridge for [MCP Apps](https://modelcontextprotocol.io)
`ui://` resources (`text/html;profile=mcp-app`). **Zero runtime dependencies, zero remote
assets, works offline.**

## The problem

The MCP Apps UI profile lets a server ship an HTML card that a host renders in an iframe —
but `@modelcontextprotocol/sdk` 1.32.1 ships **no helpers for any of it**. Every author
hand-rolls the same three-message handshake (`ui/ready` → `ui/render` → `ui/size-changed`),
re-invents the same card/timeline markup, and re-discovers the same XSS foot-gun of
interpolating tool data into a `<script>` tag. This package generalises that mechanism:
build a template once, register it as a resource, drive it with `createHost()`.

## Install

```sh
npm install mcp-app-cards
```

## Server side (~15 lines)

Register a template as a `ui://` resource with the exact MCP Apps mimeType:

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { cardsTemplate, timelineTemplate, RESOURCE_MIME_TYPE } from 'mcp-app-cards';

const server = new McpServer({ name: 'my-server', version: '1.0.0' });

const templates = {
  'ui://my-server/cards': cardsTemplate(),
  'ui://my-server/timeline': timelineTemplate()
};

for (const [uri, html] of Object.entries(templates)) {
  server.registerResource('ui', uri, { mimeType: RESOURCE_MIME_TYPE },
    async (request) => ({
      contents: [{ uri: request.params.uri, mimeType: RESOURCE_MIME_TYPE, text: html }]
    }));
}
```

Pass `{ theme }` to recolour everything (`cardsTemplate({ theme: { accent: '#00c8ff' } })` —
every colour in the CSS is a variable, defaults included), `{ placeholder, padding }` to
change the loading text and the height the frame reports, or `{ colorScheme: 'dark' }` so UA
chrome such as the carousel scrollbar matches a dark palette.

`theme.bg` must be an opaque colour. A `transparent` background leaves the browser's default
canvas (white) behind your text, which is how a dark palette ends up unreadable — the frame's
own canvas is painted by the document, not by the host's `iframe` CSS.

## API

| Export | Where | What |
| --- | --- | --- |
| `cardsTemplate(options?)` | `mcp-app-cards` | cards/carousel/list/note document string |
| `timelineTemplate(options?)` | `mcp-app-cards` | agent plan timeline document string |
| `renderToHtml(kind, data, options?)` | `mcp-app-cards` | template with data preloaded (no host needed) |
| `createHost(iframeEl, opts?)` | `mcp-app-cards` | host side: ready/render/size bridge |
| `renderCards(data)` / `renderTimeline(data)` | `mcp-app-cards` | the innerHTML renderers, callable in Node |
| `RESOURCE_MIME_TYPE` / `isAppResource(res)` | `mcp-app-cards` | the `ui://` mimeType and a detector |
| `esc(value)` / `start(options)` | `mcp-app-cards/browser` | escape helper and the in-frame runtime |

## Host side

`createHost(iframeEl)` speaks the protocol for you: it waits for `ui/ready`,
buffers `render()` calls until then, and auto-sizes the iframe from `ui/size-changed`.

```js
import { cardsTemplate, createHost } from 'mcp-app-cards';

const frame = document.querySelector('iframe');
frame.srcdoc = cardsTemplate();          // or frame.src = '/mcp-resource?uri=ui://my-server/cards'

const host = createHost(frame, { minHeight: 160 });
host.render({
  cards: [{ type: 'carousel', title: 'Picks',
            items: [{ title: 'A film', sub: '92 min', price: '$3.99', chosen: true }] }]
});
```

Data shapes:

- **cards** — `{ cards: [ {type:'carousel'|'list'|'hero'|'note', title, body, meta,
  items:[{title, sub, price, art, alt, chosen}]} ], emptyMessage }`
- **timeline** — `{ title, trace: [{ tool, status, why, error, summary, ms }], spoken,
  spokenLabel }` — status is also a CSS class (`ok`, `skipped`, `error`, …)

For static previews, tests, or hosts that never post messages, use
`renderToHtml(kind, data)` — it returns a standalone document with the data preloaded.

## The postMessage contract

All envelopes are JSON-RPC-shaped. Generated frames and `createHost` implement exactly this:

```js
// iframe → host, once the document is parsed:
{ jsonrpc: "2.0", method: "ui/ready",
  params: { protocol: "mcp-app/0.1", template: "mcp-app-cards" } }

// host → iframe, any number of times (re-renders replace the content):
{ jsonrpc: "2.0", method: "ui/render", params: { /* cards or timeline data */ } }

// iframe → host, after every render and on load:
{ jsonrpc: "2.0", method: "ui/size-changed", params: { height: 412 } }
```

The host sets `iframe.style.height = max(minHeight, params.height) + 'px'` — no scrollbars,
no fixed heights chosen by the server author.

## Accessibility

- The carousel row is `tabindex="0"` with a `role="region"` + `aria-label`, so it is
  **keyboard-scrollable** (focus it, then arrow/shift-scroll); visible focus outline included.
- Carousel artwork `src` is escaped and gets `alt` from `item.alt || item.title`; when an item
  has no `art`, an `aria-hidden` placeholder is drawn instead of a broken image.
- `@media (prefers-reduced-motion: reduce)` disables all animations/transitions and
  smooth scrolling in every template.
- Titles/headlines are real `<h2>`/`<h3>` landmarks; timeline status also renders as a text
  badge, so meaning never relies on the coloured dot alone.

## Security notes

- All interpolated values pass through a single `esc()` (HTML5 full escape of `& < > " '`).
- `renderToHtml()` embeds data as JSON with every `<` rewritten as the five-character
  sequence `\u003c` (plus U+2028/2029 handling), so no payload — e.g.
  `</script><img onerror=…>` — can terminate the inline script. Covered by tests.
- Theme values are character-sanitised before entering CSS, and `colorScheme` is matched
  against a fixed allow-list (`light`, `dark`, `light dark`) — anything else is dropped.
- `createHost()` ignores any message whose `event.source` is not the frame it owns, so a
  third-party iframe on the host page cannot fake a `ui/ready` or resize your frame.
- Render the frames with `sandbox="allow-scripts"` and **without** `allow-same-origin`: the
  bridge only needs `postMessage`, and an opaque origin keeps a template out of the host's
  cookies, storage and DOM.
- Generated documents contain **no** `http(s)://` URLs at all (asserted in the test suite).

## Develop

```sh
npm test        # node test/render.test.mjs — no framework
npm run example # static server → http://localhost:5173/ (cards + timeline side by side)
```

## Used by

[Aura — Household Agent](https://github.com/abhinavshukla152005/aura-household-agent), an
Alexa+ MCP server for voice-first household routines.

## License

Apache-2.0
