// Guard for FR-SHL-1 (desk screen renders at /) + FR-SHL-3 (print
// namespace reserved, nothing implemented) at router level
// (Refs #291, #293, #294, #295, LLD §11.1). Served-shell halves live
// in `script/shell-served-check.sh`.
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import PlaceholderView from './views/Placeholder.vue';
import StayView from './views/StayView.vue';

describe('migration shell router', () => {
  it('holds the desk, book, and stay routes plus the placeholder catch-all', () => {
    const router = createAppRouter();
    const routes = router.getRoutes();
    expect(routes).toHaveLength(4);
    expect(routes.map((route) => route.name).sort()).toEqual(['book', 'desk', 'placeholder', 'stay']);
  });

  it('renders the desk screen for /', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/');
    expect(resolved.name).toBe('desk');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(DeskView);
  });

  it('renders the book screen for /book', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/book');
    expect(resolved.name).toBe('book');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(BookView);
  });

  it('renders the stay screen for /stay', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/stay');
    expect(resolved.name).toBe('stay');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(StayView);
  });

  it.each(['/app/stay/today', '/app/book/quote-1', '/app/unknown-screen'])(
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
