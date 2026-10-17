// The crew-station iPad is never touched, so it must pick up new deploys on
// its own. GitHub Pages lets browsers cache index.html for 10 minutes and a
// home-screen app can hold it longer; ask for it uncached instead, and reload
// when it points at a different build. Data is safe: it lives in Supabase and
// the outbox, not in the page.
//
// A reload never interrupts someone: it waits until nobody has touched the
// screen for a minute, no text box is focused and no edit or picker is open,
// and it saves the page and scroll position so the reload lands in the same place.
const CHECK_MS = 2 * 60_000;
const IDLE_MS = 60_000;
export const RESTORE_KEY = 'byu-dash:restore:v1';

function currentBuild(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;
}

let lastTouch = Date.now();
function busy() {
  const el = document.activeElement as HTMLElement | null;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  return typing || Date.now() - lastTouch < IDLE_MS || !!document.querySelector('.entry-edit, .portion, .yard-card');
}

/** Remember where the reader is, for the next load (any reload, ours or manual). */
export function saveRestorePoint() {
  try {
    const pages = [...document.querySelectorAll<HTMLElement>('.page')].map(p => p.scrollTop);
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ log: location.hash === '#log', pages, at: Date.now() }));
  } catch { /* fine */ }
}

export function startAutoUpdate() {
  ['pointerdown', 'touchstart', 'keydown', 'input'].forEach(t => window.addEventListener(t, () => { lastTouch = Date.now(); }, { passive: true, capture: true }));
  window.addEventListener('pagehide', saveRestorePoint);
  const mine = currentBuild();
  if (!mine || import.meta.env.DEV) return;
  let pending = false;
  const tryReload = () => { if (pending && !busy()) { saveRestorePoint(); location.reload(); } };
  const check = async () => {
    if (document.hidden || !navigator.onLine) return;
    try {
      const html = await fetch(`${import.meta.env.BASE_URL}?build-check=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
      const live = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1];
      if (live && live !== mine) { pending = true; tryReload(); }
    } catch { /* Offline or blocked: try again next time. */ }
  };
  setInterval(check, CHECK_MS);
  setInterval(tryReload, 10_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
}
