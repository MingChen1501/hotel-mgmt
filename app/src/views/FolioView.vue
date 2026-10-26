<template>
  <main data-testid="folio-view">
    <h1>{{ t('desk.folio.title', {}, 'Hotel Management — Desk Folio') }}</h1>
    <p>
      <a href="/app/">{{ t('desk.folio.back', {}, 'Back to the desk entry') }}</a> ·
      <a href="/app/">{{ t('desk.folio.today_link', {}, "Today's arrivals, in-house, and departures") }}</a> ·
      <a href="/app/stay">{{ t('desk.folio.stay_link', {}, 'Stay check-in, move, and check-out') }}</a> ·
      <a href="/app/print">{{ t('desk.entry.print_link', {}, 'Print invoice, receipt, or confirmation') }}</a>
    </p>
    <noscript><p>This page needs JavaScript to sign in and open a folio.</p></noscript>

    <section
      v-if="!session.isSignedIn"
      data-testid="folio-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="folio-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="folio-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="folio-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="folio-signin-identity"
          >
        </label>
        <label for="folio-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="folio-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="folio-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="folio-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="folio-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="folio-main"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="folio-whoami">{{ displayName }}</strong>
        (<span data-testid="folio-myrole">{{ role }}</span>).
        <button
          id="folio-signout-button"
          type="button"
          data-testid="folio-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>

      <h2>{{ t('desk.folio.open_heading', {}, 'Open a stay folio') }}</h2>
      <div>
        <label for="folio-stay-id">
          {{ t('desk.folio.stay_id', {}, 'Stay ID: ') }}
          <input
            id="folio-stay-id"
            v-model="stayId"
            name="folio-stay-id"
            autocomplete="off"
            data-testid="folio-stay-id"
            @input="onStayIdInput"
          >
        </label>
        <button
          id="folio-open-button"
          type="button"
          data-testid="folio-open"
          :disabled="opening"
          @click="onOpen"
        >
          {{ t('desk.folio.open_button', {}, 'Open folio') }}
        </button>
        <p
          v-if="openError"
          role="alert"
          data-testid="folio-open-error"
        >
          {{ openError }}
        </p>
      </div>

      <h2>{{ t('desk.folio.folio_heading', {}, 'Folio lines and running balance') }}</h2>
      <p
        role="status"
        data-testid="folio-status"
      >
        {{ folioStatus }}
      </p>
      <table
        id="folio-table"
        data-testid="folio-table"
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
          <input
            id="folio-charge-name"
            v-model="chargeName"
            name="charge-name"
            autocomplete="off"
            data-testid="folio-charge-name"
          >
        </label>
        <label for="folio-charge-amount">
          {{ t('desk.folio.amount_label', {}, 'Amount: ') }}
          <input
            id="folio-charge-amount"
            v-model="chargeAmount"
            name="charge-amount"
            inputmode="decimal"
            autocomplete="off"
            data-testid="folio-charge-amount"
          >
        </label>
        <button
          id="folio-charge-button"
          type="button"
          data-testid="folio-charge"
          :disabled="charging"
          @click="onCharge"
        >
          {{ t('desk.folio.charge_button', {}, 'Post charge') }}
        </button>
        <p
          role="status"
          data-testid="folio-charge-status"
        >
          {{ chargeStatus }}
        </p>
        <p
          v-if="chargeError"
          role="alert"
          data-testid="folio-charge-error"
        >
          {{ chargeError }}
        </p>
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
          <input
            id="folio-payment-amount"
            v-model="paymentAmount"
            name="payment-amount"
            inputmode="decimal"
            autocomplete="off"
            data-testid="folio-payment-amount"
          >
        </label>
        <button
          id="folio-pay-button"
          type="button"
          data-testid="folio-pay"
          :disabled="paying"
          @click="onPay"
        >
          {{ t('desk.folio.pay_button', {}, 'Record payment') }}
        </button>
        <p
          role="status"
          data-testid="folio-payment-status"
        >
          {{ paymentStatus }}
        </p>
        <p
          v-if="paymentError"
          role="alert"
          data-testid="folio-payment-error"
        >
          {{ paymentError }}
        </p>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
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
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');

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

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
      folio.value = null;
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
      folioStatus.value = t(
        'desk.folio.folio_line',
        { folioId: next.folioId, balance: plainAmount(next.balanceMinor) },
        `Folio ${next.folioId}: balance ${plainAmount(next.balanceMinor)}.`,
      );
    }

    async function readFolio(id: string): Promise<void> {
      const next = await apiFetch<Folio>('/v1/billing/GetFolioBalance', {
        method: 'POST',
        body: JSON.stringify({ stayId: id, actor: displayName.value }),
      });
      renderFolio(next);
    }

    function onStayIdInput(): void {
      folio.value = null;
      folioStatus.value = '';
      openError.value = '';
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
        folioStatus.value = t('desk.folio.need_stay', {}, 'Enter a stay ID first.');
        return;
      }
      opening.value = true;
      openError.value = '';
      try {
        await readFolio(id);
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
            actor: displayName.value,
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
          refuseSession();
          return;
        }
        chargeError.value = errorMessage(err);
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
            actor: displayName.value,
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
          refuseSession();
          return;
        }
        paymentError.value = errorMessage(err);
      } finally {
        paying.value = false;
      }
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
      onSignIn,
      onSignOut,
      onOpen,
      onCharge,
      onPay,
    };
  },
});
</script>
