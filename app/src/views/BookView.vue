<template>
  <main data-testid="book-view">
    <!-- Book screen title (restyle Refs #544,
      `docs/design/Book.dc.html:3`: the v2 board carries no screen
      title — the shell header owns the hotel name plus the seven
      design tabs with the `Đặt phòng` pill active, so the v1 h1
      and the `New booking` section h2 are gone (zero extras vs the
      board). Hooks and copy otherwise unchanged). -->
    <noscript><p>{{ t('desk.entry.noscript_book', {}, 'This page needs JavaScript to quote a price and book.') }}</p></noscript>

    <section data-testid="book-booking">
      <form @submit.prevent="">
        <!-- Top grid (restyle Refs #544, `docs/design/Book.dc.html:3`:
          `display:grid;grid-template-columns:1.3fr 1fr;gap:16px` —
          guest card left, quote card right; the stay card sits
          full-width below this grid. Hooks, copy, and logic unchanged. -->
        <div
          class="book-layout"
          data-testid="book-layout"
        >
          <Card data-testid="book-guest-card">
            <!-- Guest card title (restyle Refs #544,
              `docs/design/Book.dc.html:3`: the v2 board heads the
              guest card with the numbered h3 `1. Khách`
              (`margin:0;font-size:16px`); the v1 `Guest` h2 is gone.
              Hooks and copy otherwise unchanged). -->
            <template #title>
              <h3>{{ t('desk.book.guest_heading', {}, '1. Guest') }}</h3>
            </template>
            <template #content>
              <!-- Guest name only (restyle Refs #544,
                `docs/design/Book.dc.html:3`: the board draws the
                name input plus the find/register actions — the v1
                helper notes and the guest-ID input are gone (zero
                extras). Find/register-by-name sets the internal
                guest ID; the snapshot path is unchanged. The
                action-readout line stays as flow state. -->
              <label for="book-guest-name">
                {{ t('desk.book.guest_name', {}, 'Guest name') }}
                <InputText
                  id="book-guest-name"
                  v-model="guestName"
                  name="guest-name"
                  autocomplete="off"
                  data-testid="book-guest-name"
                />
              </label>
              <div class="book-guest-actions">
                <Button
                  id="book-find-guest-button"
                  type="button"
                  class="book-action"
                  :label="t('desk.book.find_button', {}, 'Find')"
                  data-testid="book-find-guest"
                  @click="onFindGuest"
                />
                <Button
                  id="book-register-guest-button"
                  type="button"
                  class="book-action"
                  :label="t('desk.book.register_button', {}, 'Register new guest')"
                  data-testid="book-register-guest"
                  @click="onRegisterGuest"
                />
              </div>
              <p
                role="status"
                class="book-helper"
                data-testid="book-guest-status"
              >
                {{ guestStatus }}
              </p>
            </template>
          </Card>

          <Card data-testid="book-quote-card">
            <!-- Quote card title (restyle Refs #544,
              `docs/design/Book.dc.html:3`: the v2 board heads the
              quote card with the h3 `Báo giá`
              (`margin:0;font-size:16px`); the v1 `Quoted price` h2
              is gone. The quoted rows plus confirm stay as flow
              state below. -->
            <template #title>
              <h3>{{ t('desk.book.quote_heading', {}, 'Quote') }}</h3>
            </template>
            <template #content>
              <div
                v-if="quote !== null"
                data-testid="book-quote-section"
              >
                <p data-testid="book-quote-nights-count">
                  {{ t('desk.book.night_count', { count: quoteNights.length }, 'Nights: {count}') }}
                </p>
                <ul data-testid="book-quote-nights">
                  <li
                    v-for="night in quoteNights"
                    :key="night.nightDate"
                  >
                    {{ night.label }}
                  </li>
                </ul>
                <p><strong data-testid="book-quote-total">{{ quoteTotal }}</strong></p>
                <div>
                  <Button
                    id="book-confirm-button"
                    type="button"
                    class="book-action"
                    :label="t('desk.book.confirm_button', {}, 'Confirm booking')"
                    data-testid="book-confirm"
                    :disabled="confirming"
                    @click="onConfirm"
                  />
                </div>
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
              </div>
              <p
                v-else
                data-testid="book-quote-empty"
              >
                {{ t('desk.book.no_quote', {}, 'Get a price first, then confirm.') }}
              </p>
            </template>
          </Card>
        </div>
        <!-- Stay card full-width below the top grid (restyle Refs #544,
          `docs/design/Book.dc.html:3`: same design card headed by the
          numbered h3 `2. Ngày và phòng` (`margin:0;font-size:16px`);
          the four stay fields sit in a `repeat(4,1fr)` grid with the
          primary quote button below — the v1 `Stay` h2 and the
          rate-plan input are gone (zero extras vs the board). The
          room-type select stays catalogue-driven (DD-09) with its
          choose-placeholder and loading/empty notes as edge state;
          hooks, copy, and logic otherwise unchanged). -->
        <Card data-testid="book-stay-card">
          <template #title>
            <h3>{{ t('desk.book.stay_heading', {}, '2. Dates & room') }}</h3>
          </template>
          <template #content>
            <div class="book-stay-grid">
              <!-- Date fields (Refs #581, G-BK-1): the native
                `<input type="date">` control renders in the browser
                UI locale (Chromium ignores the page `lang`), so a VI
                desk on an EN browser showed `mm/dd/yyyy` (#566). The
                PrimeVue DatePicker follows the APP locale instead —
                `dd/mm/yyyy` in VI, `mm/dd/yyyy` in EN — through the
                `dateFormat`/`locale` bridge in
                `app/src/i18n/primevueLocale.ts`; typed input parses in
                the same order and the canonical ISO value stays in
                `arrivalDate` / `departureDate` for the payload. -->
              <label for="book-arrival-date">
                {{ t('desk.book.arrival', {}, 'Arrival date') }}
                <DatePicker
                  v-model="arrivalPicker"
                  input-id="book-arrival-date"
                  name="arrival-date"
                  :date-format="deskDateFormat"
                  :placeholder="t('desk.book.date_placeholder', {}, 'dd/mm/yyyy')"
                  :manual-input="true"
                  :show-on-focus="false"
                  show-icon
                  icon-display="input"
                  :pt="arrivalDateAttrs"
                />
              </label>
              <label for="book-departure-date">
                {{ t('desk.book.departure', {}, 'Departure date') }}
                <DatePicker
                  v-model="departurePicker"
                  input-id="book-departure-date"
                  name="departure-date"
                  :date-format="deskDateFormat"
                  :placeholder="t('desk.book.date_placeholder', {}, 'dd/mm/yyyy')"
                  :manual-input="true"
                  :show-on-focus="false"
                  show-icon
                  icon-display="input"
                  :pt="departureDateAttrs"
                />
              </label>
              <label for="book-room-type-id">
                {{ t('desk.book.room_type', {}, 'Room type') }}
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
              <label for="book-discount-name">
                {{ t('desk.book.discount', {}, 'Discount') }}
                <InputText
                  id="book-discount-name"
                  v-model="discountName"
                  name="discount-name"
                  autocomplete="off"
                  data-testid="book-discount-name"
                  @update:model-value="onStayInput"
                />
              </label>
            </div>
            <p
              v-if="roomTypesLoading"
              class="book-helper"
              data-testid="book-room-type-loading"
            >
              {{ t('desk.book.room_type_loading', {}, 'Loading room types…') }}
            </p>
            <p
              v-if="!roomTypesLoading && roomTypes.length === 0"
              class="book-helper"
              data-testid="book-room-type-empty"
            >
              {{ t('desk.book.room_type_empty', {}, 'No room types defined yet. Ask a manager to define one first.') }}
            </p>
            <div>
              <Button
                id="book-quote-button"
                type="button"
                class="book-action"
                :label="t('desk.book.quote_button', {}, 'Get price')"
                data-testid="book-quote"
                @click="onQuote"
              />
            </div>
            <Message
              v-if="quoteError"
              severity="error"
              role="alert"
              data-testid="book-quote-error"
            >
              {{ quoteError }}
            </Message>
          </template>
        </Card>
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
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { canonicalFromDate, catalogueLocale, dateFromCanonical, formatDeskDate, formatVnd, localeTag, t } from '../i18n';
import { primeVueDateFormat, syncPrimeVueLocale } from '../i18n/primevueLocale';
import { useSessionStore } from '../stores/session';
import ReferenceDetails, { type ReferenceItem } from '../components/ReferenceDetails.vue';

// Book screen as Vue SFCs (Refs #294, ADR-0003; two-column
// restyle Refs #421 per the owner design rollout #419).
//
// The #544 rebuild re-skins this surface pixel-faithful to the v2
// owner board (`docs/design/Book.dc.html:3`): no screen title and
// no section heading (the shell header owns the hotel name plus the
// seven design tabs); the three cards carry the numbered board h3s
// (`1. Khách`, `Báo giá`, `2. Ngày và phòng`, `margin:0;
// font-size:16px`); the guest card holds the name input plus the
// find/register actions; the stay card holds arrival, departure,
// the catalogue-driven room-type select, and discount in a
// `repeat(4,1fr)` grid with the quote button below; the quote card
// holds the night count, the nightly lines, the total, and the
// confirm action. The v1 helpers, guest-ID input, and rate-plan
// input are gone (zero extras vs the board, orchestrator decision
// on #544); find/register-by-name sets the internal guest ID and
// quotes resolve the single pricing plan. The guest-status,
// loading/empty, quote, result, and confirmation readouts stay as
// flow state. PrimeVue components stay as logic carriers only —
// their default visual styling is overridden in the shell
// stylesheet (`app/src/App.vue`, Refs #544) wherever it diverges
// from the design. Behaviour, reads, transitions, catalogue keys,
// and hooks hold unchanged (the B3 quote-copy REPORTED item stays
// reported).
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

// Amounts arrive in minor currency units. The quote carries no
// currency code, so its rows and total render in the design VND
// shape through `formatVnd` (`1.200.000 đ`, Refs #565). The booking
// read-back and the currency-less confirmation fallback keep the
// plain two-decimal figure, and a confirmation that carries a
// currency formats with it — same split as the legacy page.
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
  components: { Button, Card, DatePicker, InputText, Message, ReferenceDetails },
  setup() {
    const session = useSessionStore();
    // The prime picker reads its calendar wording from the PrimeVue
    // config, so mirror the app locale into it while this view is
    // mounted (Refs #581).
    syncPrimeVueLocale();
    const guestName = ref('');
    const guestStatus = ref('');
    // Guest snapshot for the booking confirm: the reservation
    // contract requires the hotel-mandatory guest fields
    // (FR-CUS-1, e.g. fullName) alongside the guestId, so the
    // view remembers the fullName returned by find/register
    // together with the guestId it belongs to (Refs #544: the v2
    // board carries no guest-ID input, so find/register-by-name is
    // the only path that sets this snapshot).
    const resolvedGuest = ref<{ guestId: string; fullName: string } | null>(null);
    const arrivalDate = ref('');
    const departureDate = ref('');
    // Desk date pickers (Refs #581): the PrimeVue DatePicker models a
    // local calendar Date while the canonical ISO refs above stay the
    // payload source. The writable computeds are the only bridge; a
    // real calendar-day change clears the quote exactly like the old
    // typed change did, while a locale switch only re-renders the same
    // day in the newly active form.
    const deskDateFormat = computed<string>(() => primeVueDateFormat(localeTag.value));
    const arrivalPicker = computed<Date | null>({
      get: () => dateFromCanonical(arrivalDate.value),
      set: (value) => {
        const iso = canonicalFromDate(value);
        if (iso !== arrivalDate.value) {
          arrivalDate.value = iso;
          onStayInput();
        }
      },
    });
    const departurePicker = computed<Date | null>({
      get: () => dateFromCanonical(departureDate.value),
      set: (value) => {
        const iso = canonicalFromDate(value);
        if (iso !== departureDate.value) {
          departureDate.value = iso;
          onStayInput();
        }
      },
    });
    // The gate hook rides the picker's inner input (the DatePicker
    // root is a span), so the existing Playwright `getByTestId` and
    // Vitest `find('[data-testid=...]')` paths keep reaching the
    // editable field.
    const arrivalDateAttrs = {
      pcInputText: { root: { 'data-testid': 'book-arrival-date' } },
    };
    const departureDateAttrs = {
      pcInputText: { root: { 'data-testid': 'book-departure-date' } },
    };
    const roomTypeId = ref('');
    // Room-type catalogue (issue #372): the picker shows names
    // and submits IDs, so staff never type a raw type UUID.
    const roomTypes = ref<Array<{ id: string; name: string }>>([]);
    const roomTypesLoading = ref(false);
    const roomTypeNames = ref<Record<string, string>>({});
    // Exact record IDs stay hidden by default (issue #372 owner
    // amendment) and surface only in these reference details.
    const bookingDetails = ref<ReferenceItem[]>([]);
    const discountName = ref('');
    const quote = ref<Quote | null>(null);
    const quoteKey = ref<string | null>(null);
    // Quote rows derive from `quote`, so a locale switch re-renders
    // the desk dates and the VND amounts without a new quote read
    // (Refs #565, AC-DSK-8).
    const quoteNights = computed<QuoteNightRow[]>(() =>
      (quote.value?.nights ?? []).map((night) => ({
        nightDate: night.nightDate,
        label: t(
          'desk.book.quote_night',
          {
            nightDate: formatDeskDate(night.nightDate),
            amount: formatVnd(night.priceMinor),
          },
          'Night {nightDate}: {amount}',
        ),
      })),
    );
    const quoteTotal = computed<string>(() => {
      const current = quote.value;
      if (!current) {
        return '';
      }
      return t(
        'desk.book.quote_total',
        { amount: formatVnd(current.totalMinor) },
        'Total: {amount}',
      );
    });
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
          'No guest with that name. Check the name or register a new guest.',
        );
        return;
      }
      try {
        const guest = await apiFetch<{ guestId: string; fullName: string; pastStayCount: number }>(
          '/v1/guests/IdentifyGuest',
          { method: 'POST', body: JSON.stringify({ fullName: name }) },
        );
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
            'No guest with that name. Check the name or register a new guest.',
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
          'No guest with that name. Check the name or register a new guest.',
        );
        return;
      }
      try {
        const guest = await apiFetch<{ guestId: string; fullName: string }>(
          '/v1/guests/UpsertGuest',
          { method: 'POST', body: JSON.stringify({ fullName: name, actor: session.displayName ?? '' }) },
        );
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
      // The v2 board carries no guest-ID input (Refs #544): the
      // guest snapshot comes from find/register-by-name only, which
      // remembers the fullName alongside the guest ID.
      if (resolvedGuest.value === null) {
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
        // guest fields (FR-CUS-1): the snapshot remembered by
        // find/register travels with the confirm.
        const resolvedGuestId = resolvedGuest.value.guestId;
        const resolvedFullName = resolvedGuest.value.fullName;
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
      resolvedGuest.value = null;
      arrivalDate.value = '';
      departureDate.value = '';
      roomTypeId.value = '';
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
      guestStatus,
      arrivalDate,
      departureDate,
      arrivalPicker,
      departurePicker,
      deskDateFormat,
      arrivalDateAttrs,
      departureDateAttrs,
      roomTypeId,
      roomTypes,
      roomTypesLoading,
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
   is affected.
   Shell chrome (Refs #406): the shell nav lives outside this view,
   so the scoped selectors below cannot reach it — the one `:global`
   selector hides the shell header/nav on paper while this view is
   mounted. Screen rendering is unchanged (print medium only). */
@media print {
  :global([data-testid='shell-nav']) {
    display: none;
  }
  [data-testid='book-view'] > :not([data-testid='book-booking']) {
    display: none;
  }
  [data-testid='book-booking'] > :not([data-testid='book-confirmation']) {
    display: none;
  }
}
</style>
