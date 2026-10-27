<template>
  <main data-testid="book-view">
    <h1>{{ t('desk.book.title', {}, 'Book a room') }}</h1>
    <noscript><p>This page needs JavaScript to quote a price and book.</p></noscript>

    <section data-testid="book-booking">
      <h2>{{ t('desk.book.form_heading', {}, 'New booking') }}</h2>
      <form @submit.prevent="">
        <fieldset>
          <legend>{{ t('desk.book.guest_heading', {}, 'Guest') }}</legend>
          <p>{{ t('desk.book.guest_note', {}, 'Find a returning guest by name, enter a known guest ID, or register a walk-in guest by name.') }}</p>
          <p>{{ t('desk.book.actor_note', {}, 'Walk-in registrations are recorded under your sign-in name.') }}</p>
          <label for="book-guest-name">
            {{ t('desk.book.guest_name', {}, 'Guest name: ') }}
            <InputText
              id="book-guest-name"
              v-model="guestName"
              name="guest-name"
              autocomplete="off"
              data-testid="book-guest-name"
            />
          </label>
          <Button
            id="book-find-guest-button"
            type="button"
            :label="t('desk.book.find_button', {}, 'Find guest')"
            data-testid="book-find-guest"
            @click="onFindGuest"
          />
          <Button
            id="book-register-guest-button"
            type="button"
            :label="t('desk.book.register_button', {}, 'Register walk-in guest')"
            data-testid="book-register-guest"
            @click="onRegisterGuest"
          />
          <br>
          <label for="book-guest-id">
            {{ t('desk.book.guest_id', {}, 'Guest ID: ') }}
            <InputText
              id="book-guest-id"
              v-model="guestId"
              name="guest-id"
              autocomplete="off"
              data-testid="book-guest-id"
            />
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
            {{ t('desk.book.room_type', {}, 'Room type: ') }}
            <select
              id="book-room-type-id"
              v-model="roomTypeId"
              name="room-type-id"
              data-testid="book-room-type-id"
              @change="onStayInput"
            >
              <option value="">
                {{ t('desk.book.room_type_choose', {}, 'Choose a room type…') }}
              </option>
              <option
                v-for="type in roomTypes"
                :key="type.id"
                :value="type.id"
              >
                {{ type.name }}
              </option>
            </select>
          </label>
          <p
            v-if="roomTypesLoading"
            data-testid="book-room-type-loading"
          >
            {{ t('desk.book.room_type_loading', {}, 'Loading room types…') }}
          </p>
          <p
            v-if="!roomTypesLoading && roomTypes.length === 0"
            data-testid="book-room-type-empty"
          >
            {{ t('desk.book.room_type_empty', {}, 'No room types defined yet. Ask a manager to define one first.') }}
          </p>
          <br>
          <label for="book-rate-plan">
            {{ t('desk.book.rate_plan', {}, 'Rate plan (leave blank when only one prices this type): ') }}
            <InputText
              id="book-rate-plan"
              v-model="ratePlan"
              name="rate-plan"
              autocomplete="off"
              data-testid="book-rate-plan"
              @update:model-value="onStayInput"
            />
          </label>
          <label for="book-discount-name">
            {{ t('desk.book.discount', {}, 'Discount (optional): ') }}
            <InputText
              id="book-discount-name"
              v-model="discountName"
              name="discount-name"
              autocomplete="off"
              data-testid="book-discount-name"
              @update:model-value="onStayInput"
            />
          </label>
          <br>
          <Button
            id="book-quote-button"
            type="button"
            :label="t('desk.book.quote_button', {}, 'Get price')"
            data-testid="book-quote"
            @click="onQuote"
          />
          <Message
            v-if="quoteError"
            severity="error"
            role="alert"
            data-testid="book-quote-error"
          >
            {{ quoteError }}
          </Message>
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
          <Button
            id="book-confirm-button"
            type="button"
            :label="t('desk.book.confirm_button', {}, 'Confirm booking')"
            data-testid="book-confirm"
            :disabled="confirming"
            @click="onConfirm"
          />
          <p
            v-if="confirming"
            data-testid="book-confirming"
          >
            {{ t('desk.book.confirming', {}, 'Confirming the booking…') }}
          </p>
          <Message
            v-if="confirmError"
            severity="error"
            role="alert"
            data-testid="book-confirm-error"
          >
            {{ confirmError }}
          </Message>
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
        <ReferenceDetails
          v-if="bookingDetails.length > 0"
          :items="bookingDetails"
          testid-prefix="book-details"
        />
        <Button
          id="book-new-booking-button"
          type="button"
          :label="t('desk.book.new_button', {}, 'New booking')"
          data-testid="book-new-booking"
          @click="onNewBooking"
        />
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
        <Button
          id="book-print-button"
          type="button"
          :label="t('desk.book.print_button', {}, 'Print')"
          data-testid="book-print"
          @click="onPrint"
        />
        <Button
          id="book-copy-button"
          type="button"
          :label="t('desk.book.copy_button', {}, 'Copy confirmation')"
          data-testid="book-copy"
          @click="onCopy"
        />
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
import { defineComponent, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { catalogueLocale, t } from '../i18n';
import { useSessionStore } from '../stores/session';
import ReferenceDetails, { type ReferenceItem } from '../components/ReferenceDetails.vue';

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
//   price), CheckRoomTypeSellability (the searched sellable
//   count), CreateReservation with that searched count as
//   sellableUnits (the atomic guard refuses unsellable
//   combinations), GetReservation read-back, AttachReservation
//   with that RES-side snapshot, then ProduceConfirmation
//   for the printable/shareable confirmation. Returning guests
//   resolve through IdentifyGuest; genuinely new walk-ins register
//   through UpsertGuest before quoting. The quoted price is frozen
//   into the booking as the price basis; later rate changes never
//   alter it (BR-13).

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
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, InputText, Message, ReferenceDetails },
  setup() {
    const session = useSessionStore();
    const guestName = ref('');
    const guestId = ref('');
    const guestStatus = ref('');
    // Guest snapshot for the booking confirm: the reservation
    // contract requires the hotel-mandatory guest fields
    // (FR-CUS-1, e.g. fullName) alongside the guestId, so the
    // view remembers the fullName returned by find/register
    // together with the guestId it belongs to.
    const resolvedGuest = ref<{ guestId: string; fullName: string } | null>(null);
    const arrivalDate = ref('');
    const departureDate = ref('');
    const roomTypeId = ref('');
    // Room-type catalogue (issue #372): the picker shows names
    // and submits IDs, so staff never type a raw type UUID.
    const roomTypes = ref<Array<{ id: string; name: string }>>([]);
    const roomTypesLoading = ref(false);
    const roomTypeNames = ref<Record<string, string>>({});
    // Exact record IDs stay hidden by default (issue #372 owner
    // amendment) and surface only in these reference details.
    const bookingDetails = ref<ReferenceItem[]>([]);
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

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      quote.value = null;
      quoteKey.value = null;
      session.expireSession();
    }

    function typeName(roomTypeId: string | undefined): string {
      if (roomTypeId && roomTypeNames.value[roomTypeId]) {
        return roomTypeNames.value[roomTypeId];
      }
      return t('desk.today.room_type_unresolved', {}, 'Room type');
    }

    async function loadRoomTypes(): Promise<void> {
      roomTypesLoading.value = true;
      try {
        const listed = await apiFetch<{ roomTypes?: Array<{ id: string; name: string }> }>(
          '/v1/rooms/ListRoomTypes',
          { method: 'POST', body: JSON.stringify({}) },
        );
        const entries = (listed.roomTypes ?? []).filter((type) => type.id && type.name);
        roomTypes.value = entries;
        const names: Record<string, string> = {};
        for (const type of entries) {
          names[type.id] = type.name;
        }
        roomTypeNames.value = names;
      } catch (err) {
        // The picker empty state covers a failed read (Refs #372):
        // staff never type a raw type UUID.
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
      } finally {
        roomTypesLoading.value = false;
      }
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
        resolvedGuest.value = { guestId: guest.guestId, fullName: guest.fullName };
        guestStatus.value = t(
          'desk.book.guest_found',
          { name: guest.fullName, stays: guest.pastStayCount },
          'Guest found: {name} ({stays} past stays).',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
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
        guestStatus.value = errorMessage();
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
          { method: 'POST', body: JSON.stringify({ fullName: name, actor: session.displayName ?? '' }) },
        );
        guestId.value = guest.guestId;
        resolvedGuest.value = { guestId: guest.guestId, fullName: guest.fullName };
        guestStatus.value = t(
          'desk.book.guest_new',
          { name: guest.fullName },
          'New guest registered: {name}.',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        guestStatus.value = errorMessage();
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
          expireToGate();
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
        quoteError.value = errorMessage();
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
      // The confirmation `type` carries the booked room-type ID:
      // the pair renders the resolved name (issue #372) and the
      // exact ID lives in the reference details below.
      confirmationPairs.value = [
        { label: 'hotel', value: confirmation.hotel?.name ?? '' },
        { label: 'guest', value: confirmation.guest?.fullName ?? '' },
        { label: 'reference', value: confirmation.reservationRef },
        { label: 'check-in', value: confirmation.dates?.checkIn ?? '' },
        { label: 'check-out', value: confirmation.dates?.checkOut ?? '' },
        { label: 'type', value: typeName(confirmation.type) },
        { label: 'price', value: money },
      ];
      bookingDetails.value = confirmation.type
        ? [{ label: 'Room type ID', value: confirmation.type }]
        : [];
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
        // The reservation contract requires the hotel-mandatory
        // guest fields (FR-CUS-1): reuse the fullName remembered
        // by find/register when it belongs to the entered guest
        // ID, otherwise resolve it by guest ID first so a pasted
        // ID still confirms with a complete snapshot.
        let resolvedFullName = '';
        if (resolvedGuest.value !== null && resolvedGuest.value.guestId === resolvedGuestId) {
          resolvedFullName = resolvedGuest.value.fullName;
        } else {
          try {
            const named = await apiFetch<{ fullName: string }>('/v1/guests/IdentifyGuest', {
              method: 'POST',
              body: JSON.stringify({ guestId: resolvedGuestId }),
            });
            resolvedFullName = named.fullName;
            resolvedGuest.value = { guestId: resolvedGuestId, fullName: named.fullName };
          } catch (lookupErr) {
            if (isSignedOut(lookupErr)) {
              expireToGate();
              return;
            }
            if (errorCode(lookupErr) === 'NOT_FOUND') {
              confirmError.value = t(
                'desk.book.guest_notfound',
                {},
                'No guest with that name. Check the name, enter the guest ID, or register a walk-in guest.',
              );
              return;
            }
            confirmError.value = errorMessage();
            return;
          }
        }
        // The reservation contract carries the desk-loop
        // search-step output: the searched sellable count for the
        // quoted type and dates, read fresh here so the confirm
        // never reuses a stale quote-time value. Hardcoding 1
        // gives every room type capacity-1 semantics (issue #322).
        let sellableUnits = 0;
        try {
          const sellable = await apiFetch<{ sellableCount: number }>(
            '/v1/rooms/CheckRoomTypeSellability',
            {
              method: 'POST',
              body: JSON.stringify({
                roomType: activeQuote.roomTypeId,
                dateFrom: activeQuote.arrivalDate,
                dateTo: activeQuote.departureDate,
              }),
            },
          );
          sellableUnits =
            typeof sellable.sellableCount === 'number' ? sellable.sellableCount : NaN;
        } catch (sellErr) {
          if (isSignedOut(sellErr)) {
            expireToGate();
            return;
          }
          confirmError.value = errorMessage();
          return;
        }
        if (!Number.isInteger(sellableUnits) || sellableUnits < 1) {
          confirmError.value = t(
            'desk.book.refused_soldout',
            {},
            'No rooms of this type are free for these dates.',
          );
          return;
        }
        const bookingBody: Record<string, unknown> = {
          roomTypeId: activeQuote.roomTypeId,
          arrivalDate: activeQuote.arrivalDate,
          departureDate: activeQuote.departureDate,
          guest: { guestId: resolvedGuestId, fullName: resolvedFullName },
          sellableUnits,
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
          roomTypeId: string;
          arrivalDate: string;
          departureDate: string;
          priceBasis?: { totalMinor?: number };
        }>('/v1/reservations/GetReservation', {
          method: 'POST',
          body: JSON.stringify({ reservationRef: created.reservationRef }),
        });
        // The confirm already resolved the snapshot name from the
        // server, so the read-back reuses it (guest ID fallback
        // only when the lookup returned no name).
        const readBackName = resolvedFullName !== '' ? resolvedFullName : resolvedGuestId;
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
          // Wire the confirmation end to end (issue #323): the
          // Guests store only serves attached snapshots, so attach
          // the RES-side read-back first, then produce the human ref.
          await apiFetch('/v1/guests/AttachReservation', {
            method: 'POST',
            body: JSON.stringify({
              reservationRef: readBack.reservationRef,
              guest: { guestId: resolvedGuestId, fullName: readBackName },
              dates: { checkIn: readBack.arrivalDate, checkOut: readBack.departureDate },
              type: readBack.roomTypeId,
              price: { amountMinor: quotedTotal },
            }),
          });
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
            expireToGate();
            return;
          }
          confirmationPairs.value = null;
          confirmationError.value = errorMessage();
        }
        clearQuote();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
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
        confirmError.value = errorMessage();
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
      resolvedGuest.value = null;
      arrivalDate.value = '';
      departureDate.value = '';
      roomTypeId.value = '';
      ratePlan.value = '';
      discountName.value = '';
      guestStatus.value = '';
      booking.value = null;
      bookingDetails.value = [];
      confirmationPairs.value = null;
      confirmationError.value = '';
      copyStatus.value = '';
      clearQuote();
    }

    onMounted(() => {
      // The shell gates this screen on sign-in, so a signed-in
      // visit loads the type catalogue for the picker straight
      // away; the watcher below covers mounts that sign in later
      // (and only then — no unsigned catalogue call).
      if (session.isSignedIn) {
        void loadRoomTypes();
      }
    });

    watch(
      () => session.isSignedIn,
      (signedIn) => {
        if (signedIn && roomTypes.value.length === 0 && !roomTypesLoading.value) {
          void loadRoomTypes();
        }
      },
    );

    return {
      t,
      guestName,
      guestId,
      guestStatus,
      arrivalDate,
      departureDate,
      roomTypeId,
      roomTypes,
      roomTypesLoading,
      ratePlan,
      discountName,
      quote,
      quoteNights,
      quoteTotal,
      quoteError,
      confirming,
      confirmError,
      booking,
      bookingDetails,
      confirmationPairs,
      confirmationError,
      copyStatus,
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
