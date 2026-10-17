// Refresh = reload the page. Hard refresh = fetch a fresh copy of the app,
// skipping any cached index.html (a new query string is a new URL).
export function refresh() { location.reload(); }
export function hardRefresh() {
  const url = new URL(location.href);
  url.searchParams.set('fresh', String(Date.now()));
  location.replace(url.toString());
}
