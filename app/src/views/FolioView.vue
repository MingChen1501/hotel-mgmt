<template>
  <main data-testid="folio-view">
    <h1>{{ t('desk.folio.title', {}, 'Folio: charges, payments, and balance') }}</h1>
    <p>{{ t('desk.folio.intro', {}, 'Open a stay folio, post charges, record payments, and watch the running balance.') }}</p>
    <noscript><p>This page needs JavaScript to open a folio.</p></noscript>

    <section data-testid="folio-main">
      <h2>{{ t('desk.folio.open_heading', {}, 'Open a stay folio') }}</h2>
      <div>
        <label for="folio-stay-id">
          {{ t('desk.folio.stay_id', {}, 'Stay ID: ') }}
          <InputText
            id="folio-stay-id"
            v-model="stayId"
            name="folio-stay-id"
            autocomplete="off"
            data-testid="folio-stay-id"
            @update:model-value="onStayIdInput"
          />
        </label>
        <Button
          id="folio-open-button"
          type="button"
          :label="t('desk.folio.open_button', {}, 'Open folio')"
          data-testid="folio-open"
          :disabled="opening"
          @click="onOpen"
        />
        <p
          v-if="opening"
          data-testid="folio-opening"
        >
          {{ t('desk.folio.opening', {}, 'Opening the folio…') }}
        </p>
        <Message
          v-if="openError"
          severity="error"
          role="alert"
          data-testid="folio-open-error"
        >
          {{ openError }}
        </Message>
      </div>

      <h2>{{ t('desk.folio.folio_heading', {}, 'Folio lines and running balance') }}</h2>
      <p
        role="status"
        data-testid="folio-status"
      >
        {{ folioStatus }}
      </p>
      <DataTable
        id="folio-table"
        :value="entryRows"
        data-testid="folio-table"
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

      <h2>{{ t('desk.folio.charge_heading', {}, 'Post a charge') }}</h2>
      <div>
        <label for="folio-charge-kind">
          <span>{{ t('desk.folio.item_kind', {}, 'Charge kind: ') }}</span>
          <select
            id="folio-charge-kind"
            v-model="chargeKind"
            data-testid="folio-charge-kind"
          >
            <option value="nightly-room-charge">
              {{ t('desk.folio.kind_room', {}, 'Room charge') }}
            </option>
            <option value="charge-item">
              {{ t('desk.folio.kind_extra', {}, 'Hotel extra (breakfast, parking, minibar)') }}
            </option>
          </select>
        </label>
        <label for="folio-charge-name">
          {{ t('desk.folio.item_name', {}, 'Item name: ') }}
          <InputText
            id="folio-charge-name"
            v-model="chargeName"
            name="charge-name"
            autocomplete="off"
            data-testid="folio-charge-name"
          />
        </label>
        <label for="folio-charge-amount">
          {{ t('desk.folio.amount_label', {}, 'Amount: ') }}
          <InputText
            id="folio-charge-amount"
            v-model="chargeAmount"
            name="charge-amount"
            inputmode="decimal"
            autocomplete="off"
            data-testid="folio-charge-amount"
          />
        </label>
        <Button
          id="folio-charge-button"
          type="button"
          :label="t('desk.folio.charge_button', {}, 'Post charge')"
          data-testid="folio-charge"
          :disabled="charging"
          @click="onCharge"
        />
        <p
          v-if="charging"
          data-testid="folio-charging"
        >
          {{ t('desk.folio.charging', {}, 'Posting the charge…') }}
        </p>
        <p
          role="status"
          data-testid="folio-charge-status"
        >
          {{ chargeStatus }}
        </p>
        <Message
          v-if="chargeError"
          severity="error"
          role="alert"
          data-testid="folio-charge-error"
        >
          {{ chargeError }}
        </Message>
      </div>

      <h2>{{ t('desk.folio.payment_heading', {}, 'Record a payment') }}</h2>
      <div>
        <label for="folio-payment-method">
          <span>{{ t('desk.folio.method_label', {}, 'Method: ') }}</span>
          <select
            id="folio-payment-method"
            v-model="paymentMethod"
            data-testid="folio-payment-method"
          >
            <option value="cash">
              cash
            </option>
            <option value="card">
              card
            </option>
          </select>
        </label>
        <label for="folio-payment-amount">
          {{ t('desk.folio.amount_label', {}, 'Amount: ') }}
          <InputText
            id="folio-payment-amount"
            v-model="paymentAmount"
            name="payment-amount"
            inputmode="decimal"
            autocomplete="off"
            data-testid="folio-payment-amount"
          />
        </label>
        <Button
          id="folio-pay-button"
          type="button"
          :label="t('desk.folio.pay_button', {}, 'Record payment')"
          data-testid="folio-pay"
          :disabled="paying"
          @click="onPay"
        />
        <p
          v-if="paying"
          data-testid="folio-paying"
        >
          {{ t('desk.folio.paying', {}, 'Recording the payment…') }}
        </p>
        <p
          role="status"
          data-testid="folio-payment-status"
        >
          {{ paymentStatus }}
        </p>
        <Message
          v-if="paymentError"
          severity="error"
          role="alert"
          data-testid="folio-payment-error"
        >
          {{ paymentError }}
        </Message>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Folio screen as Vue SFCs (Refs #296, ADR-0003).
// Behavioural port of the inline script in `frontend/folio.html`
// (Screen 4: open the single folio per stay with GetFolioBalance,
// post room charges and hotel-defined extras with PostCharge, and
// record cash/card payments with RecordPayment, with the running
// balance always re-read from the server so the screen agrees with
// what the guest owes). The legacy page is untouched and stays
// served in parallel; this view runs under `/app/` (`/app/folio`).
//
// Shared-migration contracts, same as the desk, book, and stay
// screens:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as the legacy `messages.js` helper in the page.
// - Errors switch on envelope codes, never on resolved wording.
// - Every mutating click carries an in-flight guard plus a
//   client-generated idempotencyKey (PostCharge, RecordPayment).

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
}

interface Folio {
  folioId: string;
  stayId: string;
  balanceMinor: number;
  charges?: unknown[];
  payments?: unknown[];
}

interface EntryRow {
  at: string;
  item: string;
  amount: string;
  balance: string;
}

function plainAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

function parseMinor(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const major = Number(trimmed);
  if (!Number.isFinite(major)) {
    return null;
  }
  return Math.round(major * 100);
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

// The undefined-item refusal names the item through the envelope
// details (Refs #338, FR-DSP-3): details drive the wording, never
// the resolved server text.
function unknownItemName(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return '';
  }
  const details = (err as ApiError).details as { itemName?: unknown } | null | undefined;
  return typeof details?.itemName === 'string' ? details.itemName : '';
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

function newIdempotencyKey(): string {
  try {
    const randomId = globalThis.crypto?.randomUUID?.();
    if (typeof randomId === 'string' && randomId.length > 0) {
      return randomId;
    }
  } catch {
    // Below: non-crypto fallback, same as the legacy page.
  }
  return `${String(Date.now())}-${String(Math.random()).slice(2)}`;
}

function prefilledStayId(): string {
  try {
    const search = globalThis.location?.search ?? '';
    return new globalThis.URLSearchParams(search).get('stayId') ?? '';
  } catch {
    return '';
  }
}

export default defineComponent({
  name: 'FolioView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Column, DataTable, InputText, Message },
  setup() {
    const session = useSessionStore();
    const stayId = ref(prefilledStayId());
    const folio = ref<Folio | null>(null);
    const folioStatus = ref('');
    const openError = ref('');
    const opening = ref(false);

    const chargeKind = ref('nightly-room-charge');
    const chargeName = ref('');
    const chargeAmount = ref('');
    const chargeStatus = ref('');
    const chargeError = ref('');
    const charging = ref(false);

    const paymentMethod = ref('cash');
    const paymentAmount = ref('');
    const paymentStatus = ref('');
    const paymentError = ref('');
    const paying = ref(false);

    const entryRows = computed<EntryRow[]>(() => {
      const current = folio.value;
      if (!current) {
        return [];
      }
      const entries: { at: string; item: string; delta?: number }[] = [];
      (current.charges ?? []).forEach((line: unknown) => {
        if (isCharge(line)) {
          entries.push({ at: line.postedAt, item: chargeItemText(line), delta: chargeTotal(line) });
        } else {
          entries.push({ at: '', item: rawLineText(line) });
        }
      });
      (current.payments ?? []).forEach((line: unknown) => {
        if (isPayment(line)) {
          entries.push({ at: line.paidAt, item: `${line.method} payment`, delta: -line.amountMinor });
        } else {
          entries.push({ at: '', item: rawLineText(line) });
        }
      });
      entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
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
    });

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      folio.value = null;
      session.expireSession();
    }

    function renderFolio(next: Folio): void {
      folio.value = next;
      folioStatus.value = t(
        'desk.folio.folio_line',
        { folioId: next.folioId, balance: plainAmount(next.balanceMinor) },
        `Folio ${next.folioId}: balance ${plainAmount(next.balanceMinor)}.`,
      );
    }

    async function readFolio(id: string): Promise<void> {
      const next = await apiFetch<Folio>('/v1/billing/GetFolioBalance', {
        method: 'POST',
        body: JSON.stringify({ stayId: id, actor: session.displayName ?? '' }),
      });
      renderFolio(next);
    }

    function onStayIdInput(): void {
      folio.value = null;
      folioStatus.value = '';
      openError.value = '';
    }

    async function onOpen(): Promise<void> {
      if (opening.value) {
        return;
      }
      const id = stayId.value.trim();
      if (!id) {
        folioStatus.value = t('desk.folio.need_stay', {}, 'Enter a stay ID first.');
        return;
      }
      opening.value = true;
      openError.value = '';
      try {
        await readFolio(id);
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        openError.value = errorMessage();
      } finally {
        opening.value = false;
      }
    }

    async function onCharge(): Promise<void> {
      if (charging.value) {
        return;
      }
      chargeError.value = '';
      const id = stayId.value.trim();
      if (!id) {
        chargeStatus.value = t('desk.folio.need_stay', {}, 'Enter a stay ID first.');
        return;
      }
      const itemName = chargeName.value.trim();
      const amountMinor = parseMinor(chargeAmount.value);
      if (!itemName || amountMinor === null || amountMinor < 0) {
        chargeStatus.value = t(
          'desk.folio.need_charge',
          {},
          'Enter the item name and a non-negative amount first.',
        );
        return;
      }
      charging.value = true;
      try {
        const posted = await apiFetch<ChargeLine>('/v1/billing/PostCharge', {
          method: 'POST',
          body: JSON.stringify({
            stayId: id,
            itemKind: chargeKind.value,
            itemName,
            amountMinor,
            actor: session.displayName ?? '',
            idempotencyKey: newIdempotencyKey(),
          }),
        });
        chargeStatus.value = t(
          'desk.folio.charged',
          {
            itemName: posted.itemName,
            amount: plainAmount(chargeTotal(posted)),
            postedAt: posted.postedAt,
          },
          `Posted ${posted.itemName}: ${plainAmount(chargeTotal(posted))} at ${posted.postedAt}.`,
        );
        chargeName.value = '';
        chargeAmount.value = '';
        await readFolio(id);
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'VALIDATION_FAILED' && unknownItemName(err) !== '') {
          chargeError.value = t(
            'desk.folio.refused_unknown_item',
            { itemName: unknownItemName(err) },
            `That extra is not on the hotel list: ${unknownItemName(err)}. Check the name, or ask the manager to add it.`,
          );
          return;
        }
        chargeError.value = errorMessage();
      } finally {
        charging.value = false;
      }
    }

    async function onPay(): Promise<void> {
      if (paying.value) {
        return;
      }
      paymentError.value = '';
      const id = stayId.value.trim();
      if (!id) {
        paymentStatus.value = t('desk.folio.need_stay', {}, 'Enter a stay ID first.');
        return;
      }
      const amountMinor = parseMinor(paymentAmount.value);
      if (amountMinor === null || amountMinor <= 0) {
        paymentStatus.value = t(
          'desk.folio.need_payment',
          {},
          'Enter a positive amount first.',
        );
        return;
      }
      paying.value = true;
      try {
        const recorded = await apiFetch<PaymentLine>('/v1/billing/RecordPayment', {
          method: 'POST',
          body: JSON.stringify({
            stayId: id,
            method: paymentMethod.value,
            amountMinor,
            actor: session.displayName ?? '',
            idempotencyKey: newIdempotencyKey(),
          }),
        });
        paymentStatus.value = t(
          'desk.folio.paid',
          {
            method: recorded.method,
            amount: plainAmount(recorded.amountMinor),
            paidAt: recorded.paidAt,
          },
          `Recorded ${recorded.method} payment: ${plainAmount(recorded.amountMinor)} at ${recorded.paidAt}.`,
        );
        paymentAmount.value = '';
        await readFolio(id);
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        paymentError.value = errorMessage();
      } finally {
        paying.value = false;
      }
    }

    return {
      t,
      stayId,
      folioStatus,
      openError,
      opening,
      entryRows,
      chargeKind,
      chargeName,
      chargeAmount,
      chargeStatus,
      chargeError,
      charging,
      paymentMethod,
      paymentAmount,
      paymentStatus,
      paymentError,
      paying,
      onStayIdInput,
      onOpen,
      onCharge,
      onPay,
    };
  },
});
</script>
