// The chosen look (Charcoal, 2026-10-17). Kept as a data attribute so the
// styles stay scoped and another look can be trialled again later.
export function applyLook() {
  document.documentElement.dataset.look = 'charcoal';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111214');
}
