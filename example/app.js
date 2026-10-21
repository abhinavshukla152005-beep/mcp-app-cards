/** Host side of the demo: build the two templates in-page (imported straight
 *  from src/index.js), drop them into iframes with srcdoc, and drive them with
 *  createHost() — the same bridge a real MCP host would use. */
import { cardsTemplate, timelineTemplate, createHost } from '../src/index.js';

const CARDS_DATA = {
  cards: [
    {
      type: 'carousel',
      title: 'Weekend picks',
      items: [
        { title: 'Space adventure', sub: 'Awards run, 92 min', price: '$3.99', chosen: true,
          alt: 'Poster placeholder for Space adventure' },
        { title: 'Ocean documentary', sub: 'Family favourite', price: '$2.49' },
        { title: 'Animated classics pack', sub: '5 films', price: '$9.99' },
        { title: 'Late-night comedy', sub: 'Stand-up special' },
        { title: 'Nature live feed', sub: 'Free with account' }
      ]
    },
    {
      type: 'list',
      title: 'Up next',
      items: [
        { title: 'Episode 4 · The Signal', sub: 'Resumes at 12 min left' },
        { title: 'Reading list', sub: '3 articles saved offline' }
      ]
    },
    { type: 'note', body: 'Say “continue where we left off” on a voice device to resume.' },
    { type: 'hero', title: 'Good evening', body: 'Wind-down mode starts at 21:00 — kids’ profiles lock automatically.',
      meta: 'Household rules · updated today' }
  ]
};

const TIMELINE_DATA = {
  title: 'Movie-night plan',
  trace: [
    { tool: 'get_household', status: 'ok', why: 'Load profiles, budget and curfew', ms: 24 },
    { tool: 'search_catalog', status: 'ok', why: 'Find age-appropriate awards picks', ms: 138,
      summary: '11 candidates' },
    { tool: 'check_budget', status: 'skipped', why: 'Nothing to rent under $4 after free picks' },
    { tool: 'start_routine', status: 'error', error: 'Profile was locked by curfew', why: 'Resume session' },
    { tool: 'start_routine', status: 'added-by-agent', why: 'Re-planned: unlock with parent PIN first', ms: 19,
      summary: 'Routine started' }
  ],
  spoken: 'Picked an awards-winning space adventure for movie night — the $0 option, since free titles covered it.'
};

const DARK_THEME = {
  bg: 'transparent', card: '#16222f', ink: '#eaf2fa', dim: '#8fa6bd',
  accent: '#00c8ff', ring: '#1f3550'
};

function mount(iframeId, templateFn, data) {
  const el = document.getElementById(iframeId);
  el.srcdoc = templateFn({ theme: DARK_THEME });
  const host = createHost(el, { minHeight: 180 });
  host.on((evt) => {
    if (evt.type === 'ready') host.render(data);
  });
  return host;
}

mount('cards', cardsTemplate, CARDS_DATA);
mount('timeline', timelineTemplate, TIMELINE_DATA);
