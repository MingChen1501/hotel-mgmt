// Guard for FR-SHL-1 (placeholder renders) + FR-SHL-3 (print
// namespace reserved, nothing implemented) at router level
// (Refs #291, LLD §11.1). Served-shell halves live in
// `script/shell-served-check.sh`.
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router';
import PlaceholderView from './views/Placeholder.vue';

describe('migration shell router', () => {
  it('holds exactly one route: the placeholder', () => {
    const router = createAppRouter();
    const routes = router.getRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0]?.name).toBe('placeholder');
  });

  it.each(['/app/', '/app/stay/today', '/app/book/quote-1', '/app/unknown-screen'])(
    'renders the placeholder for %s (deep link, reload, unknown path)',
    async (path) => {
      const router = createAppRouter();
      const resolved = router.resolve(path);
      expect(resolved.name).toBe('placeholder');
      expect(resolved.matched).toHaveLength(1);
      expect(resolved.matched[0]?.components?.default).toBe(PlaceholderView);
    },
  );

  it('reserves the print namespace without implementing a print route', () => {
    const router = createAppRouter();
    // No dedicated /print route may exist in this slice.
    const printRoutes = router
      .getRoutes()
      .filter((route) => route.path.includes('print'));
    expect(printRoutes).toHaveLength(0);
  });

  it.each(['/app/print/receipt-1', '/app/print/day-close'])(
    'routes reserved print path %s to the placeholder with no print document',
    (path) => {
      const router = createAppRouter();
      const resolved = router.resolve(path);
      expect(resolved.name).toBe('placeholder');
      expect(resolved.matched[0]?.components?.default).toBe(PlaceholderView);
    },
  );
});
