// Characterization guard for the folio screen migration
// (Refs #296, ADR-0003): FolioView replicates the
// `frontend/folio.html` inline-script behaviour — sign-in, folio
// open (GetFolioBalance with the folio lines plus running-balance
// header), room-charge and hotel-extra posting (PostCharge with the
// tax/fee lines folded into the item text), cash/card payment
// recording (RecordPayment subtracting from the balance), the
// in-flight guards with one idempotencyKey per mutating call, and
// the plain-word refusals — through the shared Bearer client and
// the catalogue `t()` wrapper. No Playwright harness exists in this
// repo yet, so these Vitest component tests are the
// characterization coverage for the folio flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import FolioView from './FolioView.vue';
import folioViewSource from './FolioView.vue?raw';
import appSource from '../App.vue?raw';
import { useSessionStore } from '../stores/session';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';
import router from '../router';

vi.mock('../router', () => ({
  default: { replace: vi.fn() },
  createAppRouter: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return init?.body !== undefined ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
}

interface ChargeRecord {
  itemKind: string;
  itemName: string;
  amountMinor: number;
  taxMinor?: number;
  feeMinor?: number;
  postedAt: string;
}

interface PaymentRecord {
  method: string;
  amountMinor: number;
  paidAt: string;
}

function chargeTotal(line: ChargeRecord): number {
  return line.amountMinor + (line.taxMinor ?? 0) + (line.feeMinor ?? 0);
}

// Full happy-path backend: sign-in plus a folio ledger that stays
// consistent across the re-reads after each mutation, so the
// running-balance header always agrees with the posted lines.
function stubHappyPath(
  fetchMock: ReturnType<typeof vi.fn>,
): (url: string, init?: RequestInit) => Promise<Response> {
  const charges: ChargeRecord[] = [
    {
      itemKind: 'nightly-room-charge',
      itemName: 'Room night',
      amountMinor: 10000,
      taxMinor: 500,
      feeMinor: 200,
      postedAt: '2026-10-26T08:00:00.000Z',
    },
  ];
  const payments: PaymentRecord[] = [
    { method: 'cash', amountMinor: 3000, paidAt: '2026-10-26T09:00:00.000Z' },
  ];
  const balanceMinor = (): number =>
    charges.reduce((sum, line) => sum + chargeTotal(line), 0) -
    payments.reduce((sum, line) => sum + line.amountMinor, 0);

  const happy = (url: string, init?: RequestInit): Promise<Response> => {
    const body = parseBody(init);
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/billing/GetFolioBalance') {
      return Promise.resolve(
        jsonResponse({
          folioId: 'f-1',
          stayId: body.stayId,
          balanceMinor: balanceMinor(),
          charges,
          payments,
        }),
      );
    }
    if (url === '/v1/billing/PostCharge') {
      expect(body.actor).toBe('Ada Owner');
      expect(body.idempotencyKey).toBeTruthy();
      const posted: ChargeRecord = {
        itemKind: String(body.itemKind),
        itemName: String(body.itemName),
        amountMinor: Number(body.amountMinor),
        taxMinor: 0,
        feeMinor: 0,
        postedAt: '2026-10-26T10:00:00.000Z',
      };
      charges.push(posted);
      return Promise.resolve(jsonResponse(posted));
    }
    if (url === '/v1/billing/RecordPayment') {
      expect(body.actor).toBe('Ada Owner');
      expect(body.idempotencyKey).toBeTruthy();
      const recorded: PaymentRecord = {
        method: String(body.method),
        amountMinor: Number(body.amountMinor),
        paidAt: '2026-10-26T11:00:00.000Z',
      };
      payments.push(recorded);
      return Promise.resolve(jsonResponse(recorded));
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  fetchMock.mockImplementation(happy);
  return happy;
}

function mountFolio() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(FolioView, {
    global: { plugins: [pinia] },
  });
}

async function signIn(wrapper: ReturnType<typeof mountFolio>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): views mount
  // with a signed-in session preset, then work directly.
  stubHappyPath(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.vm.$nextTick();
}

async function openFolio(wrapper: ReturnType<typeof mountFolio>, stayId: string) {
  await wrapper.find('[data-testid="folio-stay-id"]').setValue(stayId);
  await wrapper.find('[data-testid="folio-open"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Folio balance:');
  });
}

describe('folio view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the folio form with no screen title and no per-screen sign-in copy', () => {
    const wrapper = mountFolio();
    expect(wrapper.find('[data-testid="folio-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the card titles resolve through t().
    // The v2 board carries no screen title (Refs #545), so no h1 renders.
    expect(wrapper.find('[data-testid="folio-view"] h1').exists()).toBe(false);
    const titles = wrapper.findAll('[data-testid="folio-view"] h3').map((node) => node.text());
    expect(titles).toEqual(['Open a stay folio', 'Charges', 'Payment']);
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="folio-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="folio-main"]').exists()).toBe(true);
  });

  it('opens a folio with the running balance under the shell session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);

    await openFolio(wrapper, 's-1');

    // The tax/fee lines fold into the item text; the payment
    // subtracts; the due block carries the running balance.
    const chargeLines = wrapper.findAll('[data-testid="folio-charge-lines"] .folio-line');
    expect(chargeLines).toHaveLength(1);
    expect(chargeLines[0]?.text()).toContain('Room night (tax 5 đ, fee 2 đ)');
    expect(chargeLines[0]?.text()).toContain('107 đ');
    const paymentLines = wrapper.findAll('[data-testid="folio-payment-lines"] .folio-line');
    expect(paymentLines).toHaveLength(1);
    expect(paymentLines[0]?.text()).toContain('Cash payment');
    // Board rows render positive amounts as drawn
    // (`docs/design/Folio.dc.html:3`): VND with no decimals and
    // the `đ` suffix (Refs #565, G-FO-2).
    expect(paymentLines[0]?.text()).toContain('30 đ');
    expect(paymentLines[0]?.text()).not.toContain('-30 đ');
    // The due figure carries the locale-grouped balance; the
    // sentence status stays as flow state below it.
    expect(wrapper.find('[data-testid="folio-balance"]').text()).toContain('77 đ');
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain(
      'Folio balance: 77 đ.',
    );
    // The exact folio and stay IDs hide behind the reference
    // details (issue #372): the default status names no raw UUID.
    expect(wrapper.find('[data-testid="folio-status"]').text()).not.toContain('f-1');
    await wrapper.find('[data-testid="folio-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-details-body"]').text()).toContain('f-1');
    expect(wrapper.find('[data-testid="folio-details-body"]').text()).toContain('s-1');

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
  });

  it('posts a room charge with an idempotency key and re-reads the folio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('12');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('Posted');
    });
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('Minibar');
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('12 đ');

    const chargeCalls = fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/PostCharge');
    expect(chargeCalls).toHaveLength(1);
    const chargeBody = parseBody(chargeCalls[0]?.[1] as RequestInit);
    expect(chargeBody.stayId).toBe('s-1');
    expect(chargeBody.itemKind).toBe('nightly-room-charge');
    expect(chargeBody.itemName).toBe('Minibar');
    expect(chargeBody.amountMinor).toBe(1200);
    expect(chargeBody.idempotencyKey).toBeTruthy();

    // The re-read picks up the posted line in the running balance.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Folio balance: 89 đ.');
    });
  });

  it('records a card payment with an idempotency key and re-reads the folio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="folio-payment-method"]').setValue('card');
    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('7');
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('Recorded');
    });
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('card payment');
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('7 đ');

    const payCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/billing/RecordPayment',
    );
    expect(payCalls).toHaveLength(1);
    const payBody = parseBody(payCalls[0]?.[1] as RequestInit);
    expect(payBody.stayId).toBe('s-1');
    expect(payBody.method).toBe('card');
    expect(payBody.amountMinor).toBe(700);
    expect(payBody.idempotencyKey).toBeTruthy();

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Folio balance: 70 đ.');
    });
  });

  it('refuses empty stays, blank charges, and non-positive payments in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="folio-open"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Enter a stay ID first.');

    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain(
      'Enter the item name and a non-negative amount first.',
    );

    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('-1');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain(
      'Enter the item name and a non-negative amount first.',
    );

    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('0');
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain(
      'Enter a positive amount first.',
    );

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).not.toContain('/v1/billing/GetFolioBalance');
    expect(urls).not.toContain('/v1/billing/PostCharge');
    expect(urls).not.toContain('/v1/billing/RecordPayment');
  });

  it('names the undefined charge item in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    // Override after sign-in: the helper stubs the happy path, and
    // re-stubbing here would clobber the refusal below.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/PostCharge') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'VALIDATION_FAILED',
              message: 'Charge item Minibar is not defined.',
              details: { itemName: 'Minibar' },
            },
            400,
          ),
        );
      }
      return happy(url, init);
    });
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="folio-charge-kind"]').setValue('charge-item');
    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('12.50');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="folio-charge-error"]').text()).toContain(
      'That extra is not on the hotel list: Minibar.',
    );
  });

  it('names a bad payment method in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    // Override after sign-in: the helper stubs the happy path, and
    // re-stubbing here would clobber the refusal below. Billing
    // refuses a method other than cash or card with
    // VALIDATION_FAILED naming the field (Refs #365).
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/RecordPayment') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'VALIDATION_FAILED',
              message: 'method must be cash or card.',
              details: { field: 'method' },
            },
            400,
          ),
        );
      }
      return happy(url, init);
    });
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('100');
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-payment-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="folio-payment-error"]').text()).toContain(
      'That payment method is not accepted. Use cash or card.',
    );
  });

  it('names an unknown folio on open in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    // Override after sign-in: the helper stubs the happy path, and
    // re-stubbing here would clobber the refusal below. A malformed
    // stay id never reaches a folio: billing refuses with
    // VALIDATION_FAILED naming the field (Refs #365).
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'VALIDATION_FAILED',
              message: 'stayId must be a UUID.',
              details: { field: 'stayId' },
            },
            400,
          ),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="folio-stay-id"]').setValue('not-a-stay-id');
    await wrapper.find('[data-testid="folio-open"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-open-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="folio-open-error"]').text()).toContain(
      'No folio for that stay. Check the stay ID and try again.',
    );
  });

  it('guards the charge click while a post is in flight', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/PostCharge') {
        return gate;
      }
      return stubHappyPath(vi.fn())(url, init);
    });

    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('5');
    const first = wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="folio-charge"]').attributes('disabled'),
      ).toBeDefined();
    });
    // The second click while in flight sends nothing new.
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    const chargeCalls = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/PostCharge');
    expect(chargeCalls()).toHaveLength(1);
    release(
      jsonResponse({
        itemKind: 'nightly-room-charge',
        itemName: 'Minibar',
        amountMinor: 500,
        taxMinor: 0,
        feeMinor: 0,
        postedAt: '2026-10-26T10:00:00.000Z',
      }),
    );
    await first;
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge"]').attributes('disabled')).toBeUndefined();
    });
    expect(chargeCalls()).toHaveLength(1);
  });

  it('expires the session with the gate notice on 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);

    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
      }
      return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
    });
    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="folio-open"]').trigger('click');
    // The shared client expires the session and routes to the
    // gate (covered in the shell gate suite); the view keeps no
    // sign-in copy.
    await vi.waitFor(() => {
      expect(useSessionStore().token).toBeNull();
    });
    expect(useSessionStore().signOutNotice).toBe('session-expired');
    expect(useSessionStore().isSignedIn).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  // D8 (Refs #545; v2 board adoption, epic #537): the Folio
  // screen renders its design two-card grid with no screen title
  // — the charges card (charge lines plus the post-charge form)
  // left, the payments card (due block plus payment lines plus
  // the record-payment form) right in a `1fr 1fr` grid — with the
  // stay-ID open step (F3 flow state, orchestrator decision on
  // #545) above and no left/right column wrappers. Flow, refusal,
  // and balance tests below stay untouched (semantics unchanged);
  // only this layout is new.
  it('renders the design two-card grid with the open step above', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    expect(wrapper.find('[data-testid="folio-open-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="folio-layout"]').exists()).toBe(true);
    // DOM order carries the design columns: the grid holds the
    // charges card left and the payments card right with no
    // left/right column wrappers.
    expect(wrapper.find('[data-testid="folio-left"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="folio-right"]').exists()).toBe(false);
    const layoutHtml = wrapper.find('[data-testid="folio-layout"]').html();
    expect(layoutHtml.indexOf('folio-charges-card')).toBeLessThan(
      layoutHtml.indexOf('folio-payments-card'),
    );
    const chargesCard = wrapper.find('[data-testid="folio-charges-card"]');
    const paymentsCard = wrapper.find('[data-testid="folio-payments-card"]');
    expect(chargesCard.exists()).toBe(true);
    expect(paymentsCard.exists()).toBe(true);
    // Actions ride their design cards: the charge lines plus
    // post-charge on the charges card; the due block, payment
    // lines, plus record-payment on the payments card.
    expect(chargesCard.find('[data-testid="folio-charge-lines"]').exists()).toBe(true);
    expect(chargesCard.find('[data-testid="folio-charge"]').exists()).toBe(true);
    expect(paymentsCard.find('[data-testid="folio-payment-lines"]').exists()).toBe(true);
    expect(paymentsCard.find('[data-testid="folio-pay"]').exists()).toBe(true);
    // The due block heads the payments card with the board copy.
    expect(paymentsCard.find('.folio-due-label').text()).toContain('Balance due');
    expect(paymentsCard.find('[data-testid="folio-balance"]').text()).toContain('77 đ');
    // EN amounts use EN grouping with no decimals and the `đ`
    // suffix, the design VND shape (Refs #565, G-FO-2).
    expect(paymentsCard.find('[data-testid="folio-status"]').text()).toContain(
      'Folio balance: 77 đ.',
    );

    // A design-scale charge proves the grouping (the design shows
    // 1.800.000 for a two-night room charge).
    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Room night');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('18000');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('18,000 đ');
    });

    // VI-primary copy (AC-DSK-8): the cards switch locale with no
    // mixed-locale copy, and amounts use VI grouping.
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(paymentsCard.find('[data-testid="folio-pay"]').text()).toContain('Ghi thanh toán');
      expect(chargesCard.find('[data-testid="folio-charge"]').text()).toContain('Ghi khoản phí');
      expect(paymentsCard.find('.folio-due-label').text()).toContain('Còn phải trả');
      expect(paymentsCard.find('[data-testid="folio-balance"]').text()).toContain('18.077 đ');
      expect(paymentsCard.find('[data-testid="folio-status"]').text()).toContain(
        'Số dư bảng kê: 18.077 đ.',
      );
      expect(chargesCard.find('[data-testid="folio-charge-lines"]').text()).toContain('18.000 đ');
      expect(paymentsCard.find('[data-testid="folio-payment-lines"]').text()).toContain('Tiền mặt');
    } finally {
      setLocale('en');
    }
  });

  // D8 (Refs #545, NFR-DSK-2): the folio board adoption stays
  // out of print — the view carries no `<style>` block, so the
  // shell screen stylesheet owns every new rule (the M4 suite pins
  // that stylesheet to `@media screen`), and printed values
  // still match the folio exactly (pinned by the PrintView
  // suite, untouched here).
  it('keeps the folio board adoption out of print', () => {
    expect(folioViewSource).not.toContain('<style');
    expect(appSource).toContain('.folio-layout');
    expect(appSource).toContain('.folio-lines');
    expect(appSource).toContain('.folio-due-label');
    expect(appSource).toContain('.folio-balance-due');
  });
});

// Source-level pins: the port keeps every legacy billing op plus
// the refusal and idempotency vocabulary, and every paragraph
// stays in English.
describe('folio view source', () => {
  // Sign-in round trips moved to the shell gate (Refs #338,
  // FR-DSP-2, LLD section 12.4): SignIn/SignOut now live in `App.vue`,
  // so the per-screen copies are gone from this source.
  const requiredOps = [
    '/v1/billing/GetFolioBalance',
    '/v1/billing/PostCharge',
    '/v1/billing/RecordPayment',
  ];

  it.each(requiredOps)('keeps the legacy op %s', (op) => {
    expect(folioViewSource).toContain(op);
  });

  // Refs #568: the charges title resolves the stay's guest and room
  // through the existing reads, and every new string rides the
  // catalogue (no hardcoded copy).
  it('resolves the open folio context through the stay, guest, and room reads', () => {
    for (const op of ['/v1/stay/GetStay', '/v1/guests/GetGuest', '/v1/rooms/ListRoomsByState']) {
      expect(folioViewSource).toContain(op);
    }
    expect(folioViewSource).toContain('desk.folio.charges_context');
  });

  it.each(['need_stay', 'need_charge', 'need_payment', 'refused_bad_method', 'refused_unknown_folio', 'idempotencyKey'])(
    'keeps the folio vocabulary %s',
    (token) => {
      expect(folioViewSource).toContain(token);
    },
  );

  it('uses the session store plus the shared client and catalogue t()', () => {
    for (const token of ['useSessionStore', 'apiFetch', "t('desk.folio."]) {
      expect(folioViewSource).toContain(token);
    }
    expect(folioViewSource).not.toContain('DeskMessages');
    expect(folioViewSource).not.toContain('Authorization');
  });
});

// Open-folio context (Refs #568, `docs/design/Folio.dc.html:3`): the
// board titles the charges card `Khoản phí · Lê Minh · P.201`, so the
// live title names the stay's guest and room. The raw
// stay/folio/guest/room IDs stay behind the reference disclosure
// (issue #372). These guards live in their own block at the end so the
// behaviour pins above keep their line anchors in the traceability
// docs; the shared happy-path stub stays billing-only, and the stay
// reads ride this wrapper.
describe('folio open context (Refs #568)', () => {
  function withStayContext(
    inner: (url: string, init?: RequestInit) => Promise<Response>,
  ): (url: string, init?: RequestInit) => Promise<Response> {
    return (url: string, init?: RequestInit): Promise<Response> => {
      const body = parseBody(init);
      if (url === '/v1/stay/GetStay') {
        return Promise.resolve(
          jsonResponse({ stayId: body.stayId, guestId: 'g-1', roomId: 'r-1' }),
        );
      }
      if (url === '/v1/guests/GetGuest') {
        expect(body.guestId).toBe('g-1');
        return Promise.resolve(jsonResponse({ guestId: 'g-1', fullName: 'Lê Minh' }));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        const state = String(body.state);
        return Promise.resolve(
          jsonResponse({
            state,
            rooms: state === 'occupied' ? [{ roomId: 'r-1', number: '201' }] : [],
          }),
        );
      }
      return inner(url, init);
    };
  }

  async function openWithContext(
    wrapper: ReturnType<typeof mountFolio>,
    stayId: string,
  ): Promise<void> {
    await openFolio(wrapper, stayId);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charges-title"]').text()).not.toBe('Charges');
    });
  }

  it('names the guest and room on the charges card like the board', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    fetchMock.mockImplementation(withStayContext(stubHappyPath(fetchMock)));

    await openWithContext(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
      'Charges · Lê Minh · Room 201',
    );

    // The context comes from the existing stay/guest reads plus the
    // room-state lane the room sits in; an in-house room resolves
    // from the occupied read alone.
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toContain('/v1/stay/GetStay');
    expect(urls).toContain('/v1/guests/GetGuest');
    const roomCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/rooms/ListRoomsByState',
    );
    expect(roomCalls).toHaveLength(1);
    expect(parseBody(roomCalls[0]?.[1] as RequestInit).state).toBe('occupied');

    // No raw UUID is exposed by default (issue #372): neither the
    // charges title nor the running-balance line names a record ID.
    const title = wrapper.find('[data-testid="folio-charges-title"]').text();
    for (const id of ['s-1', 'f-1', 'g-1', 'r-1']) {
      expect(title).not.toContain(id);
      expect(wrapper.find('[data-testid="folio-status"]').text()).not.toContain(id);
    }

    // VI carries the board wording, room prefix included (AC-DSK-8).
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
        'Khoản phí · Lê Minh · P.201',
      );
    } finally {
      setLocale('en');
    }
  });

  it('clears the guest and room context when the stay ID changes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    fetchMock.mockImplementation(withStayContext(stubHappyPath(fetchMock)));

    await openWithContext(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toContain('Lê Minh');

    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-2');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe('Charges');
    expect(wrapper.find('[data-testid="folio-status"]').text()).toBe('');
  });

  it('never paints a slow context read over a changed stay ID', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    const happy = withStayContext(stubHappyPath(fetchMock));
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/GetStay') {
        return gate;
      }
      return happy(url, init);
    });

    // The folio renders while its stay read is still in flight; the
    // desk then types the next stay ID, which must win.
    await openFolio(wrapper, 's-1');
    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-2');
    release(jsonResponse({ stayId: 's-1', guestId: 'g-1', roomId: 'r-1' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe('Charges');
  });

  it('keeps the plain charges title when the stay context reads fail', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    // A signed-in session whose stay read refuses (best effort,
    // Refs #568): the card keeps its plain title instead of
    // guessing, and still names no record ID.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/GetStay') {
        return Promise.resolve(
          jsonResponse({ code: 'NOT_FOUND', message: 'unknown stay' }, 404),
        );
      }
      return happy(url, init);
    });

    await openFolio(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe('Charges');
  });

  // Product section 6.9 state clause (Refs #568): while the best-effort
  // context reads run, the open, post, and payment confirmations must
  // already have cleared their own busy state (no spinner, no disabled
  // button, the rest of the card usable).
  it('does not hold the open or post busy state on the context read', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    const happy = withStayContext(stubHappyPath(fetchMock));
    let holdStay = false;
    let release!: (value: Response) => void;
    let gate: Promise<Response> = Promise.resolve(jsonResponse({}));
    const holdNextStayRead = (): void => {
      gate = new Promise<Response>((resolve) => {
        release = resolve;
      });
    };
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (holdStay && url === '/v1/stay/GetStay') {
        return gate;
      }
      return happy(url, init);
    });

    // Open: the folio renders from the billing read while its context
    // read is still held, and the open action is already idle.
    holdNextStayRead();
    holdStay = true;
    await openFolio(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-opening"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="folio-open"]').attributes('disabled')).toBeUndefined();
    release(jsonResponse({ stayId: 's-1', guestId: 'g-1', roomId: 'r-1' }));
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toContain('Lê Minh');
    });

    // Post: the confirmation lands while the context re-read is held,
    // and the charge action is already idle again.
    holdNextStayRead();
    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('5');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('Posted');
    });
    expect(wrapper.find('[data-testid="folio-charging"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="folio-charge"]').attributes('disabled')).toBeUndefined();
    // The known context stays painted while the re-read is held.
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toContain('Lê Minh');

    release(jsonResponse({ stayId: 's-1', guestId: 'g-1', roomId: 'r-1' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  // Half-resolved halves (Refs #578, `AC-DSK-14`): once either half
  // resolves, an unresolved half takes the catalogue wording —
  // `Room number unavailable` / `Không rõ số phòng` here — instead of
  // the record ID it could not name (issue #372 rule). This is the
  // room half while the guest half resolves.
  it('names the catalogue room wording when no state lane lists the room', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    const happy = withStayContext(stubHappyPath(fetchMock));
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ListRoomsByState') {
        // Every lane comes back empty: the stay points at a room the
        // housekeeping reads do not list.
        return Promise.resolve(jsonResponse({ state: String(parseBody(init).state), rooms: [] }));
      }
      return happy(url, init);
    });

    await openWithContext(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
      'Charges · Lê Minh · Room number unavailable',
    );

    // All five lanes were read and none matched, so the room half
    // falls back instead of guessing a number.
    const states = fetchMock.mock.calls
      .filter((call) => call[0] === '/v1/rooms/ListRoomsByState')
      .map((call) => String(parseBody(call[1] as RequestInit).state));
    expect(states).toEqual([
      'occupied',
      'vacant-dirty',
      'vacant-clean',
      'vacant-inspected',
      'out-of-order',
    ]);

    // No raw UUID reaches the default surface (issue #372): neither
    // the title nor the running-balance line names a record ID.
    const title = wrapper.find('[data-testid="folio-charges-title"]').text();
    for (const id of ['s-1', 'f-1', 'g-1', 'r-1']) {
      expect(title).not.toContain(id);
      expect(wrapper.find('[data-testid="folio-status"]').text()).not.toContain(id);
    }

    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
        'Khoản phí · Lê Minh · Không rõ số phòng',
      );
    } finally {
      setLocale('en');
    }
  });

  // The mirror half (Refs #578): the room resolves from its occupied
  // lane while the guest read resolves nothing, so the guest half
  // takes `Unknown guest` / `Khách chưa rõ` — never the guest ID.
  it('names the catalogue guest wording when the guest read resolves nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    const happy = withStayContext(stubHappyPath(fetchMock));
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/guests/GetGuest') {
        return Promise.resolve(
          jsonResponse({ code: 'NOT_FOUND', message: 'unknown guest' }, 404),
        );
      }
      return happy(url, init);
    });

    await openWithContext(wrapper, 's-1');
    expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
      'Charges · Unknown guest · Room 201',
    );

    // The room half still names the real number from its lane.
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toContain('/v1/guests/GetGuest');
    expect(urls).toContain('/v1/rooms/ListRoomsByState');

    // No raw UUID reaches the default surface (issue #372): neither
    // the title nor the running-balance line names a record ID.
    const title = wrapper.find('[data-testid="folio-charges-title"]').text();
    for (const id of ['s-1', 'f-1', 'g-1', 'r-1']) {
      expect(title).not.toContain(id);
      expect(wrapper.find('[data-testid="folio-status"]').text()).not.toContain(id);
    }

    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="folio-charges-title"]').text()).toBe(
        'Khoản phí · Khách chưa rõ · P.201',
      );
    } finally {
      setLocale('en');
    }
  });
});
