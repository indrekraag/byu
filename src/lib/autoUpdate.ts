// The crew-station iPad is never touched, so it must pick up new deploys on
// its own. GitHub Pages lets browsers cache index.html for 10 minutes and a
// home-screen app can hold it longer; ask for it uncached instead, and reload
// when it points at a different build. Data is safe: it lives in Supabase and
// the phone's outbox, not in the page.
const CHECK_MS = 5 * 60_000;

function currentBuild(): string | null {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;
}

export function startAutoUpdate() {
  const mine = currentBuild();
  if (!mine || import.meta.env.DEV) return;
  const check = async () => {
    if (document.hidden || !navigator.onLine) return;
    try {
      const html = await fetch(`${import.meta.env.BASE_URL}?build-check=${Date.now()}`, { cache: 'no-store' }).then(r => r.ok ? r.text() : '');
      const live = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1];
      if (live && live !== mine) location.reload();
    } catch { /* Offline or blocked: try again next time. */ }
  };
  setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
}
