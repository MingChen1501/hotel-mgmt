<template>
  <main data-testid="bookings-view">
    <!-- Read-only booking register (Refs #648, T2 reader-visible change).
      Spec: `docs/product/booking-management-view.md`; flow diagrams:
      `docs/architecture/lld.md` section 24. The screen is app-only (no
      owner board draws it), writes nothing, and reads exactly five
      operations that already exist: `QueryCalendar`, `GetReservation`,
      `ListRoomTypes`, `ListArrivalsDepartures`, and `ListRoomsByState`.
      Views carry no style blocks (M4): every rule lives in the shell
      stylesheet (`App.vue`, `@media screen`). -->
    <div class="bookings-head">
      <h1
        class="bookings-title"
        data-testid="bookings-title"
      >
        {{ t('desk.bookings.title', {}, 'Bookings') }}
      </h1>
      <p class="bookings-intro">
        {{ t('desk.bookings.intro', {}, 'Every booking in the chosen dates. This page only reads.') }}
      </p>
    </div>

    <!-- Filter card (spec section 3): two app-locale night pickers, one
      explicit apply action, one helper line. The range is inclusive in
      product words and maps to the half-open calendar window. -->
    <Card data-testid="bookings-filter">
      <template #content>
        <form
          class="bookings-filter"
          data-testid="bookings-filter-form"
          @submit.prevent="applyRange"
        >
          <label for="bookings-range-from">
            {{ t('desk.bookings.range_from', {}, 'First night') }}
            <DatePicker
              v-model="firstNightPicker"
              input-id="bookings-range-from"
              name="bookings-range-from"
              :date-format="deskDateFormat"
              :placeholder="t('desk.book.date_placeholder', {}, datePlaceholder)"
              :manual-input="true"
              :show-on-focus="false"
              :disabled="loading"
              show-icon
              icon-display="input"
              :pt="firstNightAttrs"
            />
          </label>
          <label for="bookings-range-to">
            {{ t('desk.bookings.range_to', {}, 'Last night') }}
            <DatePicker
              v-model="lastNightPicker"
              input-id="bookings-range-to"
              name="bookings-range-to"
              :date-format="deskDateFormat"
              :placeholder="t('desk.book.date_placeholder', {}, datePlaceholder)"
              :manual-input="true"
              :show-on-focus="false"
              :disabled="loading"
              show-icon
              icon-display="input"
              :pt="lastNightAttrs"
            />
          </label>
          <div class="bookings-filter-action">
            <Button
              type="submit"
              class="bookings-action"
              :label="t('desk.bookings.show', {}, 'Show')"
              :disabled="loading"
              data-testid="bookings-show"
            />
          </div>
        </form>
        <p
          class="bookings-hint"
          data-testid="bookings-range-hint"
        >
          {{ t('desk.bookings.range_hint', {}, 'The list holds every booking staying at least one night between these two nights.') }}
        </p>
        <p
          v-if="rangeError"
          class="bookings-error"
          role="alert"
          data-testid="bookings-range-error"
        >
          {{ rangeError }}
        </p>
      </template>
    </Card>

    <Message
      v-if="loading"
      severity="info"
      data-testid="bookings-loading"
    >
      {{ t('desk.bookings.loading', {}, 'Loading the booking register…') }}
    </Message>

    <!-- List read failure (spec section 7): one plain sentence plus one
      retry that re-runs the same apply. No invented rows. -->
    <div
      v-if="listError"
      class="bookings-list-error"
      data-testid="bookings-list-error"
    >
      <Message
        severity="error"
        role="alert"
      >
        {{ listError }}
      </Message>
      <Button
        type="button"
        class="bookings-action-secondary"
        :label="t('desk.bookings.retry', {}, 'Try again')"
        data-testid="bookings-retry"
        @click="retryList"
      />
    </div>

    <!-- Degradation notice above the list (spec section 7): counted
      partial rows, one column-truthful sentence per failed shared map,
      and the cap sentence. Neither partial class carries a retry:
      re-applying the range reads again. -->
    <div
      v-if="notices.length > 0"
      class="bookings-notices"
      data-testid="bookings-notices"
    >
      <p
        v-for="notice in notices"
        :key="notice.testid"
        class="bookings-notice"
        :data-testid="notice.testid"
      >
        {{ notice.text }}
      </p>
    </div>

    <Card
      v-if="!listError"
      data-testid="bookings-list"
    >
      <template #content>
        <!-- One static column-header row. The guest cell is two lines
          (name, then the reference in muted ink), so its heading is
          two lines too. The grid carries table semantics so a screen
          reader can name the columns each cell belongs to. -->
        <div
          class="bookings-table"
          role="table"
          :aria-label="t('desk.bookings.title', {}, 'Bookings')"
        >
          <div
            class="bookings-row bookings-row-head"
            data-testid="bookings-header"
            role="row"
          >
            <span
              class="bookings-guest-cell"
              role="columnheader"
            >
              <span>{{ t('desk.bookings.col_guest', {}, 'Guest') }}</span>
              <span class="bookings-row-ref">{{ t('desk.bookings.col_ref', {}, 'Reference') }}</span>
            </span>
            <span role="columnheader">{{ t('desk.bookings.col_room_type', {}, 'Room type') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_room', {}, 'Room') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_arrival', {}, 'Arrival') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_departure', {}, 'Departure') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_nights', {}, 'Nights') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_total', {}, 'Total') }}</span>
            <span role="columnheader">{{ t('desk.bookings.col_state', {}, 'State') }}</span>
          </div>

          <div
            v-for="row in rows"
            :key="row.ref"
            class="bookings-row"
            :class="{
              'bookings-row-selected': row.ref === selectedRef,
              'bookings-row-inactive': row.state === 'cancelled' || row.state === 'no-show',
            }"
            data-testid="bookings-row"
            role="row"
            @click="selectRow(row)"
          >
            <span
              class="bookings-guest-cell"
              role="cell"
            >
              <!-- The guest name is the row's single action, so keyboard
              and screen-reader users have one obvious control per row;
              a pointer click anywhere else on the row does the same. -->
              <button
                type="button"
                class="bookings-row-open"
                data-testid="bookings-row-open"
                :aria-label="rowActionLabel(row)"
                @click.stop="selectRow(row)"
              >
                {{ guestCell(row) }}
              </button>
              <span
                class="bookings-row-ref"
                data-testid="bookings-row-ref"
              >{{ row.ref }}</span>
            </span>
            <span
              data-testid="bookings-row-room-type"
              role="cell"
            >{{ roomTypeCell(row.roomTypeId) }}</span>
            <span
              data-testid="bookings-row-room"
              role="cell"
            >{{ roomCell(row) }}</span>
            <span
              data-testid="bookings-row-arrival"
              role="cell"
            >{{ formatDeskDate(row.arrivalDate) }}</span>
            <span
              data-testid="bookings-row-departure"
              role="cell"
            >{{ formatDeskDate(row.departureDate) }}</span>
            <span
              data-testid="bookings-row-nights"
              role="cell"
            >{{ nightsBetween(row.arrivalDate, row.departureDate) }}</span>
            <span
              data-testid="bookings-row-total"
              role="cell"
            >{{ totalCell(row) }}</span>
            <span role="cell">
              <Tag
                :value="stateLabel(row.state)"
                severity="secondary"
                data-testid="bookings-row-state"
              />
            </span>
          </div>
        </div>

        <p
          v-if="!loading && rows.length === 0 && !listError"
          class="bookings-empty"
          data-testid="bookings-empty"
        >
          {{ emptySentence }}
        </p>
      </template>
    </Card>

    <!-- Detail card: absent until a selection, never replaces the list,
      and carries no action (spec section 6). -->
    <Card
      v-if="selectedRef !== null"
      data-testid="bookings-detail"
    >
      <template #title>
        <h2>{{ t('desk.bookings.detail_heading', {}, 'Booking detail') }}</h2>
      </template>
      <template #content>
        <div
          v-if="detailError !== ''"
          class="bookings-detail-error"
          data-testid="bookings-detail-error-block"
        >
          <Message
            severity="error"
            role="alert"
          >
            {{ detailError }}
          </Message>
          <Button
            type="button"
            class="bookings-action-secondary"
            :label="t('desk.bookings.retry', {}, 'Try again')"
            data-testid="bookings-detail-retry"
            @click="retryDetail"
          />
        </div>
        <div v-else-if="detail !== null">
          <p
            class="bookings-detail-ref"
            data-testid="bookings-detail-ref"
          >
            {{ t('desk.book.reference', { ref: detail.ref }, 'Booking reference: {ref}') }}
          </p>
          <dl
            class="bookings-detail"
            data-testid="bookings-detail-record"
          >
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.detail_guest', {}, 'Guest') }}</dt>
              <dd data-testid="bookings-detail-guest">
                {{ detail.guestName }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.detail_room_type', {}, 'Room type') }}</dt>
              <dd data-testid="bookings-detail-room-type">
                {{ roomTypeCell(detail.roomTypeId) }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.detail_room', {}, 'Assigned room') }}</dt>
              <dd data-testid="bookings-detail-room">
                {{ detailRoomCell(detail) }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.detail_arrival', {}, 'Arrival') }}</dt>
              <dd data-testid="bookings-detail-arrival">
                {{ formatDeskDate(detail.arrivalDate) }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.detail_departure', {}, 'Departure') }}</dt>
              <dd data-testid="bookings-detail-departure">
                {{ formatDeskDate(detail.departureDate) }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dd data-testid="bookings-detail-nights">
                {{ t('desk.book.night_count', { count: nightsBetween(detail.arrivalDate, detail.departureDate) }, 'Nights: {count}') }}
              </dd>
            </div>
            <div class="bookings-detail-line">
              <dd data-testid="bookings-detail-total">
                {{ t('desk.book.quote_total', { amount: formatVnd(detail.totalMinor) }, 'Total: {amount}') }}
              </dd>
            </div>
            <div
              v-if="detail.discountName !== null && detail.discountName !== ''"
              class="bookings-detail-line"
              data-testid="bookings-detail-discount"
            >
              <dd>{{ t('desk.bookings.detail_discount', { name: detail.discountName }, 'Discount: {name}') }}</dd>
            </div>
            <div class="bookings-detail-line">
              <dt>{{ t('desk.bookings.col_state', {}, 'State') }}</dt>
              <dd>
                <Tag
                  :value="stateLabel(detail.state)"
                  severity="secondary"
                  data-testid="bookings-detail-state"
                />
              </dd>
            </div>
          </dl>
        </div>
      </template>
    </Card>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import DatePicker from 'primevue/datepicker';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import {
  canonicalFromDate,
  catalogueLocale,
  dateFromCanonical,
  formatDeskDate,
  formatVnd,
  localeTag,
  t,
} from '../i18n';
import { primeVueDateFormat } from '../i18n/primevueLocale';
import { useSessionStore } from '../stores/session';
import { loadInHouseRoomMap, localBusinessDate } from '../stay-options';

// Read-only booking register (Refs #648, T2 reader-visible change).
//
// Load composition (LLD section 24.2): one apply is one `QueryCalendar`
// read, one shared-map load (`ListRoomTypes` plus the
// `ListArrivalsDepartures` -> `ListRoomsByState("occupied")` pair), and
// at most one `GetReservation` per capped row. The 50-row cap is
// applied before the per-row reads, so the fan-out is bounded.
//
// The screen writes nothing: no create, edit, cancel, no-show,
// check-in, check-out, or room control, and no link into an edit flow.
// It reads with the signed-in session like every other desk screen and
// adds no role gate of its own (LLD section 24, G6).

interface CalendarEntry {
  reservationRef: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  state: string;
  stayId: string | null;
}

interface BookingRow {
  ref: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  state: string;
  stayId: string | null;
  /** False when the per-row `GetReservation` read failed. */
  readable: boolean;
  guestName: string;
  totalMinor: number | null;
}

interface BookingDetail {
  ref: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  state: string;
  stayId: string | null;
  guestName: string;
  totalMinor: number;
  discountName: string | null;
}

interface Notice {
  testid: string;
  text: string;
}

/** The register renders at most this many bookings per read (spec section 5). */
const ROW_CAP = 50;
/** Default range length: the business date through six nights after it. */
const DEFAULT_NIGHTS = 7;
const PLACEHOLDER = '—';
const COL_ROOM_TYPE = 'roomType';
const COL_ROOM = 'room';

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
}

// Catalogue fallback mirrors the active desk form, exactly as the Book
// and Manage screens do (Refs #581).
function fallbackDatePlaceholder(): string {
  return catalogueLocale() === 'en' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
}

function addDays(canonical: string, days: number): string {
  const date = dateFromCanonical(canonical);
  if (date === null) {
    return '';
  }
  date.setDate(date.getDate() + days);
  return canonicalFromDate(date);
}

// Nights are the whole-day difference between departure and arrival
// (spec section 5): a plain count, never a recalculation of the price.
function nightsBetween(arrival: string, departure: string): number {
  const from = dateFromCanonical(arrival);
  const to = dateFromCanonical(departure);
  if (from === null || to === null) {
    return 0;
  }
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export default defineComponent({
  name: 'BookingsView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Card, DatePicker, Message, Tag },
  setup() {
    const session = useSessionStore();

    const firstNight = ref('');
    const lastNight = ref('');
    const rows = ref<BookingRow[]>([]);
    const loading = ref(false);
    const listError = ref('');
    const rangeError = ref('');
    const incompleteCount = ref(0);
    const failedColumns = ref<string[]>([]);
    const cappedCount = ref(0);
    const roomTypeNames = ref<Record<string, string>>({});
    const roomTypeFailed = ref(false);
    const roomColumnFailed = ref(false);
    const roomsByStayId = ref<Record<string, string>>({});
    const selectedRef = ref<string | null>(null);
    const detail = ref<BookingDetail | null>(null);
    const detailError = ref('');
    const detailLoading = ref(false);

    const deskDateFormat = computed<string>(() => primeVueDateFormat(localeTag.value));
    const datePlaceholder = computed<string>(() => fallbackDatePlaceholder());
    const firstNightPicker = computed<Date | null>({
      get: () => dateFromCanonical(firstNight.value),
      set: (value) => {
        firstNight.value = canonicalFromDate(value);
      },
    });
    const lastNightPicker = computed<Date | null>({
      get: () => dateFromCanonical(lastNight.value),
      set: (value) => {
        lastNight.value = canonicalFromDate(value);
      },
    });
    // The gate hooks ride the pickers' inner inputs (the DatePicker root
    // is a span), so the existing test paths keep reaching the field.
    const firstNightAttrs = {
      pcInputText: { root: { 'data-testid': 'bookings-range-from' } },
    };
    const lastNightAttrs = {
      pcInputText: { root: { 'data-testid': 'bookings-range-to' } },
    };

    const rangeInvalid = computed<string>(() =>
      t(
        'desk.bookings.range_invalid',
        {},
        'The last night must not be before the first night.',
      ),
    );
    const cellUnreadable = computed<string>(() =>
      t('desk.bookings.cell_unreadable', {}, 'could not read'),
    );
    const emptySentence = computed<string>(() =>
      t(
        'desk.bookings.empty',
        { from: formatDeskDate(firstNight.value), to: formatDeskDate(lastNight.value) },
        'No booking stays between {from} and {to}.',
      ),
    );
    const notices = computed<Notice[]>(() => {
      const listed: Notice[] = [];
      if (incompleteCount.value > 0) {
        listed.push({
          testid: 'bookings-row-partial',
          text: t(
            'desk.bookings.row_partial',
            { count: incompleteCount.value },
            '{count} bookings could not be completed: their guest name or total is unreadable.',
          ),
        });
      }
      for (const key of failedColumns.value) {
        listed.push({
          testid: 'bookings-column-partial',
          text: t(
            'desk.bookings.column_partial',
            { column: columnHeading(key) },
            'The {column} column could not be read.',
          ),
        });
      }
      if (cappedCount.value > 0) {
        listed.push({
          testid: 'bookings-capped',
          text: t(
            'desk.bookings.capped',
            { count: cappedCount.value },
            'Showing the first {count} bookings. Narrow the dates to see the rest.',
          ),
        });
      }
      return listed;
    });

    function expireToGate(): void {
      session.expireSession();
    }

    function columnHeading(key: string): string {
      return key === COL_ROOM_TYPE
        ? t('desk.bookings.col_room_type', {}, 'Room type')
        : t('desk.bookings.col_room', {}, 'Room');
    }

    function unknownGuest(): string {
      return t('desk.today.unknown_guest', {}, 'Unknown guest');
    }

    function stateLabel(state: string): string {
      switch (state) {
        case 'confirmed':
          return t('desk.bookings.state_confirmed', {}, 'Booked');
        case 'checked-in':
          return t('desk.bookings.state_checked_in', {}, 'In house');
        case 'closed':
          return t('desk.bookings.state_closed', {}, 'Checked out');
        case 'cancelled':
          return t('desk.bookings.state_cancelled', {}, 'Cancelled');
        case 'no-show':
          return t('desk.bookings.state_no_show', {}, 'No-show');
        default:
          // Never a raw state code (spec section 5).
          return t('desk.bookings.state_unknown', {}, 'Unknown');
      }
    }

    function guestCell(row: BookingRow): string {
      if (!row.readable) {
        return cellUnreadable.value;
      }
      return row.guestName === '' ? unknownGuest() : row.guestName;
    }

    function totalCell(row: BookingRow): string {
      if (!row.readable || row.totalMinor === null) {
        return cellUnreadable.value;
      }
      return formatVnd(row.totalMinor);
    }

    function rowActionLabel(row: BookingRow): string {
      return t(
        'desk.bookings.open_row',
        { guest: guestCell(row), ref: row.ref },
        'Open the booking for {guest} ({ref})',
      );
    }

    function roomTypeCell(roomTypeId: string): string {
      if (roomTypeFailed.value) {
        return cellUnreadable.value;
      }
      const name = roomTypeNames.value[roomTypeId];
      // A successful type read without the row's id cannot happen while
      // room types have no delete, so it reads as unreadable rather than
      // printing a UUID (LLD section 24.3).
      return name === undefined ? cellUnreadable.value : name;
    }

    // Assigned room rules (spec section 5, LLD section 24.3): only an
    // in-house stay resolves a room, and only when both reads agree. A
    // confirmed booking holds a type, a closed booking's room is not
    // exposed by any read (G4), and a stay or room missing from the
    // point-in-time read reads `—` — the screen never guesses.
    function assignedRoom(state: string, stayId: string | null): string {
      if (roomColumnFailed.value) {
        return cellUnreadable.value;
      }
      if (state !== 'checked-in' || stayId === null || stayId === '') {
        return PLACEHOLDER;
      }
      return roomsByStayId.value[stayId] ?? PLACEHOLDER;
    }

    function roomCell(row: BookingRow): string {
      return assignedRoom(row.state, row.stayId);
    }

    function detailRoomCell(record: BookingDetail): string {
      return assignedRoom(record.state, record.stayId);
    }

    function clearSelection(): void {
      selectedRef.value = null;
      detail.value = null;
      detailError.value = '';
    }

    // One apply: validate, clear the selection, read the calendar, sort
    // and cap, then read the shared maps and the capped rows in parallel
    // (LLD section 24.4).
    async function applyRange(): Promise<void> {
      if (loading.value) {
        return;
      }
      rangeError.value = '';
      if (firstNight.value === '' || lastNight.value === '') {
        rangeError.value = rangeInvalid.value;
        return;
      }
      if (lastNight.value < firstNight.value) {
        rangeError.value = rangeInvalid.value;
        return;
      }
      clearSelection();
      loading.value = true;
      listError.value = '';
      rows.value = [];
      incompleteCount.value = 0;
      failedColumns.value = [];
      cappedCount.value = 0;
      try {
        const calendar = await apiFetch<{ reservations?: CalendarEntry[] }>(
          '/v1/reservations/QueryCalendar',
          {
            method: 'POST',
            body: JSON.stringify({
              dateFrom: firstNight.value,
              // The contract window is half-open: the last night plus one
              // day includes a booking staying that night (spec section 4).
              dateTo: addDays(lastNight.value, 1),
            }),
          },
        );
        const entries = [...(calendar.reservations ?? [])]
          .filter(
            (entry) =>
              typeof entry.reservationRef === 'string'
              && typeof entry.roomTypeId === 'string'
              && typeof entry.arrivalDate === 'string'
              && typeof entry.departureDate === 'string'
              && typeof entry.state === 'string',
          )
          .sort(
            (a, b) =>
              a.arrivalDate.localeCompare(b.arrivalDate)
              || a.reservationRef.localeCompare(b.reservationRef),
          );
        // The cap bounds the per-row fan-out, so it is applied before the
        // reads (LLD section 24.2).
        if (entries.length > ROW_CAP) {
          cappedCount.value = ROW_CAP;
        }
        const capped = entries.slice(0, ROW_CAP);

        const [, , rowReads] = await Promise.all([
          loadRoomTypeNames(),
          loadRoomMap(),
          Promise.all(capped.map((entry) => readRow(entry))),
        ]);
        let incomplete = 0;
        const built: BookingRow[] = [];
        for (const row of rowReads) {
          if (!row.readable) {
            incomplete += 1;
          }
          built.push(row);
        }
        rows.value = built;
        incompleteCount.value = incomplete;
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        // One plain sentence for the whole list; no invented rows.
        listError.value = t(
          'desk.bookings.read_failed',
          {},
          'Could not read the booking register.',
        );
      } finally {
        loading.value = false;
      }
    }

    async function loadRoomTypeNames(): Promise<void> {
      roomTypeFailed.value = false;
      roomTypeNames.value = {};
      try {
        const listed = await apiFetch<{ roomTypes?: Array<{ id?: string; name?: string }> }>(
          '/v1/rooms/ListRoomTypes',
          { method: 'POST', body: JSON.stringify({}) },
        );
        const names: Record<string, string> = {};
        for (const type of listed.roomTypes ?? []) {
          if (type.id && type.name) {
            names[type.id] = type.name;
          }
        }
        roomTypeNames.value = names;
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        roomTypeFailed.value = true;
        failedColumns.value = [...failedColumns.value, COL_ROOM_TYPE];
      }
    }

    async function loadRoomMap(): Promise<void> {
      roomColumnFailed.value = false;
      roomsByStayId.value = {};
      try {
        const map = await loadInHouseRoomMap();
        roomsByStayId.value = map.roomsByStayId;
        if (map.failed) {
          roomColumnFailed.value = true;
          failedColumns.value = [...failedColumns.value, COL_ROOM];
        }
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        roomColumnFailed.value = true;
        failedColumns.value = [...failedColumns.value, COL_ROOM];
      }
    }

    // One row read per capped booking. A failure keeps the calendar
    // fields and marks the guest and total cells unreadable; the booking
    // is never dropped (spec section 7).
    async function readRow(entry: CalendarEntry): Promise<BookingRow> {
      const base: BookingRow = {
        ref: entry.reservationRef,
        roomTypeId: entry.roomTypeId,
        arrivalDate: entry.arrivalDate,
        departureDate: entry.departureDate,
        state: entry.state,
        stayId: entry.stayId ?? null,
        readable: false,
        guestName: '',
        totalMinor: null,
      };
      try {
        const record = await apiFetch<{
          guest?: { fullName?: string };
          priceBasis?: { totalMinor?: number; discountName?: string | null };
        }>('/v1/reservations/GetReservation', {
          method: 'POST',
          body: JSON.stringify({ reservationRef: entry.reservationRef }),
        });
        const name = (record.guest?.fullName ?? '').trim();
        return {
          ...base,
          readable: true,
          guestName: name,
          totalMinor: typeof record.priceBasis?.totalMinor === 'number'
            ? record.priceBasis.totalMinor
            : null,
        };
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return base;
      }
    }

    // The detail is always a fresh read: the read-back is authoritative
    // over the row it came from (spec section 6).
    async function selectRow(row: BookingRow): Promise<void> {
      if (detailLoading.value) {
        return;
      }
      selectedRef.value = row.ref;
      await readDetail(row.ref);
    }

    async function readDetail(ref: string): Promise<void> {
      detailLoading.value = true;
      detailError.value = '';
      detail.value = null;
      try {
        const record = await apiFetch<{
          reservationRef?: string;
          roomTypeId?: string;
          arrivalDate?: string;
          departureDate?: string;
          guest?: { fullName?: string };
          priceBasis?: { totalMinor?: number; discountName?: string | null };
          state?: string;
          stayId?: string | null;
        }>('/v1/reservations/GetReservation', {
          method: 'POST',
          body: JSON.stringify({ reservationRef: ref }),
        });
        const name = (record.guest?.fullName ?? '').trim();
        detail.value = {
          ref: record.reservationRef ?? ref,
          roomTypeId: record.roomTypeId ?? '',
          arrivalDate: record.arrivalDate ?? '',
          departureDate: record.departureDate ?? '',
          state: record.state ?? '',
          stayId: record.stayId ?? null,
          guestName: name === '' ? unknownGuest() : name,
          totalMinor: typeof record.priceBasis?.totalMinor === 'number'
            ? record.priceBasis.totalMinor
            : 0,
          discountName: record.priceBasis?.discountName ?? null,
        };
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        // The previous detail is not kept as if it were current.
        detail.value = null;
        detailError.value = t(
          'desk.bookings.detail_failed',
          { ref },
          'Could not read booking {ref}.',
        );
      } finally {
        detailLoading.value = false;
      }
    }

    async function retryList(): Promise<void> {
      await applyRange();
    }

    async function retryDetail(): Promise<void> {
      if (selectedRef.value === null || detailLoading.value) {
        return;
      }
      await readDetail(selectedRef.value);
    }

    onMounted(() => {
      // Never land on a blank page waiting for input: the screen reads
      // the default range on entry (spec section 3).
      firstNight.value = localBusinessDate();
      lastNight.value = addDays(firstNight.value, DEFAULT_NIGHTS - 1);
      void applyRange();
    });

    return {
      firstNightPicker,
      lastNightPicker,
      deskDateFormat,
      datePlaceholder,
      firstNightAttrs,
      lastNightAttrs,
      rows,
      loading,
      listError,
      rangeError,
      notices,
      selectedRef,
      detail,
      detailError,
      emptySentence,
      applyRange,
      retryList,
      retryDetail,
      selectRow,
      stateLabel,
      guestCell,
      totalCell,
      rowActionLabel,
      roomTypeCell,
      roomCell,
      detailRoomCell,
      nightsBetween,
      formatDeskDate,
      formatVnd,
      t,
    };
  },
});
</script>
