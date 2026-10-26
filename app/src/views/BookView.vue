<template>
  <main data-testid="book-view">
    <h1>{{ t('desk.book.title', {}, 'Hotel Management — Desk Booking') }}</h1>
    <p>
      <a href="/app/">{{ t('desk.book.back', {}, 'Back to the desk entry') }}</a> ·
      <a href="/app/">{{ t('desk.book.today_link', {}, "Today's arrivals, in-house, and departures") }}</a>
    </p>
    <noscript><p>This page needs JavaScript to sign in, quote a price, and book.</p></noscript>

    <section
      v-if="!session.isSignedIn"
      data-testid="book-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="book-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="book-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="book-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="book-signin-identity"
          >
        </label>
        <label for="book-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="book-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="book-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="book-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="book-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="book-booking"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="book-whoami">{{ displayName }}</strong>
        (<span data-testid="book-myrole">{{ role }}</span>).
        <button
          id="book-signout-button"
          type="button"
          data-testid="book-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>

      <h2>{{ t('desk.book.form_heading', {}, 'New booking') }}</h2>
      <form @submit.prevent="">
        <fieldset>
          <legend>{{ t('desk.book.guest_heading', {}, 'Guest') }}</legend>
          <p>{{ t('desk.book.guest_note', {}, 'Find a returning guest by name, enter a known guest ID, or register a walk-in guest by name.') }}</p>
          <p>{{ t('desk.book.actor_note', {}, 'Walk-in registrations are recorded under your sign-in name.') }}</p>
          <label for="book-guest-name">
            {{ t('desk.book.guest_name', {}, 'Guest name: ') }}
            <input
              id="book-guest-name"
              v-model="guestName"
              name="guest-name"
              autocomplete="off"
              data-testid="book-guest-name"
            >
          </label>
          <button
            id="book-find-guest-button"
            type="button"
            data-testid="book-find-guest"
            @click="onFindGuest"
          >
            {{ t('desk.book.find_button', {}, 'Find guest') }}
          </button>
          <button
            id="book-register-guest-button"
            type="button"
            data-testid="book-register-guest"
            @click="onRegisterGuest"
          >
            {{ t('desk.book.register_button', {}, 'Register walk-in guest') }}
          </button>
          <br>
          <label for="book-guest-id">
            {{ t('desk.book.guest_id', {}, 'Guest ID: ') }}
            <input
              id="book-guest-id"
              v-model="guestId"
              name="guest-id"
              autocomplete="off"
              data-testid="book-guest-id"
            >
          </label>
          <p
            role="status"
            data-testid="book-guest-status"
          >
            {{ guestStatus }}
          </p>
        </fieldset>

        <fieldset>
          <legend>{{ t('desk.book.stay_heading', {}, 'Stay') }}</legend>
          <label for="book-arrival-date">
            {{ t('desk.book.arrival', {}, 'Arrival date: ') }}
            <input
              id="book-arrival-date"
              v-model="arrivalDate"
              name="arrival-date"
              type="date"
              data-testid="book-arrival-date"
              @input="onStayInput"
            >
          </label>
          <label for="book-departure-date">
            {{ t('desk.book.departure', {}, 'Departure date: ') }}
            <input
              id="book-departure-date"
              v-model="departureDate"
              name="departure-date"
              type="date"
              data-testid="book-departure-date"
              @input="onStayInput"
            >
          </label>
          <br>
          <label for="book-room-type-id">
            {{ t('desk.book.room_type', {}, 'Room type ID: ') }}
            <input
              id="book-room-type-id"
              v-model="roomTypeId"
              name="room-type-id"
              autocomplete="off"
              data-testid="book-room-type-id"
              @input="onStayInput"
            >
          </label>
          <br>
          <label for="book-rate-plan">
            {{ t('desk.book.rate_plan', {}, 'Rate plan (leave blank when only one prices this type): ') }}
            <input
              id="book-rate-plan"
              v-model="ratePlan"
              name="rate-plan"
              autocomplete="off"
              data-testid="book-rate-plan"
              @input="onStayInput"
            >
          </label>
          <label for="book-discount-name">
            {{ t('desk.book.discount', {}, 'Discount (optional): ') }}
            <input
              id="book-discount-name"
              v-model="discountName"
              name="discount-name"
              autocomplete="off"
              data-testid="book-discount-name"
              @input="onStayInput"
            >
          </label>
          <br>
          <button
            id="book-quote-button"
            type="button"
            data-testid="book-quote"
            @click="onQuote"
          >
            {{ t('desk.book.quote_button', {}, 'Get price') }}
          </button>
          <p
            v-if="quoteError"
            role="alert"
            data-testid="book-quote-error"
          >
            {{ quoteError }}
          </p>
        </fieldset>

        <section
          v-if="quote !== null"
          data-testid="book-quote-section"
        >
          <h3>{{ t('desk.book.quote_heading', {}, 'Quoted price') }}</h3>
          <ul data-testid="book-quote-nights">
            <li
              v-for="night in quoteNights"
              :key="night.nightDate"
            >
              {{ night.label }}
            </li>
          </ul>
          <p><strong data-testid="book-quote-total">{{ quoteTotal }}</strong></p>
          <button
            id="book-confirm-button"
            type="button"
            data-testid="book-confirm"
            :disabled="confirming"
            @click="onConfirm"
          >
            {{ t('desk.book.confirm_button', {}, 'Confirm booking') }}
          </button>
          <p
            v-if="confirmError"
            role="alert"
            data-testid="book-confirm-error"
          >
            {{ confirmError }}
          </p>
        </section>
      </form>

      <section
        v-if="booking !== null"
        data-testid="book-result"
      >
        <h2>{{ t('desk.book.result_heading', {}, 'Booking confirmed') }}</h2>
        <p><strong data-testid="book-booking-reference">{{ booking.reference }}</strong></p>
        <p data-testid="book-booking-readback">
          {{ booking.readback }}
        </p>
        <p>
          <a href="/app/">{{ t('desk.book.view_arrivals', {}, "View on today's arrivals") }}</a> ·
          <a href="/app/print">{{ t('desk.entry.print_link', {}, 'Print invoice, receipt, or confirmation') }}</a>
        </p>
        <button
          id="book-new-booking-button"
          type="button"
          data-testid="book-new-booking"
          @click="onNewBooking"
        >
          {{ t('desk.book.new_button', {}, 'New booking') }}
        </button>
      </section>

      <section
        v-if="confirmationPairs !== null || confirmationError"
        data-testid="book-confirmation"
      >
        <h2>{{ t('desk.book.confirmation_heading', {}, 'Booking confirmation') }}</h2>
        <dl
          v-if="confirmationPairs !== null"
          data-testid="book-confirmation-body"
        >
          <template
            v-for="pair in confirmationPairs"
            :key="pair.label"
          >
            <dt>{{ pair.label }}</dt><dd>{{ pair.value }}</dd>
          </template>
        </dl>
        <p
          v-else
          data-testid="book-confirmation-body"
        >
          {{ confirmationError }}
        </p>
        <button
          id="book-print-button"
          type="button"
          data-testid="book-print"
          @click="onPrint"
        >
          {{ t('desk.book.print_button', {}, 'Print') }}
        </button>
        <button
          id="book-copy-button"
          type="button"
          data-testid="book-copy"
          @click="onCopy"
        >
          {{ t('desk.book.copy_button', {}, 'Copy confirmation') }}
        </button>
        <p
          v-if="copyStatus"
          role="status"
          data-testid="book-copy-status"
        >
          {{ copyStatus }}
        </p>
      </section>
    </section>
  </main>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { catalogueLocale, t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Book screen as Vue SFCs (Refs #294, ADR-0003).
// Behavioural port of the inline script in `frontend/book.html`
// (quote the price before anything is booked, then confirm the
// reservation). The legacy page is untouched and stays served in
// parallel; this view runs under `/app/` (`/app/book`).
//
// Shared-migration contracts, same as the desk screen:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as `DeskMessages.msg` in the legacy page.
// - Errors switch on envelope codes, never on resolved wording.
// - Op order, same as the legacy page: QuotePrice (read-only
//   price), CreateReservation with sellableUnits 1 (the atomic
//   guard refuses unsellable combinations), GetReservation
//   read-back, ProduceConfirmation for the printable/shareable
//   confirmation. Returning guests resolve through IdentifyGuest;
//   genuinely new walk-ins register through UpsertGuest before
//   quoting. The quoted price is frozen into the booking as the
//   price basis; later rate changes never alter it (BR-13).

interface QuoteNight {
  nightDate: string;
  priceMinor: number;
}

interface Quote {
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  discountName: string | null;
  nights: QuoteNight[];
  totalMinor: number;
}

interface QuoteNightRow {
  nightDate: string;
  label: string;
}

interface ConfirmationPair {
  label: string;
  value: string;
}

interface BookingResult {
  reference: string;
  readback: string;
}

// Amounts arrive in minor currency units; the quote carries no
// currency code, so it renders as a plain decimal figure. The
// confirmation (which carries a currency) formats with it — same
// split as the legacy page.
function plainAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

// Same rendering as `DeskMessages.formatMoney` in the legacy page:
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}

function restrictionDetail(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return '';
  }
  const details = (err as ApiError).details as { restriction?: unknown } | null | undefined;
  const restriction = details?.restriction;
  return typeof restriction === 'string' ? restriction : '';
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

export default defineComponent({
  name: 'BookView',
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');
    const guestName = ref('');
    const guestId = ref('');
    const guestStatus = ref('');
    const arrivalDate = ref('');
    const departureDate = ref('');
    const roomTypeId = ref('');
    const ratePlan = ref('');
    const discountName = ref('');
    const quote = ref<Quote | null>(null);
    const quoteKey = ref<string | null>(null);
    const quoteNights = ref<QuoteNightRow[]>([]);
    const quoteTotal = ref('');
    const quoteError = ref('');
    const confirming = ref(false);
    const confirmError = ref('');
    const booking = ref<BookingResult | null>(null);
    const confirmationPairs = ref<ConfirmationPair[] | null>(null);
    const confirmationError = ref('');
    const copyStatus = ref('');

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
      quote.value = null;
      quoteKey.value = null;
    }

    function refuseSession(): void {
      signOutLocal();
      signInError.value = t(
        'desk.today.session_expired',
        {},
        'Session expired. Sign in again.',
      );
    }

    function clearQuote(): void {
      quote.value = null;
      quoteKey.value = null;
      quoteNights.value = [];
      quoteTotal.value = '';
      quoteError.value = '';
      confirmError.value = '';
    }

    function onStayInput(): void {
      clearQuote();
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

    async function onFindGuest(): Promise<void> {
      const name = guestName.value.trim();
      if (name === '') {
        guestStatus.value = t(
          'desk.book.guest_notfound',
          {},
          'No guest with that name. Check the name, enter the guest ID, or register a walk-in guest.',
        );
        return;
      }
      try {
        const guest = await apiFetch<{ guestId: string; fullName: string; pastStayCount: number }>(
          '/v1/guests/IdentifyGuest',
          { method: 'POST', body: JSON.stringify({ fullName: name }) },
        );
        guestId.value = guest.guestId;
        guestStatus.value = t(
          'desk.book.guest_found',
          { name: guest.fullName, stays: guest.pastStayCount },
          'Guest found: {name} ({stays} past stays).',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        if (errorCode(err) === 'NOT_FOUND') {
          guestStatus.value = t(
            'desk.book.guest_notfound',
            {},
            'No guest with that name. Check the name, enter the guest ID, or register a walk-in guest.',
          );
          return;
        }
        guestStatus.value = errorMessage(err);
      }
    }

    async function onRegisterGuest(): Promise<void> {
      const name = guestName.value.trim();
      if (name === '') {
        guestStatus.value = t(
          'desk.book.guest_notfound',
          {},
          'No guest with that name. Check the name, enter the guest ID, or register a walk-in guest.',
        );
        return;
      }
      try {
        const guest = await apiFetch<{ guestId: string; fullName: string }>(
          '/v1/guests/UpsertGuest',
          { method: 'POST', body: JSON.stringify({ fullName: name, actor: displayName.value }) },
        );
        guestId.value = guest.guestId;
        guestStatus.value = t(
          'desk.book.guest_new',
          { name: guest.fullName },
          'New guest registered: {name}.',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        guestStatus.value = errorMessage(err);
      }
    }

    async function onQuote(): Promise<void> {
      clearQuote();
      booking.value = null;
      confirmationPairs.value = null;
      confirmationError.value = '';
      const body: Record<string, string> = {
        roomTypeId: roomTypeId.value.trim(),
        arrivalDate: arrivalDate.value,
        departureDate: departureDate.value,
      };
      const plan = ratePlan.value.trim();
      if (plan !== '') {
        body.ratePlanName = plan;
      }
      const discount = discountName.value.trim();
      if (discount !== '') {
        body.discountName = discount;
      }
      try {
        const priced = await apiFetch<Quote>('/v1/rates/QuotePrice', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        quote.value = priced;
        // One key per quote: a double-clicked Confirm replays the
        // same booking instead of creating two reservations (the
        // store replays on idempotencyKey).
        quoteKey.value = newIdempotencyKey();
        quoteNights.value = (priced.nights ?? []).map((night) => ({
          nightDate: night.nightDate,
          label: t(
            'desk.book.quote_night',
            { nightDate: night.nightDate, amount: plainAmount(night.priceMinor) },
            'Night {nightDate}: {amount}',
          ),
        }));
        quoteTotal.value = t(
          'desk.book.quote_total',
          { amount: plainAmount(priced.totalMinor) },
          'Total: {amount}',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        if (errorCode(err) === 'NOT_FOUND') {
          quoteError.value = t(
            'desk.book.refused_noprice',
            {},
            'No price exists for this room type and these dates.',
          );
          return;
        }
        quoteError.value = errorMessage(err);
      }
    }

    function renderConfirmation(confirmation: {
      hotel?: { name?: string };
      guest?: { fullName?: string };
      reservationRef: string;
      dates?: { checkIn?: string; checkOut?: string };
      type?: string;
      price?: { amountMinor?: number; currency?: string };
    }): void {
      const price = confirmation.price ?? {};
      const money =
        price.amountMinor !== undefined && price.currency
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

    async function onConfirm(): Promise<void> {
      if (confirming.value) {
        return;
      }
      confirmError.value = '';
      const resolvedGuestId = guestId.value.trim();
      if (resolvedGuestId === '') {
        confirmError.value = t(
          'desk.book.guest_need',
          {},
          'Find or register the guest first.',
        );
        return;
      }
      const activeQuote = quote.value;
      if (activeQuote === null) {
        confirmError.value = t(
          'desk.book.no_quote',
          {},
          'Get a price first, then confirm.',
        );
        return;
      }
      confirming.value = true;
      try {
        const bookingBody: Record<string, unknown> = {
          roomTypeId: activeQuote.roomTypeId,
          arrivalDate: activeQuote.arrivalDate,
          departureDate: activeQuote.departureDate,
          guest: { guestId: resolvedGuestId },
          sellableUnits: 1,
          priceBasis: {
            totalMinor: activeQuote.totalMinor,
            discountName: activeQuote.discountName ?? null,
          },
        };
        if (quoteKey.value !== null) {
          bookingBody.idempotencyKey = quoteKey.value;
        }
        const created = await apiFetch<{ reservationRef: string; quotedTotal?: number }>(
          '/v1/reservations/CreateReservation',
          { method: 'POST', body: JSON.stringify(bookingBody) },
        );
        const readBack = await apiFetch<{
          reservationRef: string;
          arrivalDate: string;
          departureDate: string;
          priceBasis?: { totalMinor?: number };
        }>('/v1/reservations/GetReservation', {
          method: 'POST',
          body: JSON.stringify({ reservationRef: created.reservationRef }),
        });
        let readBackName = resolvedGuestId;
        try {
          const named = await apiFetch<{ fullName: string }>('/v1/guests/IdentifyGuest', {
            method: 'POST',
            body: JSON.stringify({ guestId: resolvedGuestId }),
          });
          readBackName = named.fullName;
        } catch {
          // The read-back still names the guest ID when lookup fails.
        }
        const quotedTotal = readBack.priceBasis?.totalMinor ?? created.quotedTotal ?? 0;
        booking.value = {
          reference: t(
            'desk.book.reference',
            { ref: readBack.reservationRef },
            'Booking reference: {ref}',
          ),
          readback: t(
            'desk.book.readback',
            {
              name: readBackName,
              arrival: readBack.arrivalDate,
              departure: readBack.departureDate,
              amount: plainAmount(quotedTotal),
            },
            '{name}, {arrival} to {departure}, total {amount}.',
          ),
        };
        try {
          const confirmation = await apiFetch<{
            hotel?: { name?: string };
            guest?: { fullName?: string };
            reservationRef: string;
            dates?: { checkIn?: string; checkOut?: string };
            type?: string;
            price?: { amountMinor?: number; currency?: string };
          }>('/v1/guests/ProduceConfirmation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: readBack.reservationRef }),
          });
          renderConfirmation(confirmation);
        } catch (confirmationErr) {
          if (isSignedOut(confirmationErr)) {
            refuseSession();
            return;
          }
          confirmationPairs.value = null;
          confirmationError.value = errorMessage(confirmationErr);
        }
        clearQuote();
      } catch (err) {
        if (isSignedOut(err)) {
          refuseSession();
          return;
        }
        if (errorCode(err) === 'CONFLICT') {
          confirmError.value = t(
            'desk.book.refused_soldout',
            {},
            'No rooms of this type are free for these dates.',
          );
          return;
        }
        if (errorCode(err) === 'STATE_ILLEGAL') {
          const restriction = restrictionDetail(err);
          if (restriction !== '') {
            confirmError.value = t(
              'desk.book.refused_restriction',
              { restriction },
              'That stay breaks a booking rule: {restriction}.',
            );
            return;
          }
        }
        confirmError.value = errorMessage(err);
      } finally {
        confirming.value = false;
      }
    }

    function onPrint(): void {
      globalThis.print();
    }

    async function onCopy(): Promise<void> {
      // The confirmation body renders as definition pairs; copy the
      // resolved text, same source the legacy page copies.
      const text = confirmationPairs.value === null
        ? confirmationError.value
        : confirmationPairs.value.map((pair) => `${pair.label}: ${pair.value}`).join('\n');
      const done = (): void => {
        copyStatus.value = t('desk.book.copied', {}, 'Confirmation copied.');
      };
      const failed = (): void => {
        copyStatus.value = t(
          'desk.book.copy_failed',
          {},
          'Copy failed. Select the confirmation text by hand.',
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

    function onNewBooking(): void {
      guestName.value = '';
      guestId.value = '';
      arrivalDate.value = '';
      departureDate.value = '';
      roomTypeId.value = '';
      ratePlan.value = '';
      discountName.value = '';
      guestStatus.value = '';
      booking.value = null;
      confirmationPairs.value = null;
      confirmationError.value = '';
      copyStatus.value = '';
      clearQuote();
    }

    return {
      t,
      session,
      identity,
      secret,
      signInError,
      displayName,
      role,
      guestName,
      guestId,
      guestStatus,
      arrivalDate,
      departureDate,
      roomTypeId,
      ratePlan,
      discountName,
      quote,
      quoteNights,
      quoteTotal,
      quoteError,
      confirming,
      confirmError,
      booking,
      confirmationPairs,
      confirmationError,
      copyStatus,
      onSignIn,
      onSignOut,
      onFindGuest,
      onRegisterGuest,
      onStayInput,
      onQuote,
      onConfirm,
      onPrint,
      onCopy,
      onNewBooking,
    };
  },
});
</script>

<style scoped>
/* Print isolation (Refs #294, ADR-0003): port of the `@media print`
   rules in `frontend/book.html:8-19` — staff Print yields a
   confirmation-only handout, hiding the header, nav, sign-in form,
   and booking form inputs. Scoped to this view so no other screen
   is affected. */
@media print {
  [data-testid='book-view'] > :not([data-testid='book-booking']) {
    display: none;
  }
  [data-testid='book-booking'] > :not([data-testid='book-confirmation']) {
    display: none;
  }
}
</style>
