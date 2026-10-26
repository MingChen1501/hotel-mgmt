// Characterization guard for the print screen migration
// (Refs #297, ADR-0003): PrintView replicates the
// `frontend/print.html` inline-script behaviour — sign-in, folio
// open (GetFolioBalance with the folio lines plus running-balance
// header so the screen shows what the paper must match), invoice
// render (ProduceInvoice with the same line helpers as the folio
// view), one receipt per recorded payment (ProduceReceipt reading
// paymentId with a fallback to id), booking-confirmation render
// (ProduceConfirmation with the price formatted like the booking
// form), per-document window.print with ancestor-exempt isolation
// CSS, copyable text, and the plain-word refusals — through the
// shared Bearer client and the catalogue `t()` wrapper. No
// Playwright harness exists in this repo yet, so these Vitest
// component tests are the characterization coverage for the print
// flows, including the print-isolation test below.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import PrintView from './PrintView.vue';
import printViewSource from './PrintView.vue?raw';
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

// Full happy-path backend: sign-in plus a folio ledger, one
// invoice, one receipt per payment id, and one confirmation, so
// every document section renders from the same server data the
// legacy page reads.
function stubHappyPath(
  fetchMock: ReturnType<typeof vi.fn>,
): (url: string, init?: RequestInit) => Promise<Response> {
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
          balanceMinor: 7700,
          charges: [
            {
              itemKind: 'nightly-room-charge',
              itemName: 'Room night',
              amountMinor: 10000,
              taxMinor: 500,
              feeMinor: 200,
              postedAt: '2026-10-26T08:00:00.000Z',
            },
          ],
          payments: [{ method: 'cash', amountMinor: 3000, paidAt: '2026-10-26T09:00:00.000Z', paymentId: 'p-1' }],
        }),
      );
    }
    if (url === '/v1/billing/ProduceInvoice') {
      expect(body.folioId).toBe('f-1');
      expect(body.actor).toBe('Ada Owner');
      return Promise.resolve(
        jsonResponse({
          invoiceId: 'inv-1',
          folioId: 'f-1',
          stayId: 's-1',
          producedAt: '2026-10-26T10:00:00.000Z',
          balanceMinor: 7700,
          charges: [
            {
              itemKind: 'nightly-room-charge',
              itemName: 'Room night',
              amountMinor: 10000,
              taxMinor: 500,
              feeMinor: 200,
              postedAt: '2026-10-26T08:00:00.000Z',
            },
          ],
          payments: [{ method: 'cash', amountMinor: 3000, paidAt: '2026-10-26T09:00:00.000Z', paymentId: 'p-1' }],
        }),
      );
    }
    if (url === '/v1/billing/ProduceReceipt') {
      expect(body.paymentId).toBe('p-1');
      expect(body.actor).toBe('Ada Owner');
      return Promise.resolve(
        jsonResponse({
          receiptId: 'r-1',
          paymentId: 'p-1',
          folioId: 'f-1',
          stayId: 's-1',
          method: 'cash',
          amountMinor: 3000,
          paidAt: '2026-10-26T09:00:00.000Z',
        }),
      );
    }
    if (url === '/v1/reservations/GetReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationRef: body.reservationRef ?? 'RSV-1',
          roomTypeId: 'room-type-1',
          arrivalDate: '2026-11-01',
          departureDate: '2026-11-03',
          guest: { guestId: 'g-1', fullName: 'Pat Guest' },
          priceBasis: { totalMinor: 20000, discountName: null },
          state: 'confirmed',
          reservationId: 'r-1',
          stayId: null,
        }),
      );
    }
    if (url === '/v1/guests/AttachReservation') {
      return Promise.resolve(
        jsonResponse({
          hotel: { name: 'Grand Test' },
          guest: { fullName: 'Pat Guest' },
          reservationRef: body.reservationRef,
          dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
          type: 'standard',
          price: { amountMinor: 20000, currency: 'USD' },
        }),
      );
    }
    if (url === '/v1/guests/ProduceConfirmation') {
      return Promise.resolve(
        jsonResponse({
          hotel: { name: 'Grand Test' },
          guest: { fullName: 'Pat Guest' },
          reservationRef: body.reservationRef,
          dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
          type: 'standard',
          price: { amountMinor: 20000, currency: 'USD' },
        }),
      );
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  fetchMock.mockImplementation(happy);
  return happy;
}

function mountPrint() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(PrintView, {
    global: { plugins: [pinia] },
  });
}

async function signIn(wrapper: ReturnType<typeof mountPrint>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): views mount
  // with a signed-in session preset, then work directly.
  stubHappyPath(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.vm.$nextTick();
}

async function openFolio(wrapper: ReturnType<typeof mountPrint>, stayId: string) {
  await wrapper.find('[data-testid="print-stay-id"]').setValue(stayId);
  await wrapper.find('[data-testid="print-open"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="print-folio-status"]').text()).toContain('Folio f-1');
  });
}

async function showInvoice(wrapper: ReturnType<typeof mountPrint>) {
  await wrapper.find('[data-testid="print-invoice"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="print-invoice-document"]').exists()).toBe(true);
  });
}

describe('print view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the print form with no per-screen sign-in copy', () => {
    const wrapper = mountPrint();
    expect(wrapper.find('[data-testid="print-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="print-view"] h1').text()).toContain(
      'Print receipts, invoices, and confirmations',
    );
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="print-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="print-main"]').exists()).toBe(true);
  });

  it('opens a folio with the running balance under the shell session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);

    await openFolio(wrapper, 's-1');

    // The tax/fee lines fold into the item text; the payment
    // subtracts; the header carries the running balance the paper
    // must match.
    const rows = wrapper.findAll('[data-testid="print-folio-table"] tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('Room night (tax 5.00, fee 2.00)');
    expect(rows[0]?.text()).toContain('107.00');
    expect(rows[1]?.text()).toContain('cash payment');
    expect(rows[1]?.text()).toContain('-30.00');
    expect(rows[1]?.text()).toContain('77.00');
    expect(wrapper.find('[data-testid="print-folio-status"]').text()).toContain(
      'Folio f-1: balance 77.00.',
    );

    // The invoice button unlocks once a folio is open; one receipt
    // button renders per recorded payment.
    expect(wrapper.find('[data-testid="print-invoice"]').attributes('disabled')).toBeUndefined();
    const receiptButtons = wrapper.findAll('[data-testid="print-receipt"]');
    expect(receiptButtons).toHaveLength(1);

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
  });

  it('shows the invoice matching the folio lines and balance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    await showInvoice(wrapper);

    const body = wrapper.find('[data-testid="print-invoice-body"]');
    expect(body.text()).toContain('inv-1');
    expect(body.text()).toContain('Room night (tax 5.00, fee 2.00)');
    expect(body.text()).toContain('77.00');
    expect(wrapper.find('[data-testid="print-folio-status"]').text()).toContain(
      'Invoice inv-1 for folio f-1: balance 77.00.',
    );

    const invoiceCalls = fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/ProduceInvoice');
    expect(invoiceCalls).toHaveLength(1);
    expect(parseBody(invoiceCalls[0]?.[1] as RequestInit)).toMatchObject({
      folioId: 'f-1',
      actor: 'Ada Owner',
    });
  });

  it('shows one receipt per recorded payment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    await wrapper.find('[data-testid="print-receipt"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-receipt-document"]').exists()).toBe(true);
    });

    const body = wrapper.find('[data-testid="print-receipt-body"]');
    expect(body.text()).toContain('r-1');
    expect(body.text()).toContain('cash');
    expect(body.text()).toContain('30.00');
    expect(wrapper.find('[data-testid="print-receipt-status"]').text()).toContain(
      'Receipt r-1: cash payment of 30.00 on 2026-10-26T09:00:00.000Z.',
    );

    const receiptCalls = fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/ProduceReceipt');
    expect(receiptCalls).toHaveLength(1);
    expect(parseBody(receiptCalls[0]?.[1] as RequestInit)).toMatchObject({
      paymentId: 'p-1',
      actor: 'Ada Owner',
    });
  });

  it('loads the booking confirmation with the formatted price', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="print-ref"]').setValue('RSV-1');
    await wrapper.find('[data-testid="print-load"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-confirmation-document"]').exists()).toBe(true);
    });

    const body = wrapper.find('[data-testid="print-confirmation-body"]');
    expect(body.text()).toContain('Grand Test');
    expect(body.text()).toContain('Pat Guest');
    expect(body.text()).toContain('RSV-1');
    expect(body.text()).toContain('USD 200.00');

    const confirmCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/guests/ProduceConfirmation',
    );
    expect(confirmCalls).toHaveLength(1);
    expect(parseBody(confirmCalls[0]?.[1] as RequestInit)).toMatchObject({
      reservationRef: 'RSV-1',
    });

    // Issue #323: the human ref resolves through the reservation
    // read, and the RES-side snapshot is attached before producing.
    const readCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/reservations/GetReservation',
    );
    expect(readCalls).toHaveLength(1);
    expect(parseBody(readCalls[0]?.[1] as RequestInit)).toMatchObject({
      reservationRef: 'RSV-1',
    });
    const attachCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/guests/AttachReservation',
    );
    expect(attachCalls).toHaveLength(1);
    expect(parseBody(attachCalls[0]?.[1] as RequestInit)).toMatchObject({
      reservationRef: 'RSV-1',
      guest: { guestId: 'g-1', fullName: 'Pat Guest' },
      dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
      type: 'room-type-1',
      price: { amountMinor: 20000 },
    });
  });

  it('names an unknown booking reference in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    // Override after sign-in: the helper stubs the happy path, and
    // re-stubbing here would clobber the refusal below.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({ code: 'NOT_FOUND', message: 'Unknown reservation RSV-NOPE.' }, 404),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="print-ref"]').setValue('RSV-NOPE');
    await wrapper.find('[data-testid="print-load"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-load-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="print-load-error"]').text()).toContain(
      'Unknown booking reference. Check the reference and try again.',
    );
    expect(wrapper.find('[data-testid="print-confirmation-document"]').exists()).toBe(false);
  });

  it('refuses empty stays and empty booking references in plain words', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="print-open"]').trigger('click');
    expect(wrapper.find('[data-testid="print-folio-status"]').text()).toContain('Enter a stay ID first.');

    await wrapper.find('[data-testid="print-load"]').trigger('click');
    expect(wrapper.find('[data-testid="print-load-error"]').text()).toContain(
      'Enter a booking reference first.',
    );

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).not.toContain('/v1/billing/GetFolioBalance');
    expect(urls).not.toContain('/v1/billing/ProduceInvoice');
    expect(urls).not.toContain('/v1/billing/ProduceReceipt');
    expect(urls).not.toContain('/v1/guests/ProduceConfirmation');
  });

  it('guards the invoice click while a render is in flight', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/ProduceInvoice') {
        return gate;
      }
      return stubHappyPath(vi.fn())(url, init);
    });

    const first = wrapper.find('[data-testid="print-invoice"]').trigger('click');
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="print-invoice"]').attributes('disabled'),
      ).toBeDefined();
    });
    // The second click while in flight sends nothing new.
    await wrapper.find('[data-testid="print-invoice"]').trigger('click');
    const invoiceCalls = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/ProduceInvoice');
    expect(invoiceCalls()).toHaveLength(1);
    release(
      jsonResponse({
        invoiceId: 'inv-1',
        folioId: 'f-1',
        stayId: 's-1',
        producedAt: '2026-10-26T10:00:00.000Z',
        balanceMinor: 7700,
        charges: [],
        payments: [],
      }),
    );
    await first;
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-invoice"]').attributes('disabled')).toBeUndefined();
    });
    expect(invoiceCalls()).toHaveLength(1);
  });

  it('expires the session with the gate notice on 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);

    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401)),
    );
    await wrapper.find('[data-testid="print-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="print-open"]').trigger('click');
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

  it('copies the invoice text through the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');
    await showInvoice(wrapper);

    await wrapper.find('[data-testid="print-invoice-copy"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-invoice-copy-status"]').text()).toContain('Copied.');
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain('inv-1');
  });

  it('reports a copy failure when no clipboard is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');
    await showInvoice(wrapper);

    // jsdom ships no navigator.clipboard: the hand-copy fallback
    // string renders (legacy parity for clipboard-less terminals).
    await wrapper.find('[data-testid="print-invoice-copy"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-invoice-copy-status"]').text()).toContain(
        'Select the text by hand',
      );
    });
  });

  it('prints the active document alone and clears the marker', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');
    await showInvoice(wrapper);

    // The marker applies synchronously before print() (legacy
    // parity: the dialog must see the active section), so capture
    // it inside the print stub itself.
    const print = vi.fn(() => {
      const invoice = wrapper.find('[data-testid="print-invoice-document"]');
      expect(invoice.classes()).toContain('active');
    });
    vi.stubGlobal('print', print);

    await wrapper.find('[data-testid="print-invoice-print"]').trigger('click');
    expect(print).toHaveBeenCalledTimes(1);

    // A missing afterprint event still cleans up on the next tick.
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="print-invoice-document"]').classes(),
      ).not.toContain('active');
    });
  });

  it('renders attacker-influenced names as text, never as markup', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountPrint();
    await signIn(wrapper, fetchMock);

    // Swap in the hostile ledger only after sign-in: the sign-in
    // helper installs the happy-path stub, so the folio read below
    // must come from this override.
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: 's-1',
            balanceMinor: 100,
            charges: [
              {
                itemKind: 'charge-item',
                itemName: 'Room <101> <img src=x onerror=alert(1)>',
                amountMinor: 100,
                postedAt: '2026-10-26T08:00:00.000Z',
              },
            ],
            payments: [],
          }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    await openFolio(wrapper, 's-1');

    // Interpolation escapes by construction (Refs #276): the angle
    // brackets stay literal text and no element is injected.
    const table = wrapper.find('[data-testid="print-folio-table"]');
    expect(table.text()).toContain('Room <101>');
    expect(table.find('img').exists()).toBe(false);
    expect(table.html()).toContain('&lt;101&gt;');
  });

  it('isolates one print document at a time (legacy print.html parity)', () => {
    // jsdom applies no @media print rules, so this pins the
    // isolation at the SFC source: the port of
    // `frontend/print.html:8-25` must hide everything outside the
    // signed-in section, everything inside it except the documents,
    // every non-active document, and the buttons inside the active
    // one — without ever hiding the active document's ancestors.
    expect(printViewSource).toContain('@media print');
    expect(printViewSource).toContain(
      "[data-testid='print-view'] > :not([data-testid='print-main'])",
    );
    expect(printViewSource).toContain("[data-testid='print-main'] > :not(.print-document)");
    expect(printViewSource).toContain(
      "[data-testid='print-main'] > .print-document:not(.active)",
    );
    expect(printViewSource).toContain(
      '[data-testid=\'print-main\'] > .print-document.active button',
    );
    expect(printViewSource).toContain('afterprint');
    expect(printViewSource).toContain('globalThis.print()');
  });
});

// Source-level pins: the port keeps every legacy print op plus the
// refusal, copy, and print vocabulary, and every paragraph stays in
// English.
describe('print view source', () => {
  // Sign-in round trips moved to the shell gate (Refs #338,
  // FR-DSP-2, LLD §12.4): SignIn/SignOut now live in `App.vue`,
  // so the per-screen copies are gone from this source.
  const requiredOps = [
    '/v1/billing/GetFolioBalance',
    '/v1/billing/ProduceInvoice',
    '/v1/billing/ProduceReceipt',
    '/v1/reservations/GetReservation',
    '/v1/guests/AttachReservation',
    '/v1/guests/ProduceConfirmation',
  ];

  it.each(requiredOps)('keeps the legacy op %s', (op) => {
    expect(printViewSource).toContain(op);
  });

  it.each(['need_stay', 'need_ref', 'copied', 'copy_failed', 'paymentId'])(
    'keeps the print vocabulary %s',
    (token) => {
      expect(printViewSource).toContain(token);
    },
  );

  it('uses the session store plus the shared client and catalogue t()', () => {
    for (const token of ['useSessionStore', 'apiFetch', "t('desk.print."]) {
      expect(printViewSource).toContain(token);
    }
    expect(printViewSource).not.toContain('DeskMessages');
    expect(printViewSource).not.toContain('Authorization');
  });

  it('renders through interpolation with no raw-HTML sinks', () => {
    // Refs #276: the legacy esc() mis-keyed `<`/`>` into an
    // injection vector; the SFC must never take that shape back.
    expect(printViewSource).not.toContain('innerHTML');
    expect(printViewSource).not.toContain('v-html');
    expect(printViewSource).not.toContain('esc(');
  });
});
