<template>
  <main data-testid="print-view">
    <h1>{{ t('desk.print.title', {}, 'Hotel Management — Desk Print') }}</h1>
    <p>
      <a href="/app/">{{ t('desk.print.back', {}, 'Back to the desk entry') }}</a> ·
      <a href="/app/">{{ t('desk.print.today_link', {}, "Today's arrivals, in-house, and departures") }}</a> ·
      <a href="/app/folio">{{ t('desk.print.folio_link', {}, 'Stay folio (charges and payments)') }}</a> ·
      <a href="/app/book">{{ t('desk.print.book_link', {}, 'Desk booking (price quote and confirm)') }}</a>
    </p>
    <noscript><p>This page needs JavaScript to sign in and print invoices, receipts, and confirmations.</p></noscript>

    <section
      v-if="!session.isSignedIn"
      data-testid="print-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="print-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="print-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="print-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="print-signin-identity"
          >
        </label>
        <label for="print-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="print-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="print-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="print-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="print-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="print-main"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="print-whoami">{{ displayName }}</strong>
        (<span data-testid="print-myrole">{{ role }}</span>).
        <button
          id="print-signout-button"
          type="button"
          data-testid="print-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>

      <h2>{{ t('desk.print.open_heading', {}, 'Open a folio for printing') }}</h2>
      <div>
        <label for="print-stay-id">
          {{ t('desk.print.stay_id', {}, 'Stay ID: ') }}
          <input
            id="print-stay-id"
            v-model="stayId"
            name="print-stay-id"
            autocomplete="off"
            data-testid="print-stay-id"
            @input="onStayIdInput"
          >
        </label>
        <button
          id="print-open-button"
          type="button"
          data-testid="print-open"
          :disabled="opening"
          @click="onOpen"
        >
          {{ t('desk.print.open_button', {}, 'Open folio') }}
        </button>
        <p
          v-if="openError"
          role="alert"
          data-testid="print-open-error"
        >
          {{ openError }}
        </p>
      </div>

      <h2>{{ t('desk.print.folio_heading', {}, 'Folio on screen (what prints must match this)') }}</h2>
      <p
        role="status"
        data-testid="print-folio-status"
      >
        {{ folioStatus }}
      </p>
      <table
        id="print-folio-table"
        data-testid="print-folio-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.folio.th_time', {}, 'Time') }}</th>
            <th>{{ t('desk.folio.th_item', {}, 'Item') }}</th>
            <th>{{ t('desk.folio.th_amount', {}, 'Amount') }}</th>
            <th>{{ t('desk.folio.th_balance', {}, 'Running balance') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(entry, index) in entryRows"
            :key="index"
          >
            <td>{{ entry.at }}</td>
            <td>{{ entry.item }}</td>
            <td>{{ entry.amount }}</td>
            <td>{{ entry.balance }}</td>
          </tr>
          <tr v-if="entryRows.length === 0">
            <td colspan="4">
              {{ t('desk.folio.no_lines', {}, 'No charges or payments yet.') }}
            </td>
          </tr>
        </tbody>
      </table>
      <div>
        <button
          id="print-invoice-button"
          type="button"
          data-testid="print-invoice"
          :disabled="invoiceButtonDisabled"
          @click="onShowInvoice"
        >
          {{ t('desk.print.invoice_button', {}, 'Show invoice') }}
        </button>
        <p
          v-if="invoiceError"
          role="alert"
          data-testid="print-invoice-error"
        >
          {{ invoiceError }}
        </p>
      </div>

      <section
        v-if="invoicePairs !== null"
        ref="invoiceDoc"
        data-testid="print-invoice-document"
        class="print-document"
      >
        <h2>{{ t('desk.print.invoice_heading', {}, 'Invoice') }}</h2>
        <div data-testid="print-invoice-body">
          <dl>
            <template
              v-for="pair in invoicePairs"
              :key="pair.label"
            >
              <dt>{{ pair.label }}</dt><dd>{{ pair.value }}</dd>
            </template>
          </dl>
          <table data-testid="print-invoice-table">
            <thead>
              <tr>
                <th scope="col">
                  {{ t('desk.folio.th_time', {}, 'Time') }}
                </th>
                <th scope="col">
                  {{ t('desk.folio.th_item', {}, 'Item') }}
                </th>
                <th scope="col">
                  {{ t('desk.folio.th_amount', {}, 'Amount') }}
                </th>
                <th scope="col">
                  {{ t('desk.folio.th_balance', {}, 'Running balance') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(entry, index) in invoiceEntryRows"
                :key="index"
              >
                <td>{{ entry.at }}</td>
                <td>{{ entry.item }}</td>
                <td>{{ entry.amount }}</td>
                <td>{{ entry.balance }}</td>
              </tr>
              <tr v-if="invoiceEntryRows.length === 0">
                <td colspan="4">
                  {{ t('desk.folio.no_lines', {}, 'No charges or payments yet.') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          id="print-invoice-print-button"
          type="button"
          data-testid="print-invoice-print"
          @click="onPrintInvoice"
        >
          {{ t('desk.print.print_button', {}, 'Print') }}
        </button>
        <button
          id="print-invoice-copy-button"
          type="button"
          data-testid="print-invoice-copy"
          @click="onCopyInvoice"
        >
          {{ t('desk.print.copy_button', {}, 'Copy text') }}
        </button>
        <p
          v-if="invoiceCopyStatus"
          role="status"
          data-testid="print-invoice-copy-status"
        >
          {{ invoiceCopyStatus }}
        </p>
      </section>

      <h2>{{ t('desk.print.receipt_heading', {}, 'Receipts (one per payment)') }}</h2>
      <p
        role="status"
        data-testid="print-receipt-status"
      >
        {{ receiptStatus }}
      </p>
      <ul data-testid="print-payment-list">
        <li
          v-for="payment in receiptPayments"
          :key="payment.key"
          data-testid="print-payment-item"
        >
          {{ payment.label }}
          <button
            v-if="payment.paymentId !== null"
            type="button"
            data-testid="print-receipt"
            @click="onShowReceipt(payment.paymentId)"
          >
            {{ t('desk.print.receipt_button', {}, 'Receipt') }}
          </button>
        </li>
        <li v-if="receiptPayments.length === 0">
          {{ t('desk.print.no_payments', {}, 'No payments recorded yet.') }}
        </li>
      </ul>
      <p
        v-if="receiptError"
        role="alert"
        data-testid="print-receipt-error"
      >
        {{ receiptError }}
      </p>

      <section
        v-if="receiptPairs !== null"
        ref="receiptDoc"
        data-testid="print-receipt-document"
        class="print-document"
      >
        <h2>{{ t('desk.print.receipt_heading', {}, 'Receipts (one per payment)') }}</h2>
        <div data-testid="print-receipt-body">
          <dl>
            <template
              v-for="pair in receiptPairs"
              :key="pair.label"
            >
              <dt>{{ pair.label }}</dt><dd>{{ pair.value }}</dd>
            </template>
          </dl>
        </div>
        <button
          id="print-receipt-print-button"
          type="button"
          data-testid="print-receipt-print"
          @click="onPrintReceipt"
        >
          {{ t('desk.print.print_button', {}, 'Print') }}
        </button>
        <button
          id="print-receipt-copy-button"
          type="button"
          data-testid="print-receipt-copy"
          @click="onCopyReceipt"
        >
          {{ t('desk.print.copy_button', {}, 'Copy text') }}
        </button>
        <p
          v-if="receiptCopyStatus"
          role="status"
          data-testid="print-receipt-copy-status"
        >
          {{ receiptCopyStatus }}
        </p>
      </section>

      <h2>{{ t('desk.print.confirmation_heading', {}, 'Booking confirmation') }}</h2>
      <div>
        <label for="print-ref">
          {{ t('desk.print.reservation_ref', {}, 'Booking reference: ') }}
          <input
            id="print-ref"
            v-model="reservationRef"
            name="print-ref"
            autocomplete="off"
            data-testid="print-ref"
          >
        </label>
        <button
          id="print-load-button"
          type="button"
          data-testid="print-load"
          :disabled="loading"
          @click="onLoad"
        >
          {{ t('desk.print.load_button', {}, 'Load confirmation') }}
        </button>
        <p
          v-if="loadError"
          role="alert"
          data-testid="print-load-error"
        >
          {{ loadError }}
        </p>
      </div>

      <section
        v-if="confirmationPairs !== null"
        ref="confirmationDoc"
        data-testid="print-confirmation-document"
        class="print-document"
      >
        <h2>{{ t('desk.print.confirmation_heading', {}, 'Booking confirmation') }}</h2>
        <div data-testid="print-confirmation-body">
          <dl>
            <template
              v-for="pair in confirmationPairs"
              :key="pair.label"
            >
              <dt>{{ pair.label }}</dt><dd>{{ pair.value }}</dd>
            </template>
          </dl>
        </div>
        <button
          id="print-confirmation-print-button"
          type="button"
          data-testid="print-confirmation-print"
          @click="onPrintConfirmation"
        >
          {{ t('desk.print.print_button', {}, 'Print') }}
        </button>
        <button
          id="print-confirmation-copy-button"
          type="button"
          data-testid="print-confirmation-copy"
          @click="onCopyConfirmation"
        >
          {{ t('desk.print.copy_button', {}, 'Copy text') }}
        </button>
        <p
          v-if="confirmationCopyStatus"
          role="status"
          data-testid="print-confirmation-copy-status"
        >
          {{ confirmationCopyStatus }}
        </p>
      </section>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import type { Ref } from 'vue';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { catalogueLocale, t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Print screen as a Vue SFC (Refs #297, ADR-0003).
// Behavioural port of the inline script in `frontend/print.html`
// (Screen 5: open the folio with GetFolioBalance so the screen shows
// what the paper must match, ProduceInvoice for the invoice,
// ProduceReceipt for one receipt per recorded payment, and
// ProduceConfirmation for the booking confirmation). The legacy page
// is untouched and stays served in parallel; this view runs under
// `/app/` (`/app/print`).
//
// Shared-migration contracts, same as the desk, book, stay, and
// folio screens:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as the legacy `messages.js` helper in the page.
// - Errors switch on envelope codes, never on resolved wording.
// - Each document section prints alone: its Print button marks the
//   section active and calls window.print, and the print CSS hides
//   everything outside the active document without ever hiding its
//   ancestors (port of `frontend/print.html:8-25`).
// - Copy buttons resolve the same text the legacy page copies from
//   the document body, written through `navigator.clipboard` with
//   the hand-copy fallback on clipboard-less terminals.
// - Escaping needs no manual port: every value renders through Vue
//   `{{ }}` interpolation, which escapes markup by construction
//   (the legacy helper in `frontend/print.html` mis-keyed `<`/`>`
//   per #276; interpolation cannot regress that way).

interface ChargeLine {
  itemKind: string;
  itemName: string;
  amountMinor: number;
  taxMinor?: number;
  feeMinor?: number;
  postedAt: string;
}

interface PaymentLine {
  method: string;
  amountMinor: number;
  paidAt: string;
  paymentId?: string;
  id?: string;
}

interface Folio {
  folioId: string;
  stayId: string;
  balanceMinor: number;
  charges?: unknown[];
  payments?: unknown[];
}

interface Invoice {
  invoiceId: string;
  folioId: string;
  stayId: string;
  producedAt: string;
  balanceMinor: number;
  charges?: unknown[];
  payments?: unknown[];
}

interface Receipt {
  receiptId: string;
  paymentId: string;
  folioId: string;
  stayId: string;
  method: string;
  amountMinor: number;
  paidAt: string;
}

interface Confirmation {
  reservationRef: string;
  hotel?: { name?: string };
  guest?: { fullName?: string };
  dates?: { checkIn?: string; checkOut?: string };
  type?: string;
  price?: { amountMinor?: number; currency?: string };
}

interface EntryRow {
  at: string;
  item: string;
  amount: string;
  balance: string;
}

interface DocumentPair {
  label: string;
  value: string;
}

interface ReceiptPayment {
  key: string;
  label: string;
  paymentId: string | null;
}

function plainAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

// Same rendering as the legacy `formatMoney` helper in the page:
// the active catalogue locale drives the grouping, and `en`
// prefixes the currency code while other locales suffix it.
function formatMoney(minor: number, currencyCode: string): string {
  const tag = catalogueLocale();
  const amount = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return tag.toLowerCase() === 'en' ? `${currencyCode} ${amount}` : `${amount} ${currencyCode}`;
}

function isCharge(line: unknown): line is ChargeLine {
  if (typeof line !== 'object' || line === null) {
    return false;
  }
  const candidate = line as Record<string, unknown>;
  return (
    typeof candidate.itemKind === 'string' &&
    typeof candidate.itemName === 'string' &&
    typeof candidate.amountMinor === 'number' &&
    typeof candidate.postedAt === 'string'
  );
}

function isPayment(line: unknown): line is PaymentLine {
  if (typeof line !== 'object' || line === null) {
    return false;
  }
  const candidate = line as Record<string, unknown>;
  return (
    typeof candidate.method === 'string' &&
    typeof candidate.amountMinor === 'number' &&
    typeof candidate.paidAt === 'string' &&
    candidate.itemKind === undefined
  );
}

function chargeTotal(line: ChargeLine): number {
  return line.amountMinor + (line.taxMinor ?? 0) + (line.feeMinor ?? 0);
}

function chargeItemText(line: ChargeLine): string {
  const extras: string[] = [];
  if (line.taxMinor) {
    extras.push(`tax ${plainAmount(line.taxMinor)}`);
  }
  if (line.feeMinor) {
    extras.push(`fee ${plainAmount(line.feeMinor)}`);
  }
  return extras.length > 0 ? `${line.itemName} (${extras.join(', ')})` : line.itemName;
}

function rawLineText(line: unknown): string {
  return t(
    'desk.folio.raw_line',
    { raw: JSON.stringify(line) },
    `Unrecognised line: ${JSON.stringify(line)}.`,
  );
}

function paymentIdOf(line: PaymentLine): string | null {
  if (typeof line.paymentId === 'string' && line.paymentId) {
    return line.paymentId;
  }
  if (typeof line.id === 'string' && line.id) {
    return line.id;
  }
  return null;
}

interface LedgerEntry {
  at: string;
  item: string;
  delta?: number;
}

function ledgerEntries(source: { charges?: unknown[]; payments?: unknown[] }): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  (source.charges ?? []).forEach((line: unknown) => {
    if (isCharge(line)) {
      entries.push({ at: line.postedAt, item: chargeItemText(line), delta: chargeTotal(line) });
    } else {
      entries.push({ at: '', item: rawLineText(line) });
    }
  });
  (source.payments ?? []).forEach((line: unknown) => {
    if (isPayment(line)) {
      entries.push({ at: line.paidAt, item: `${line.method} payment`, delta: -line.amountMinor });
    } else {
      entries.push({ at: '', item: rawLineText(line) });
    }
  });
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return entries;
}

function entriesToRows(entries: LedgerEntry[]): EntryRow[] {
  let running = 0;
  return entries.map((entry) => {
    if (entry.delta === undefined) {
      return { at: '', item: entry.item, amount: '', balance: '' };
    }
    running += entry.delta;
    return {
      at: entry.at,
      item: entry.item,
      amount: plainAmount(entry.delta),
      balance: plainAmount(running),
    };
  });
}

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}

// Template-ref element type without naming the DOM global (the
// lint config carries no browser globals): the constructor lives
// on `globalThis`, which is a defined value.
type PrintSection = InstanceType<typeof globalThis.HTMLElement>;

function prefillParam(name: string): string {
  try {
    return new globalThis.URLSearchParams(globalThis.location?.search ?? '').get(name) ?? '';
  } catch {
    return '';
  }
}

function pairsText(pairs: DocumentPair[], rows: EntryRow[]): string {
  const lines = pairs.map((pair) => `${pair.label}: ${pair.value}`);
  for (const row of rows) {
    lines.push([row.at, row.item, row.amount, row.balance].filter((cell) => cell !== '').join(' '));
  }
  return lines.join('\n');
}

export default defineComponent({
  name: 'PrintView',
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');

    const stayId = ref(prefillParam('stayId'));
    const folio = ref<Folio | null>(null);
    const currentFolioId = ref<string | null>(null);
    const folioStatus = ref('');
    const openError = ref('');
    const opening = ref(false);

    const invoicePairs = ref<DocumentPair[] | null>(null);
    const invoiceEntryRows = ref<EntryRow[]>([]);
    const invoiceError = ref('');
    const invoicing = ref(false);
    const invoiceCopyStatus = ref('');
    const invoiceDoc: Ref<PrintSection | null> = ref(null);

    const receiptPayments = ref<ReceiptPayment[]>([]);
    const receiptStatus = ref('');
    const receiptError = ref('');
    const receipting = ref(false);
    const receiptPairs = ref<DocumentPair[] | null>(null);
    const receiptCopyStatus = ref('');
    const receiptDoc: Ref<PrintSection | null> = ref(null);

    const reservationRef = ref(prefillParam('reservationRef'));
    const confirmationPairs = ref<DocumentPair[] | null>(null);
    const loadError = ref('');
    const loading = ref(false);
    const confirmationCopyStatus = ref('');
    const confirmationDoc: Ref<PrintSection | null> = ref(null);

    const entryRows = computed<EntryRow[]>(() => {
      const current = folio.value;
      if (!current) {
        return [];
      }
      return entriesToRows(ledgerEntries(current));
    });

    const invoiceButtonDisabled = computed<boolean>(
      () => currentFolioId.value === null || invoicing.value,
    );

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
      folio.value = null;
      currentFolioId.value = null;
    }

    function refuseSession(): void {
      signOutLocal();
      signInError.value = t(
        'desk.today.session_expired',
        {},
        'Session expired. Sign in again.',
      );
    }

    function renderFolio(next: Folio): void {
      folio.value = next;
      currentFolioId.value = next.folioId;
      folioStatus.value = t(
        'desk.folio.folio_line',
        { folioId: next.folioId, balance: plainAmount(next.balanceMinor) },
        `Folio ${next.folioId}: balance ${plainAmount(next.balanceMinor)}.`,
      );
      receiptPayments.value = (next.payments ?? []).map((line: unknown, index: number) => {
        if (!isPayment(line)) {
          return { key: `raw-${index}`, label: rawLineText(line), paymentId: null };
        }
        const id = paymentIdOf(line);
        if (id === null) {
          return { key: `raw-${index}`, label: rawLineText(line), paymentId: null };
        }
        return {
          key: id,
          label: `${line.method} payment: ${plainAmount(line.amountMinor)} at ${line.paidAt} `,
          paymentId: id,
        };
      });
    }

    function renderInvoice(invoice: Invoice): void {
      invoiceEntryRows.value = entriesToRows(ledgerEntries(invoice));
      invoicePairs.value = [
        { label: 'invoice', value: invoice.invoiceId },
        { label: 'folio', value: invoice.folioId },
        { label: 'stay', value: invoice.stayId },
        { label: 'produced at', value: invoice.producedAt },
        { label: 'balance', value: plainAmount(invoice.balanceMinor) },
      ];
      folioStatus.value = t(
        'desk.print.invoice_line',
        {
          invoiceId: invoice.invoiceId,
          folioId: invoice.folioId,
          balance: plainAmount(invoice.balanceMinor),
        },
        `Invoice ${invoice.invoiceId} for folio ${invoice.folioId}: balance ${plainAmount(invoice.balanceMinor)}.`,
      );
    }

    function renderReceipt(receipt: Receipt): void {
      receiptPairs.value = [
        { label: 'receipt', value: receipt.receiptId },
        { label: 'payment', value: receipt.paymentId },
        { label: 'folio', value: receipt.folioId },
        { label: 'stay', value: receipt.stayId },
        { label: 'method', value: receipt.method },
        { label: 'amount', value: plainAmount(receipt.amountMinor) },
        { label: 'paid at', value: receipt.paidAt },
      ];
      receiptStatus.value = t(
        'desk.print.receipt_line',
        {
          receiptId: receipt.receiptId,
          method: receipt.method,
          amount: plainAmount(receipt.amountMinor),
          paidAt: receipt.paidAt,
        },
        `Receipt ${receipt.receiptId}: ${receipt.method} payment of ${plainAmount(receipt.amountMinor)} on ${receipt.paidAt}.`,
      );
    }

    function renderConfirmation(confirmation: Confirmation): void {
      const price = confirmation.price ?? {};
      const money =
        price.amountMinor !== undefined && price.currency !== undefined
          ? formatMoney(price.amountMinor, price.currency)
          : plainAmount(price.amountMinor ?? 0);
      confirmationPairs.value = [
        { label: 'hotel', value: confirmation.hotel?.name ?? '' },
        { label: 'guest', value: confirmation.guest?.fullName ?? '' },
        { label: 'reference', value: confirmation.reservationRef },
        { label: 'check-in', value: confirmation.dates?.checkIn ?? '' },
        { label: 'check-out', value: confirmation.dates?.checkOut ?? '' },
        { label: 'type', value: confirmation.type ?? '' },
        { label: 'price', value: money },
      ];
    }

    // Marks one document section active and prints it alone: the
    // print CSS hides everything outside the active document without
    // ever hiding its ancestors (legacy parity). The class applies
    // synchronously before `print()` (legacy parity: the dialog
    // must see the active section), with `afterprint` plus a
    // zero-delay cleanup for dialogs that skip the event.
    function printDocument(el: PrintSection | null): void {
      if (el === null) {
        globalThis.print();
        return;
      }
      el.classList.add('active');
      const done = (): void => {
        el.classList.remove('active');
        globalThis.removeEventListener('afterprint', done);
      };
      globalThis.addEventListener('afterprint', done);
      globalThis.print();
      globalThis.setTimeout(() => {
        el.classList.remove('active');
      }, 0);
    }

    async function copyPairs(
      pairs: DocumentPair[] | null,
      rows: EntryRow[],
      setStatus: (value: string) => void,
    ): Promise<void> {
      const text = pairsText(pairs ?? [], rows);
      const done = (): void => {
        setStatus(t('desk.print.copied', {}, 'Copied.'));
      };
      const failed = (): void => {
        setStatus(
          t('desk.print.copy_failed', {}, 'Copy failed. Select the text by hand.'),
        );
      };
      try {
        const clipboard =
          typeof globalThis.navigator === 'undefined'
            ? undefined
            : globalThis.navigator.clipboard;
        if (clipboard?.writeText === undefined) {
          failed();
          return;
        }
        await clipboard.writeText(text);
        done();
      } catch {
        failed();
      }
    }

    async function onSignIn(): Promise<void> {
      signInError.value = '';
      try {
        const payload = await apiFetch<{ token: string; displayName: string; role: string }>(
          '/v1/admin/SignIn',
          {
            method: 'POST',
            body: JSON.stringify({ signinIdentity: identity.value, secret: secret.value }),
          },
        );
        session.signIn(payload.token);
        displayName.value = payload.displayName;
        role.value = payload.role;
      } catch (err) {
        signInError.value = errorMessage(err);
      }
    }

    async function onSignOut(): Promise<void> {
      try {
        await apiFetch<unknown>('/v1/admin/SignOut', { method: 'POST', body: '{}' });
      } catch {
        // A dead token signs out locally all the same (legacy parity).
      }
      signOutLocal();
    }

    async function onOpen(): Promise<void> {
      if (opening.value) {
        return;
      }
      const id = stayId.value.trim();
      if (!id) {
        folioStatus.value = t('desk.print.need_stay', {}, 'Enter a stay ID first.');
        return;
      }
      opening.value = true;
      openError.value = '';
      try {
        renderFolio(
          await apiFetch<Folio>('/v1/billing/GetFolioBalance', {
            method: 'POST',
            body: JSON.stringify({ stayId: id, actor: displayName.value }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        openError.value = errorMessage(err);
      } finally {
        opening.value = false;
      }
    }

    function onStayIdInput(): void {
      currentFolioId.value = null;
      folio.value = null;
      folioStatus.value = '';
      openError.value = '';
      invoicePairs.value = null;
      invoiceEntryRows.value = [];
    }

    async function onShowInvoice(): Promise<void> {
      if (invoicing.value || currentFolioId.value === null) {
        return;
      }
      invoicing.value = true;
      invoiceError.value = '';
      try {
        renderInvoice(
          await apiFetch<Invoice>('/v1/billing/ProduceInvoice', {
            method: 'POST',
            body: JSON.stringify({ folioId: currentFolioId.value, actor: displayName.value }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        invoiceError.value = errorMessage(err);
      } finally {
        invoicing.value = false;
      }
    }

    async function onShowReceipt(paymentId: string): Promise<void> {
      if (receipting.value) {
        return;
      }
      receipting.value = true;
      receiptError.value = '';
      try {
        renderReceipt(
          await apiFetch<Receipt>('/v1/billing/ProduceReceipt', {
            method: 'POST',
            body: JSON.stringify({ paymentId, actor: displayName.value }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        receiptError.value = errorMessage(err);
      } finally {
        receipting.value = false;
      }
    }

    async function onLoad(): Promise<void> {
      if (loading.value) {
        return;
      }
      const refValue = reservationRef.value.trim();
      if (!refValue) {
        loadError.value = t('desk.print.need_ref', {}, 'Enter a booking reference first.');
        return;
      }
      loading.value = true;
      loadError.value = '';
      try {
        renderConfirmation(
          await apiFetch<Confirmation>('/v1/guests/ProduceConfirmation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        loadError.value = errorMessage(err);
      } finally {
        loading.value = false;
      }
    }

    function onPrintInvoice(): void {
      printDocument(invoiceDoc.value);
    }

    function onPrintReceipt(): void {
      printDocument(receiptDoc.value);
    }

    function onPrintConfirmation(): void {
      printDocument(confirmationDoc.value);
    }

    async function onCopyInvoice(): Promise<void> {
      await copyPairs(invoicePairs.value, invoiceEntryRows.value, (value) => {
        invoiceCopyStatus.value = value;
      });
    }

    async function onCopyReceipt(): Promise<void> {
      await copyPairs(receiptPairs.value, [], (value) => {
        receiptCopyStatus.value = value;
      });
    }

    async function onCopyConfirmation(): Promise<void> {
      await copyPairs(confirmationPairs.value, [], (value) => {
        confirmationCopyStatus.value = value;
      });
    }

    return {
      t,
      session,
      identity,
      secret,
      signInError,
      displayName,
      role,
      stayId,
      folioStatus,
      openError,
      opening,
      entryRows,
      invoiceButtonDisabled,
      invoicePairs,
      invoiceEntryRows,
      invoiceError,
      invoicing,
      invoiceCopyStatus,
      invoiceDoc,
      receiptPayments,
      receiptStatus,
      receiptError,
      receipting,
      receiptPairs,
      receiptCopyStatus,
      receiptDoc,
      reservationRef,
      confirmationPairs,
      loadError,
      loading,
      confirmationCopyStatus,
      confirmationDoc,
      onSignIn,
      onSignOut,
      onOpen,
      onStayIdInput,
      onShowInvoice,
      onShowReceipt,
      onLoad,
      onPrintInvoice,
      onPrintReceipt,
      onPrintConfirmation,
      onCopyInvoice,
      onCopyReceipt,
      onCopyConfirmation,
    };
  },
});
</script>

<style scoped>
/* Print isolation (Refs #297, ADR-0003): port of the `@media print`
   rules in `frontend/print.html:8-25` — staff Print yields one
   document alone (invoice, receipt, or confirmation), hiding the
   header, nav, sign-in form, folio table, and every non-active
   document, without ever hiding the active document's ancestors.
   Scoped to this view so no other screen is affected. */
@media print {
  [data-testid='print-view'] > :not([data-testid='print-main']) {
    display: none;
  }
  [data-testid='print-main'] > :not(.print-document) {
    display: none;
  }
  [data-testid='print-main'] > .print-document:not(.active) {
    display: none;
  }
  [data-testid='print-main'],
  [data-testid='print-main'] > .print-document.active {
    display: block;
  }
  [data-testid='print-main'] > .print-document.active button {
    display: none;
  }
}
</style>
