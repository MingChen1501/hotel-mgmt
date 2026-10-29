// Guard for FR-SHL-1 (desk screen renders at /) + FR-SHL-3 (print
// route implemented) + the admin console route (Refs #298) at
// router level
// (Refs #291, #293, #294, #295, #296, #297, #298, LLD section 11.1). Served-shell halves
// live in `script/shell-served-check.sh`.
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router';
import AdminView from './views/AdminView.vue';
import BookView from './views/BookView.vue';
import DeskView from './views/DeskView.vue';
import FolioView from './views/FolioView.vue';
import OnboardingView from './views/OnboardingView.vue';
import PlaceholderView from './views/Placeholder.vue';
import PrintView from './views/PrintView.vue';
import RoomsView from './views/RoomsView.vue';
import StayView from './views/StayView.vue';

describe('migration shell router', () => {
  it('holds the desk, book, stay, onboarding, rooms, folio, print, and admin routes plus the placeholder catch-all', () => {
    const router = createAppRouter();
    const routes = router.getRoutes();
    expect(routes).toHaveLength(9);
    expect(routes.map((route) => route.name).sort()).toEqual([
      'admin',
      'book',
      'desk',
      'folio',
      'onboarding',
      'placeholder',
      'print',
      'rooms',
      'stay',
    ]);
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

  // LLD section 13.3 edge A (Refs #424): the /rooms route renders
  // the map; the wizard route lands beside it in section 13.4
  // (Refs #425).
  it('renders the rooms map for /rooms', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/rooms');
    expect(resolved.name).toBe('rooms');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(RoomsView);
  });

  // LLD section 13.4 edge E (Refs #425): the /onboarding route
  // renders the wizard shell; the view itself redirects to the
  // shell on a seeded database.
  it('renders the onboarding wizard for /onboarding', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/onboarding');
    expect(resolved.name).toBe('onboarding');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(OnboardingView);
  });

  it('renders the folio screen for /folio', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/folio');
    expect(resolved.name).toBe('folio');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(FolioView);
  });

  it('renders the print screen for /print', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/print');
    expect(resolved.name).toBe('print');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(PrintView);
  });

  it('renders the admin console for /admin', async () => {
    const router = createAppRouter();
    const resolved = router.resolve('/admin');
    expect(resolved.name).toBe('admin');
    expect(resolved.matched).toHaveLength(1);
    expect(resolved.matched[0]?.components?.default).toBe(AdminView);
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

  it('routes unknown print sub-paths to the placeholder (deep links stay shell-served)', () => {
    const router = createAppRouter();
    // No dedicated nested print routes exist in this slice: the
    // print screen is the single /print route above.
    const printRoutes = router
      .getRoutes()
      .filter((route) => route.path !== '/print' && route.path.includes('print'));
    expect(printRoutes).toHaveLength(0);
  });

  it.each(['/app/print/receipt-1', '/app/print/day-close'])(
    'routes print sub-path %s to the placeholder with no print document',
    (path) => {
      const router = createAppRouter();
      const resolved = router.resolve(path);
      expect(resolved.name).toBe('placeholder');
      expect(resolved.matched[0]?.components?.default).toBe(PlaceholderView);
    },
  );
});
