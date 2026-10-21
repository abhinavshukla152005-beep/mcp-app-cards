/** In-frame runtime for mcp-app-cards templates.
 *
 *  postMessage contract (JSON-RPC-shaped envelopes, target origin '*'):
 *    frame -> host : {jsonrpc:"2.0", method:"ui/ready",        params:{protocol, template}}
 *    host  -> frame: {jsonrpc:"2.0", method:"ui/render",       params:{...card or timeline data}}
 *    frame -> host : {jsonrpc:"2.0", method:"ui/size-changed", params:{height}}
 *
 *  `start(options)` is the callable runtime for frames that import this module.
 *  `BRIDGE_JS` is the same runtime serialised to a string so generated HTML can
 *  embed it in an inline <script> with zero external assets (function sources
 *  survive `.toString()` because this package ships unminified).
 */

/** Escape a value for safe interpolation into HTML text or quoted attributes. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

/** Start the frame side of the bridge.
 *  @param {object} options
 *  @param {(data:any)=>string} [options.render]  Produces innerHTML from render params.
 *  @param {string} [options.template]            Identifier announced in ui/ready.
 *  @param {number} [options.padding]             Extra px added to reported height.
 */
export function start(options = {}) {
  const { render, template = 'mcp-app-card', padding = 28 } = options;
  const root = document.getElementById('root');

  const report = () => {
    const height = document.body.scrollHeight + padding;
    parent.postMessage({ jsonrpc: '2.0', method: 'ui/size-changed', params: { height } }, '*');
  };

  const draw = (params) => {
    if (root && typeof render === 'function') root.innerHTML = render(params) || '';
    report();
  };

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.method === 'ui/render') draw(message.params || {});
  });

  parent.postMessage(
    { jsonrpc: '2.0', method: 'ui/ready', params: { protocol: 'mcp-app/0.1', template } },
    '*'
  );

  window.addEventListener('load', () => {
    report();
    setTimeout(report, 80);
  });

  // Preloaded data (see renderToHtml) renders without waiting for a host.
  if (window.__mcpAppData) draw(window.__mcpAppData);
}

/** The runtime as a self-executing inline-script string, for template authors. */
export const BRIDGE_JS =
  'const esc = ' + esc.toString() + ';\n' +
  '(' + start.toString() + ')({\n' +
  '  render: window.__mcpAppRender,\n' +
  '  template: document.documentElement.dataset.template || "mcp-app-card",\n' +
  '  padding: window.__mcpAppPadding\n' +
  '});';
