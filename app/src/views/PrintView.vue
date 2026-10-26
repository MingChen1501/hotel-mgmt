<template>
  <main data-testid="print-view">
    <h1>{{ t('desk.print.title', {}, 'Print receipts, invoices, and confirmations') }}</h1>
    <p>{{ t('desk.print.intro', {}, 'Open a folio, check that the screen matches the paper, then print or copy each document.') }}</p>
    <noscript><p>This page needs JavaScript to print invoices, receipts, and confirmations.</p></noscript>

    <section data-testid="print-main">
      <h2>{{ t('desk.print.open_heading', {}, 'Open a folio for printing') }}</h2>
      <div>
        <label for="print-stay-id">
          {{ t('desk.print.stay_id', {}, 'Stay ID: ') }}
          <InputText
            id="print-stay-id"
            v-model="stayId"
            name="print-stay-id"
            autocomplete="off"
            data-testid="print-stay-id"
            @update:model-value="onStayIdInput"
          />
        </label>
        <Button
          id="print-open-button"
          type="button"
          :label="t('desk.print.open_button', {}, 'Open folio')"
          data-testid="print-open"
          :disabled="opening"
          @click="onOpen"
        />
        <p
          v-if="opening"
          data-testid="print-opening"
        >
          {{ t('desk.print.opening', {}, 'Opening the folio…') }}
        </p>
        <Message
          v-if="openError"
          severity="error"
          role="alert"
          data-testid="print-open-error"
        >
          {{ openError }}
        </Message>
      </div>

      <h2>{{ t('desk.print.folio_heading', {}, 'Folio on screen (what prints must match this)') }}</h2>
      <p
        role="status"
        data-testid="print-folio-status"
      >
        {{ folioStatus }}
      </p>
      <DataTable
        id="print-folio-table"
        :value="entryRows"
        data-testid="print-folio-table"
      >
        <Column
          field="at"
          :header="t('desk.folio.th_time', {}, 'Time')"
        />
        <Column
          field="item"
          :header="t('desk.folio.th_item', {}, 'Item')"
        />
        <Column
          field="amount"
          :header="t('desk.folio.th_amount', {}, 'Amount')"
        />
        <Column
          field="balance"
          :header="t('desk.folio.th_balance', {}, 'Running balance')"
        />
        <template #empty>
          {{ t('desk.folio.no_lines', {}, 'No charges or payments yet. Posted charges and recorded payments appear here.') }}
        </template>
      </DataTable>
      <div>
        <Button
          id="print-invoice-button"
          type="button"
          :label="t('desk.print.invoice_button', {}, 'Show invoice')"
          data-testid="print-invoice"
          :disabled="invoiceButtonDisabled"
          @click="onShowInvoice"
        />
        <Message
          v-if="invoiceError"
          severity="error"
          role="alert"
          data-testid="print-invoice-error"
        >
          {{ invoiceError }}
        </Message>
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
        <Button
          id="print-invoice-print-button"
          type="button"
          :label="t('desk.print.print_button', {}, 'Print')"
          data-testid="print-invoice-print"
          @click="onPrintInvoice"
        />
        <Button
          id="print-invoice-copy-button"
          type="button"
          :label="t('desk.print.copy_button', {}, 'Copy text')"
          data-testid="print-invoice-copy"
          @click="onCopyInvoice"
        />
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
          <Button
            v-if="payment.paymentId !== null"
            type="button"
            :label="t('desk.print.receipt_button', {}, 'Receipt')"
            data-testid="print-receipt"
            @click="onShowReceipt(payment.paymentId)"
          />
        </li>
        <li v-if="receiptPayments.length === 0">
          {{ t('desk.print.no_payments', {}, 'No payments recorded yet.') }}
        </li>
      </ul>
      <Message
        v-if="receiptError"
        severity="error"
        role="alert"
        data-testid="print-receipt-error"
      >
        {{ receiptError }}
      </Message>

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
        <Button
          id="print-receipt-print-button"
          type="button"
          :label="t('desk.print.print_button', {}, 'Print')"
          data-testid="print-receipt-print"
          @click="onPrintReceipt"
        />
        <Button
          id="print-receipt-copy-button"
          type="button"
          :label="t('desk.print.copy_button', {}, 'Copy text')"
          data-testid="print-receipt-copy"
          @click="onCopyReceipt"
        />
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
          <InputText
            id="print-ref"
            v-model="reservationRef"
            name="print-ref"
            autocomplete="off"
            data-testid="print-ref"
          />
        </label>
        <Button
          id="print-load-button"
          type="button"
          :label="t('desk.print.load_button', {}, 'Load confirmation')"
          data-testid="print-load"
          :disabled="loading"
          @click="onLoad"
        />
        <p
          v-if="loading"
          data-testid="print-loading"
        >
          {{ t('desk.print.loading_confirmation', {}, 'Loading the confirmation…') }}
        </p>
        <Message
          v-if="loadError"
          severity="error"
          role="alert"
          data-testid="print-load-error"
        >
          {{ loadError }}
        </Message>
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
        <Button
          id="print-confirmation-print-button"
          type="button"
          :label="t('desk.print.print_button', {}, 'Print')"
          data-testid="print-confirmation-print"
          @click="onPrintConfirmation"
        />
        <Button
          id="print-confirmation-copy-button"
          type="button"
          :label="t('desk.print.copy_button', {}, 'Copy text')"
          data-testid="print-confirmation-copy"
          @click="onCopyConfirmation"
        />
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
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { catalogueLocale, t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Print screen as a Vue SFC (Refs #297, ADR-0003).
// Behavioural port of the inline script in `frontend/print.html`
// (Screen 5: open the folio with GetFolioBalance so the screen shows
// what the paper must match, ProduceInvoice for the invoice,
// ProduceReceipt for one receipt per recorded payment, and the
// confirmation load: GetReservation by the entered ref,
// AttachReservation with that RES-side snapshot, then
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

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null
    ? String((err as ApiError).code ?? '')
    : '';
}

// Envelope details for the not-found refusals (Refs #365): an
// unknown folio arrives as NOT_FOUND naming the folio, an unknown
// payment as NOT_FOUND naming the payment, and a malformed stay or
// folio id as VALIDATION_FAILED naming the field. Branching stays
// on code+details, never on resolved wording.
function refusedField(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return '';
  }
  const details = (err as ApiError).details as { field?: unknown } | null | undefined;
  return typeof details?.field === 'string' ? details.field : '';
}

function refusedId(err: unknown, name: 'folioId' | 'paymentId'): string {
  if (typeof err !== 'object' || err === null) {
    return '';
  }
  const details = (err as ApiError).details as Record<string, unknown> | null | undefined;
  const value = details?.[name];
  return typeof value === 'string' ? value : '';
}

// Unexpected failures read as one plain sentence (FR-DSP-3,
// desk.shell.request_failed): call sites map known envelope codes
// to specific catalogue wordings, so this fallback never surfaces
// technical codes or statuses.
function errorMessage(): string {
  return t(
    'desk.shell.request_failed',
    {},
    'That did not work. Try again; if it keeps failing, tell the manager.',
  );
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
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Column, DataTable, InputText, Message },
  setup() {
    const session = useSessionStore();
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

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      folio.value = null;
      currentFolioId.value = null;
      session.expireSession();
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
            body: JSON.stringify({ stayId: id, actor: session.displayName ?? '' }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        // No folio for the stay: billing refuses an unknown folio
        // with NOT_FOUND and a malformed stay id with
        // VALIDATION_FAILED naming the field (Refs #365).
        if (
          errorCode(err) === 'NOT_FOUND' ||
          (errorCode(err) === 'VALIDATION_FAILED' &&
            (refusedField(err) === 'stayId' || refusedField(err) === 'folioId'))
        ) {
          openError.value = t(
            'desk.print.refused_unknown_folio',
            {},
            'No folio for that stay. Check the stay ID and try again.',
          );
          return;
        }
        openError.value = errorMessage();
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
            body: JSON.stringify({ folioId: currentFolioId.value, actor: session.displayName ?? '' }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        // An unknown folio refuses the invoice with NOT_FOUND naming
        // the folio (Refs #365).
        if (
          (errorCode(err) === 'NOT_FOUND' && refusedId(err, 'folioId') !== '') ||
          (errorCode(err) === 'VALIDATION_FAILED' && refusedField(err) === 'folioId')
        ) {
          invoiceError.value = t(
            'desk.print.refused_unknown_folio',
            {},
            'No folio for that stay. Check the stay ID and try again.',
          );
          return;
        }
        invoiceError.value = errorMessage();
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
            body: JSON.stringify({ paymentId, actor: session.displayName ?? '' }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        // An unknown payment refuses the receipt with NOT_FOUND
        // naming the payment (Refs #365).
        if (
          (errorCode(err) === 'NOT_FOUND' && refusedId(err, 'paymentId') !== '') ||
          (errorCode(err) === 'VALIDATION_FAILED' && refusedField(err) === 'paymentId')
        ) {
          receiptError.value = t(
            'desk.print.refused_unknown_payment',
            {},
            'No payment found with that ID. Open the folio again and try again.',
          );
          return;
        }
        receiptError.value = errorMessage();
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
        // Wire the confirmation end to end (issue #323): resolve
        // the human ref through the reservation read, attach that
        // RES-side snapshot for the Guests store, then produce it.
        const reservation = await apiFetch<{
          reservationRef: string;
          roomTypeId: string;
          arrivalDate: string;
          departureDate: string;
          guest?: { guestId?: string; fullName?: string };
          priceBasis?: { totalMinor?: number };
        }>('/v1/reservations/GetReservation', {
          method: 'POST',
          body: JSON.stringify({ reservationRef: refValue }),
        });
        await apiFetch('/v1/guests/AttachReservation', {
          method: 'POST',
          body: JSON.stringify({
            reservationRef: reservation.reservationRef,
            guest: {
              guestId: reservation.guest?.guestId ?? '',
              fullName: reservation.guest?.fullName ?? '',
            },
            dates: { checkIn: reservation.arrivalDate, checkOut: reservation.departureDate },
            type: reservation.roomTypeId,
            price: { amountMinor: reservation.priceBasis?.totalMinor ?? 0 },
          }),
        });
        renderConfirmation(
          await apiFetch<Confirmation>('/v1/guests/ProduceConfirmation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: reservation.reservationRef }),
          }),
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'NOT_FOUND') {
          loadError.value = t(
            'desk.print.refused_unknown_ref',
            {},
            'Unknown booking reference. Check the reference and try again.',
          );
          return;
        }
        loadError.value = errorMessage();
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
