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
import { useSessionStore } from '../stores/session';
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
  stubHappyPath(fetchMock);
  await wrapper.find('[data-testid="folio-signin-identity"]').setValue('owner');
  await wrapper.find('[data-testid="folio-signin-secret"]').setValue('s3cret');
  await wrapper.find('[data-testid="folio-signin-form"]').trigger('submit');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="folio-main"]').exists()).toBe(true);
  });
}

async function openFolio(wrapper: ReturnType<typeof mountFolio>, stayId: string) {
  await wrapper.find('[data-testid="folio-stay-id"]').setValue(stayId);
  await wrapper.find('[data-testid="folio-open"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Folio f-1');
  });
}

describe('folio view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the sign-in form when signed out', () => {
    const wrapper = mountFolio();
    expect(wrapper.find('[data-testid="folio-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="folio-view"] h1').text()).toContain('Desk Folio');
    expect(wrapper.find('[data-testid="folio-signin"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="folio-main"]').exists()).toBe(false);
  });

  it('signs in with bearer auth and opens a folio with the running balance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    expect(wrapper.find('[data-testid="folio-whoami"]').text()).toBe('Ada Owner');

    await openFolio(wrapper, 's-1');

    // The tax/fee lines fold into the item text; the payment
    // subtracts; the header carries the running balance.
    const rows = wrapper.findAll('[data-testid="folio-table"] tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Room night (tax 5.00, fee 2.00)');
    expect(rows[0]?.text()).toContain('107.00');
    expect(rows[1]?.text()).toContain('cash payment');
    expect(rows[1]?.text()).toContain('-30.00');
    expect(rows[1]?.text()).toContain('77.00');
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain(
      'Folio f-1: balance 77.00.',
    );

    // Bearer session handling: the shared client attaches the token
    // to every call made after sign-in.
    const calls = fetchMock.mock.calls;
    expect((calls[0]?.[1]?.headers as Headers).get('Authorization')).toBeNull();
    for (const call of calls.slice(1)) {
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
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('12.50');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('Posted');
    });
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('Minibar');
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain('12.50');

    const chargeCalls = fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/PostCharge');
    expect(chargeCalls).toHaveLength(1);
    const chargeBody = parseBody(chargeCalls[0]?.[1] as RequestInit);
    expect(chargeBody.stayId).toBe('s-1');
    expect(chargeBody.itemKind).toBe('nightly-room-charge');
    expect(chargeBody.itemName).toBe('Minibar');
    expect(chargeBody.amountMinor).toBe(1250);
    expect(chargeBody.idempotencyKey).toBeTruthy();

    // The re-read picks up the posted line in the running balance.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('balance 89.50.');
    });
  });

  it('records a card payment with an idempotency key and re-reads the folio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="folio-payment-method"]').setValue('card');
    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('7.00');
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('Recorded');
    });
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('card payment');
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain('7.00');

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
      expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('balance 70.00.');
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

  it('returns to sign-in with the expired-session message on 401', async () => {
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
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-signin"]').exists()).toBe(true);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-signin-error"]').text()).toContain('Session expired');
    });
    expect(useSessionStore().isSignedIn).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

// Source-level pins: the port keeps every legacy billing op plus
// the refusal and idempotency vocabulary, and every paragraph
// stays in English.
describe('folio view source', () => {
  const requiredOps = [
    '/v1/admin/SignIn',
    '/v1/admin/SignOut',
    '/v1/billing/GetFolioBalance',
    '/v1/billing/PostCharge',
    '/v1/billing/RecordPayment',
  ];

  it.each(requiredOps)('keeps the legacy op %s', (op) => {
    expect(folioViewSource).toContain(op);
  });

  it.each(['need_stay', 'need_charge', 'need_payment', 'idempotencyKey'])(
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
