// Booking register source-level design guard (Refs #648; product spec
// `docs/product/booking-management-view.md` sections 5 and 6; traceability
// `docs/testing/booking-management-view-test-traceability.md` `BM8`/`BM15`).
//
// The register has no owner board of its own, so it borrows the shell tab
// treatment, the card-and-row list, the neutral state chip, and the Book
// screen's action buttons. `BookingsView.test.ts` owns the behaviour half
// (and the row state classes); jsdom cannot resolve the stylesheet, so the
// rendered values the reviewer reads in the browser — the 44px targets and
// the inactive-row ink — are pinned here at the source, the way every other
// restyled screen pins its own values.
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';

const VIEW = '[data-testid="bookings-view"]';

// First rule body for a single-selector rule inside the shell stylesheet.
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(appSource);
  expect(match, `missing style rule for ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe('booking register design values (Refs #648)', () => {
  it('keeps the register actions on the 44px target', () => {
    // NFR-DSK-3 through the shared `.p-button` scope: the filter's
    // primary and secondary buttons are the screen's two pointer targets
    // and no per-screen audit covers this new surface.
    expect(ruleBody(`#shell ${VIEW} .bookings-action.p-button`)).toContain(
      `min-height: ${deskTokens.targets.minPx}px`,
    );
    expect(ruleBody(`#shell ${VIEW} .bookings-action-secondary.p-button`)).toContain(
      `min-height: ${deskTokens.targets.minPx}px`,
    );
  });

  it('keeps the row action on the 44px target and the action ink', () => {
    // The guest name is the row's single control (one action per row for
    // keyboard and screen-reader users), so it carries the target and the
    // single action accent.
    const rowOpen = ruleBody(`#shell ${VIEW} .bookings-row-open`);
    expect(rowOpen).toContain(`min-height: ${deskTokens.targets.minPx}px`);
    expect(rowOpen).toContain(`color: ${deskTokens.colors.primary}`);
  });

  it('mutes the guest-name action on a cancelled or no-show row', () => {
    // Spec section 5: an inactive row renders its value text in the
    // muted ink so it reads as inactive at a glance. The row scope alone
    // cannot do it — the name is a button with its own accent — so the
    // narrow scope has to re-ink that one control (Refs #648 review S3).
    expect(ruleBody(`#shell ${VIEW} .bookings-row-inactive`)).toContain(
      `color: ${deskTokens.colors.muted}`,
    );
    expect(ruleBody(`#shell ${VIEW} .bookings-row-inactive .bookings-row-open`)).toContain(
      `color: ${deskTokens.colors.muted}`,
    );
  });
});
