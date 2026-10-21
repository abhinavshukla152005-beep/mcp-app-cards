# Contributing

Thanks for taking a look. This package is deliberately small, so a change that fits in one
afternoon is very welcome.

## Ground rules

- **Zero dependencies stays zero.** No runtime, dev or test dependencies — the test runner is
  a plain script and the example server uses `node:http`.
- **Generated documents must stay offline.** Nothing in a template may reference an
  `http(s)://` URL, a web font or a CDN script. The test suite asserts this; keep it asserting it.
- **Everything a tool returned is untrusted.** Any new field that reaches `innerHTML` goes
  through `esc()`, and any new option that reaches CSS or an HTML attribute is sanitised or
  allow-listed. Add a test with a `</script><img onerror=…>` payload for each new surface.
- Apache-2.0, and please add yourself to the copyright notice only if you're adding a file.

## Workflow

```sh
git checkout -b my-change
npm test                 # must stay green
npm run example          # eyeball both templates at http://localhost:5173/
git commit               # imperative subject, explain the why in the body
```

Open a pull request against `main`. CI is just `npm test` on Node 18 and 24.

## Where to start

These are real gaps, not busywork:

1. **A third template kind.** `renderCards`/`renderTimeline` are the only shapes today. A
   `tableTemplate` (rows with a numeric column right-aligned) or a `chartTemplate` (inline SVG
   bars, no library) would slot straight into `doc({ template, css, renderer })`.
2. **`createHost` origin pinning.** `targetOrigin` defaults to `'*'`. A `hostOrigin` option that
   validates `event.origin` before trusting `ui/ready` would be a genuine security improvement —
   but it must not break the `file://` example, so cover both.
3. **A `ui/tool-cancel` message.** Frames can render but not respond today. Adding a fourth
   message (`host` and `frame` in both directions) plus a `host.on('cancel')` callback would
   make the bridge usable for confirm-before-purchase UIs. Document it in the contract block.
4. **Reduced-motion carousel auto-scroll.** The row honours `prefers-reduced-motion` for CSS
   animation; a JS-driven `scrollBy` helper should check the same media query.
5. **TypeScript types.** Hand-written `.d.ts` (no build step) for the two data shapes and
   `createHost`'s return value.

Good first issues are labelled `good-first-issue`; claim one in the thread before starting.

## Questions

Open an issue. A short reproduction with the exact `cardsTemplate({...})` call you made is more
useful than a description.
