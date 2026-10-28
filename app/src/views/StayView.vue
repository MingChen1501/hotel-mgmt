<template>
  <main data-testid="stay-view">
    <h1>{{ t('desk.stay.title', {}, 'Check guests in, move them, and check them out') }}</h1>
    <p>{{ t('desk.stay.intro', {}, 'Work from the lists: pick an arrival to check in, pick a stay to move or check out, then follow each section in order.') }}</p>
    <noscript><p>{{ t('desk.entry.noscript_stay', {}, 'This page needs JavaScript to run the stay lifecycle.') }}</p></noscript>

    <section data-testid="stay-main">
      <h2>{{ t('desk.stay.lists_heading', {}, 'Stay lists for the business date') }}</h2>
      <p>
        <span>{{ t('desk.today.business_date', {}, 'Business date: ') }}</span><strong data-testid="stay-business-date">{{ businessDate }}</strong>
        <Button
          id="stay-refresh-button"
          type="button"
          :label="t('desk.today.refresh', {}, 'Refresh')"
          data-testid="stay-refresh"
          @click="onRefresh"
        />
      </p>
      <p
        v-if="listsLoading"
        data-testid="stay-lists-loading"
      >
        {{ t('desk.stay.loading_lists', {}, 'Loading the stay lists…') }}
      </p>
      <Message
        v-if="listsError"
        severity="error"
        role="alert"
        data-testid="stay-lists-error"
      >
        {{ listsError }}
      </Message>

      <h3>{{ t('desk.stay.arrivals', {}, 'Arriving today') }}</h3>
      <DataTable
        id="stay-arrivals-table"
        :value="arrivalRows"
        data-testid="stay-arrivals-table"
      >
        <Column
          field="guestName"
          :header="t('desk.stay.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.stay.th_room', {}, 'Room')"
        />
        <Column
          field="timesText"
          :header="t('desk.stay.th_times', {}, 'Recorded times')"
        />
        <Column :header="t('desk.stay.th_action', {}, 'Action')">
          <template #body="slotProps">
            <Button
              v-if="slotProps.data.reservationRef"
              type="button"
              :label="t('desk.stay.use_arrival', {}, 'Use for check-in')"
              :data-testid="`stay-use-arrival-${slotProps.data.reservationRef}`"
              @click="pickArrival(slotProps.data.reservationRef)"
            />
          </template>
        </Column>
        <template #empty>
          {{ t('desk.today.empty_arrivals', {}, 'No arrivals today. New bookings appear here.') }}
        </template>
      </DataTable>

      <h3>{{ t('desk.stay.in_house', {}, 'In house') }}</h3>
      <DataTable
        id="stay-inhouse-table"
        :value="inHouseRows"
        data-testid="stay-inhouse-table"
      >
        <Column
          field="guestName"
          :header="t('desk.stay.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.stay.th_room', {}, 'Room')"
        />
        <Column
          field="timesText"
          :header="t('desk.stay.th_times', {}, 'Recorded times')"
        />
        <Column :header="t('desk.stay.th_action', {}, 'Action')">
          <template #body="slotProps">
            <Button
              v-if="slotProps.data.stayId"
              type="button"
              :label="t('desk.stay.use_stay', {}, 'Use this stay')"
              :data-testid="`stay-use-stay-${slotProps.data.stayId}`"
              @click="pickStay(slotProps.data)"
            />
          </template>
        </Column>
        <template #empty>
          {{ t('desk.today.empty_inhouse', {}, 'No guests in house right now.') }}
        </template>
      </DataTable>

      <h3>{{ t('desk.stay.departures', {}, 'Leaving today') }}</h3>
      <DataTable
        id="stay-departures-table"
        :value="departureRows"
        data-testid="stay-departures-table"
      >
        <Column
          field="guestName"
          :header="t('desk.stay.th_guest', {}, 'Guest')"
        />
        <Column
          field="roomLabel"
          :header="t('desk.stay.th_room', {}, 'Room')"
        />
        <Column
          field="timesText"
          :header="t('desk.stay.th_times', {}, 'Recorded times')"
        />
        <Column :header="t('desk.stay.th_action', {}, 'Action')">
          <template #body="slotProps">
            <Button
              v-if="slotProps.data.stayId"
              type="button"
              :label="t('desk.stay.use_stay', {}, 'Use this stay')"
              :data-testid="`stay-use-stay-${slotProps.data.stayId}`"
              @click="pickStay(slotProps.data)"
            />
          </template>
        </Column>
        <template #empty>
          {{ t('desk.today.empty_departures', {}, 'No departures today.') }}
        </template>
      </DataTable>

      <h2>{{ t('desk.stay.checkin_heading', {}, 'Check in an arrival') }}</h2>
      <div>
        <label for="stay-booking-ref">
          {{ t('desk.stay.booking_ref', {}, 'Booking reference: ') }}
          <InputText
            id="stay-booking-ref"
            v-model="bookingRef"
            name="booking-ref"
            autocomplete="off"
            data-testid="stay-booking-ref"
            @update:model-value="onBookingRefInput"
          />
        </label>
        <label for="stay-checkin-arrival">
          {{ t('desk.stay.actual_arrival', {}, 'Actual arrival (leave blank for now): ') }}
          <input
            id="stay-checkin-arrival"
            v-model="checkinArrival"
            name="checkin-arrival"
            type="datetime-local"
            data-testid="stay-checkin-arrival"
          >
        </label>
        <br>
        <label for="stay-checkin-room">
          {{ t('desk.stay.room_label', {}, 'Ready room: ') }}
          <select
            id="stay-checkin-room"
            v-model="checkinRoomId"
            data-testid="stay-checkin-room"
          >
            <option
              v-for="room in checkinCandidates"
              :key="room.roomId"
              :value="room.roomId"
            >
              {{ room.number }}
            </option>
          </select>
        </label>
        <Button
          id="stay-checkin-button"
          type="button"
          :label="t('desk.stay.checkin_button', {}, 'Check in')"
          data-testid="stay-checkin"
          :disabled="checkingIn"
          @click="onCheckIn"
        />
        <p
          v-if="checkingIn"
          data-testid="stay-checking-in"
        >
          {{ t('desk.stay.checking_in', {}, 'Checking the guest in…') }}
        </p>
        <p
          role="status"
          data-testid="stay-checkin-status"
        >
          {{ checkinStatus }}
        </p>
        <ReferenceDetails
          v-if="checkinDetails.length > 0"
          :items="checkinDetails"
          testid-prefix="stay-checkin-details"
        />
        <Message
          v-if="checkinError"
          severity="error"
          role="alert"
          data-testid="stay-checkin-error"
        >
          {{ checkinError }}
        </Message>
      </div>

      <h2>{{ t('desk.stay.move_heading', {}, 'Move a guest mid-stay') }}</h2>
      <div>
        <label for="stay-move-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <InputText
            id="stay-move-stay-id"
            v-model="moveStayId"
            name="move-stay-id"
            autocomplete="off"
            data-testid="stay-move-stay-id"
          />
        </label>
        <label for="stay-move-room">
          {{ t('desk.stay.target_room', {}, 'Move to room: ') }}
          <select
            id="stay-move-room"
            v-model="moveRoomId"
            data-testid="stay-move-room"
          >
            <option
              v-for="room in readyRooms"
              :key="room.roomId"
              :value="room.roomId"
            >
              {{ room.number }}
            </option>
          </select>
        </label>
        <Button
          id="stay-move-button"
          type="button"
          :label="t('desk.stay.move_button', {}, 'Move')"
          data-testid="stay-move"
          :disabled="moving"
          @click="onMove"
        />
        <p
          v-if="moving"
          data-testid="stay-moving"
        >
          {{ t('desk.stay.moving', {}, 'Moving the guest…') }}
        </p>
        <p
          role="status"
          data-testid="stay-move-status"
        >
          {{ moveStatus }}
        </p>
        <ReferenceDetails
          v-if="moveDetails.length > 0"
          :items="moveDetails"
          testid-prefix="stay-move-details"
        />
        <Message
          v-if="moveError"
          severity="error"
          role="alert"
          data-testid="stay-move-error"
        >
          {{ moveError }}
        </Message>
      </div>

      <h2>{{ t('desk.stay.times_heading', {}, 'Record early arrivals and late departures') }}</h2>
      <div>
        <label for="stay-times-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <InputText
            id="stay-times-stay-id"
            v-model="timesStayId"
            name="times-stay-id"
            autocomplete="off"
            data-testid="stay-times-stay-id"
          />
        </label>
        <label for="stay-times-arrival">
          {{ t('desk.stay.actual_arrival', {}, 'Actual arrival (leave blank for now): ') }}
          <input
            id="stay-times-arrival"
            v-model="timesArrival"
            name="times-arrival"
            type="datetime-local"
            data-testid="stay-times-arrival"
          >
        </label>
        <label for="stay-times-departure">
          {{ t('desk.stay.actual_departure', {}, 'Actual departure (leave blank for now): ') }}
          <input
            id="stay-times-departure"
            v-model="timesDeparture"
            name="times-departure"
            type="datetime-local"
            data-testid="stay-times-departure"
          >
        </label>
        <Button
          id="stay-times-button"
          type="button"
          :label="t('desk.stay.times_button', {}, 'Record times')"
          data-testid="stay-times"
          :disabled="recording"
          @click="onRecordTimes"
        />
        <p
          v-if="recording"
          data-testid="stay-recording"
        >
          {{ t('desk.stay.recording', {}, 'Recording the times…') }}
        </p>
        <p
          role="status"
          data-testid="stay-times-status"
        >
          {{ timesStatus }}
        </p>
        <ReferenceDetails
          v-if="timesDetails.length > 0"
          :items="timesDetails"
          testid-prefix="stay-times-details"
        />
        <Message
          v-if="timesError"
          severity="error"
          role="alert"
          data-testid="stay-times-error"
        >
          {{ timesError }}
        </Message>
      </div>

      <h2>{{ t('desk.stay.checkout_heading', {}, 'Check out with folio review') }}</h2>
      <div>
        <label for="stay-checkout-stay-id">
          {{ t('desk.stay.stay_id', {}, 'Stay ID: ') }}
          <InputText
            id="stay-checkout-stay-id"
            v-model="checkoutStayId"
            name="checkout-stay-id"
            autocomplete="off"
            data-testid="stay-checkout-stay-id"
            @update:model-value="onCheckoutStayInput"
          />
        </label>
        <label for="stay-checkout-departure">
          {{ t('desk.stay.actual_departure', {}, 'Actual departure (leave blank for now): ') }}
          <input
            id="stay-checkout-departure"
            v-model="checkoutDeparture"
            name="checkout-departure"
            type="datetime-local"
            data-testid="stay-checkout-departure"
          >
        </label>
        <Button
          id="stay-review-button"
          type="button"
          :label="t('desk.stay.review_button', {}, 'Review folio')"
          data-testid="stay-review"
          :disabled="reviewing"
          @click="onReview"
        />
        <p
          v-if="reviewing"
          data-testid="stay-reviewing"
        >
          {{ t('desk.stay.reviewing', {}, 'Reviewing the folio…') }}
        </p>
        <p
          role="status"
          data-testid="stay-folio-status"
        >
          {{ folioStatus }}
        </p>
        <ReferenceDetails
          v-if="checkoutDetails.length > 0"
          :items="checkoutDetails"
          testid-prefix="stay-checkout-details"
        />
        <div
          v-if="showApproval"
          data-testid="stay-approval-section"
        >
          <label for="stay-approval-by">
            {{ t('desk.stay.approved_by', {}, 'Approved by: ') }}
            <InputText
              id="stay-approval-by"
              v-model="approvalBy"
              name="approval-by"
              autocomplete="off"
              data-testid="stay-approval-by"
            />
          </label>
          <label for="stay-approval-role">
            {{ t('desk.stay.approver_role', {}, 'Approver role: ') }}
            <InputText
              id="stay-approval-role"
              v-model="approvalRole"
              name="approval-role"
              autocomplete="off"
              data-testid="stay-approval-role"
            />
          </label>
          <label for="stay-approval-reason">
            {{ t('desk.stay.approval_reason', {}, 'Reason (optional): ') }}
            <InputText
              id="stay-approval-reason"
              v-model="approvalReason"
              name="approval-reason"
              autocomplete="off"
              data-testid="stay-approval-reason"
            />
          </label>
          <Button
            id="stay-approve-button"
            type="button"
            :label="t('desk.stay.approve_button', {}, 'Record approval')"
            data-testid="stay-approve"
            :disabled="approving"
            @click="onApprove"
          />
          <p
            v-if="approving"
            data-testid="stay-approving"
          >
            {{ t('desk.stay.approving', {}, 'Recording the approval…') }}
          </p>
        </div>
        <Button
          id="stay-checkout-button"
          type="button"
          :label="t('desk.stay.checkout_button', {}, 'Check out')"
          data-testid="stay-checkout"
          :disabled="!canCheckOut || checkingOut"
          @click="checkoutDialog = true"
        />
        <Dialog
          v-model:visible="checkoutDialog"
          :header="t('desk.shell.checkout_confirm', {}, 'Check out this stay now?')"
          append-to="self"
          :modal="true"
          data-testid="stay-checkout-dialog"
        >
          <p>{{ t('desk.shell.checkout_detail', {}, 'The stay closes against the reviewed folio. Continue with check-out?') }}</p>
          <Button
            type="button"
            :label="t('desk.shell.cancel', {}, 'Cancel')"
            severity="secondary"
            data-testid="stay-checkout-cancel"
            @click="checkoutDialog = false"
          />
          <Button
            type="button"
            :label="t('desk.stay.checkout_button', {}, 'Check out')"
            :disabled="checkingOut"
            data-testid="stay-checkout-confirm"
            @click="onCheckOut"
          />
        </Dialog>
        <p
          v-if="checkingOut"
          data-testid="stay-checking-out"
        >
          {{ t('desk.stay.checking_out', {}, 'Checking the guest out…') }}
        </p>
        <p
          role="status"
          data-testid="stay-checkout-status"
        >
          {{ checkoutStatus }}
        </p>
        <Message
          v-if="checkoutError"
          severity="error"
          role="alert"
          data-testid="stay-checkout-error"
        >
          {{ checkoutError }}
        </Message>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';
import ReferenceDetails, { type ReferenceItem } from '../components/ReferenceDetails.vue';

// Stay screen as Vue SFCs (Refs #295, ADR-0003).
// Behavioural port of the inline script in `frontend/stay.html`
// (Screen 3: check in from a booking reference, mid-stay move,
// actual-time recording, and check-out behind the folio-balance
// gate). The legacy page is untouched and stays served in
// parallel; this view runs under `/app/` (`/app/stay`).
//
// Shared-migration contracts, same as the desk and book screens:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as the legacy `messages.js` helper in the page.
// - Errors switch on envelope codes, never on resolved wording.
// - Op order, same as the legacy page: AssignRoom (roomNumber,
//   businessDate, a client-generated stayId as stayLink) ->
//   CheckIn (stayId, reservationId and guestId from GetReservation,
//   roomId from the AssignRoom echo) -> CheckInReservation
//   (reservationRef, stayId); AssignRoom (target) -> MoveRoom;
//   RecordActualTimes; GetFolioBalance -> RecordOpenBalanceApproval
//   when the balance is open -> CheckOut carrying the reviewed
//   folio id, balance, and the recorded approval. Daily lists come
//   from ListArrivalsDepartures with guest names via GetGuest; room
//   numbers resolve through ListRoomsByState. The pickable arrival
//   rows are expected arrivals from the reservation calendar
//   (QueryCalendar plus a GetReservation read-back per due
//   reference, Refs #349) because stay rows never carry booking
//   references in production. Every mutating click
//   carries an in-flight guard plus a client-generated
//   idempotencyKey wherever the contract defines one (AssignRoom,
//   MoveRoom, RecordOpenBalanceApproval, CheckOut).

interface StayRow {
  stayId?: string;
  reservationRef?: string;
  guestId?: string;
  roomId?: string;
  actualArrival?: string | null;
  actualDeparture?: string | null;
}

interface StayListRow {
  key: string;
  guestName: string;
  roomLabel: string;
  timesText: string;
  reservationRef?: string;
  stayId?: string;
}

interface CalendarEntry {
  reservationRef?: string;
  roomTypeId?: string;
  arrivalDate?: string;
  departureDate?: string;
  state?: string;
}

interface ReservationReadback {
  reservationRef?: string;
  roomTypeId?: string;
  arrivalDate?: string;
  departureDate?: string;
  state?: string;
  guest?: { guestId?: string; fullName?: string };
}

interface RoomRecord {
  roomId: string;
  number: string;
  roomTypeId: string;
}

interface CheckoutContext {
  stayId: string;
  folioId: string;
  balanceMinor: number;
  approval: unknown;
}

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function nextDay(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1));
  next.setUTCDate(next.getUTCDate() + 1);
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function plainAmount(minor: number): string {
  return (minor / 100).toFixed(2);
}

function toISO(value: string): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

// Billing serves the recorded approval as a JSON string while the
// contract (contracts/openapi.yaml) types openBalanceApproval as
// an object, and the stay gate enforces the object shape: normalize
// stringly input at the boundary so check-out carries the contracted
// shape. Objects pass through untouched, so a contract-conforming
// backend behaves identically (Refs #338 acceptance: the approval
// check-out must work on the UI alone; backend fix tracked
// separately).
function normalizeApproval(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function newIdempotencyKey(): string {  try {
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
  name: 'StayView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Column, DataTable, Dialog, InputText, Message, ReferenceDetails },
  setup() {
    const session = useSessionStore();
    const businessDate = ref(localBusinessDate());
    const listsLoading = ref(false);
    const listsError = ref('');
    const arrivalRows = ref<StayListRow[]>([]);
    const inHouseRows = ref<StayListRow[]>([]);
    const departureRows = ref<StayListRow[]>([]);

    const roomNumbers = ref<Record<string, string>>({});
    const readyRooms = ref<RoomRecord[]>([]);
    // Room-type names (issue #372): one ListRoomTypes read fills
    // this map; typeName resolves the human name and falls back to
    // the generic label when the type is unknown, never the raw ID.
    const roomTypeNames = ref<Record<string, string>>({});
    // Exact record IDs stay hidden by default (issue #372 owner
    // amendment) and surface only in these per-section reference
    // details, opened when verification is needed.
    const checkinDetails = ref<ReferenceItem[]>([]);
    const moveDetails = ref<ReferenceItem[]>([]);
    const timesDetails = ref<ReferenceItem[]>([]);
    const checkoutDetails = ref<ReferenceItem[]>([]);
    const checkinCandidates = ref<RoomRecord[]>([]);
    const checkinRooms = ref<Record<string, string>>({});
    const checkinRef = ref<string | null>(null);

    const bookingRef = ref('');
    const checkinArrival = ref('');
    const checkinRoomId = ref('');
    const checkinStatus = ref('');
    const checkinError = ref('');
    const checkingIn = ref(false);

    const moveStayId = ref('');
    const moveRoomId = ref('');
    const moveStatus = ref('');
    const moveError = ref('');
    const moving = ref(false);

    const timesStayId = ref('');
    const timesArrival = ref('');
    const timesDeparture = ref('');
    const timesStatus = ref('');
    const timesError = ref('');
    const recording = ref(false);

    const checkoutStayId = ref('');
    const checkoutDeparture = ref('');
    const folioStatus = ref('');
    const checkoutStatus = ref('');
    const checkoutError = ref('');
    const reviewing = ref(false);
    const approving = ref(false);
    const checkingOut = ref(false);
    const checkoutDialog = ref(false);
    const showApproval = ref(false);
    const approvalBy = ref('');
    const approvalRole = ref('');
    const approvalReason = ref('');
    const checkoutCtx = ref<CheckoutContext | null>(null);

    const canCheckOut = computed(
      () =>
        checkoutCtx.value !== null &&
        (checkoutCtx.value.balanceMinor === 0 || checkoutCtx.value.approval !== null),
    );

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      checkoutCtx.value = null;
      session.expireSession();
    }

    function typeName(roomTypeId: string | undefined): string {
      if (roomTypeId && roomTypeNames.value[roomTypeId]) {
        return roomTypeNames.value[roomTypeId];
      }
      return t('desk.today.room_type_unresolved', {}, 'Room type');
    }

    // Booked-type status with the human name when the catalogue
    // knows it (issue #372), else the generic on-file label —
    // never the raw type UUID.
    function bookedTypeStatus(roomTypeId: string): string {
      const name = roomTypeNames.value[roomTypeId];
      if (name) {
        return t(
          'desk.stay.booked_type_named',
          { type: name },
          `Booked: ${name}. Pick a ready room of that type below.`,
        );
      }
      return t(
        'desk.stay.booked_type_unknown',
        {},
        'Booked room type on file. Pick a ready room of that type below.',
      );
    }

    async function loadRoomTypeNames(): Promise<void> {
      try {
        const listed = await apiFetch<{ roomTypes?: Array<{ id: string; name: string }> }>(
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
        // The generic type label covers a failed read (Refs #372):
        // rows never render the raw type UUID.
        if (isSignedOut(err)) {
          throw err;
        }
      }
    }

    // Check-out status names the guest when the stay is on
    // screen (issue #372), else the bare balance line — the exact
    // stay ID and invoice ref live in the section reference
    // details either way.
    function checkedOutStatus(stayId: string, balanceMinor: number): string {
      const guestName = guestNameForStay(stayId);
      const balance = plainAmount(balanceMinor);
      if (guestName) {
        return t(
          'desk.stay.checked_out_named',
          { guestName, balance },
          `Checked out for ${guestName}; invoice balance ${balance}.`,
        );
      }
      return t(
        'desk.stay.checked_out_brief',
        { balance },
        `Checked out; invoice balance ${balance}.`,
      );
    }

    // Recorded-times status names the guest when the stay is
    // on screen (issue #372), else the bare kept line — the exact
    // stay ID lives in the section reference details either way.
    function recordedTimesStatus(stayId: string, times: string): string {
      const guestName = guestNameForStay(stayId);
      if (guestName) {
        return t(
          'desk.stay.times_kept_named',
          { guestName, times },
          `Recorded times kept for ${guestName} (${times}).`,
        );
      }
      return t(
        'desk.stay.times_kept_brief',
        { times },
        `Recorded times kept (${times}).`,
      );
    }

    // Guest name for a stay from already-fetched list data (the
    // #371 pattern: no extra calls); empty when the stay is not on
    // screen, e.g. a hand-typed ID.
    function guestNameForStay(stayId: string): string {
      for (const row of [...arrivalRows.value, ...inHouseRows.value, ...departureRows.value]) {
        if (row.stayId === stayId) {
          return row.guestName;
        }
      }
      return '';
    }

    function roomLabel(roomId: string | undefined): string {
      if (!roomId) {
        return t('desk.today.not_assigned', {}, 'Not assigned');
      }
      const number = roomNumbers.value[roomId];
      if (number) {
        return number;
      }
      return t('desk.today.room_unknown', {}, 'Room number unavailable');
    }

    function timesLine(arrival: string | null | undefined, departure: string | null | undefined): string {
      if (!arrival && !departure) {
        return t('desk.stay.times_empty', {}, 'No times recorded yet.');
      }
      return t(
        'desk.stay.times_line',
        { actualArrival: arrival ?? '', actualDeparture: departure ?? '' },
        `Arrived ${arrival ?? '-'}, leaving ${departure ?? '-'}.`,
      );
    }

    async function resolveGuestName(guestId: string | undefined): Promise<string> {
      if (!guestId) {
        return t('desk.today.unknown_guest', {}, 'Unknown guest');
      }
      try {
        const guest = await apiFetch<{ fullName?: string }>('/v1/guests/GetGuest', {
          method: 'POST',
          body: JSON.stringify({ guestId }),
        });
        return guest.fullName ?? t('desk.today.unknown_guest', {}, 'Unknown guest');
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return t('desk.today.unknown_guest', {}, 'Unknown guest');
      }
    }

    // Expected arrivals (AC-FDK-5, BR-6) come from the
    // reservation calendar: confirmed bookings due on the
    // business date. The stay lists never carry booking
    // references in production (stay rows hold only
    // reservationId UUIDs), so the "Use for check-in" pick
    // buttons render from these reference-backed rows instead
    // (Refs #349). Every row is verified through GetReservation,
    // so a rendered pick always fills a live reference; a
    // calendar outage degrades to the stay lists plus the
    // typed-ref path rather than failing them.
    async function fetchExpectedArrivals(businessDateValue: string): Promise<StayListRow[]> {
      let entries: CalendarEntry[];
      try {
        const calendar = await apiFetch<{ reservations?: CalendarEntry[] }>(
          '/v1/reservations/QueryCalendar',
          {
            method: 'POST',
            body: JSON.stringify({ dateFrom: businessDateValue, dateTo: nextDay(businessDateValue) }),
          },
        );
        entries = calendar.reservations ?? [];
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        return [];
      }
      const due = entries.filter(
        (entry) =>
          entry.arrivalDate === businessDateValue &&
          entry.state === 'confirmed' &&
          typeof entry.reservationRef === 'string' &&
          entry.reservationRef !== '',
      );
      const rows: StayListRow[] = [];
      for (const entry of due) {
        const ref = String(entry.reservationRef);
        try {
          const booking = await apiFetch<ReservationReadback>('/v1/reservations/GetReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: ref }),
          });
          if (booking.state !== undefined && booking.state !== 'confirmed') {
            continue;
          }
          const fullName = booking.guest?.fullName;
          const guestId = booking.guest?.guestId;
          const guestName = fullName
            ?? (guestId ? await resolveGuestName(guestId) : t('desk.today.unknown_guest', {}, 'Unknown guest'));
          const roomTypeId = booking.roomTypeId ?? entry.roomTypeId ?? '';
          rows.push({
            key: ref,
            guestName,
            roomLabel: roomTypeId
              ? typeName(roomTypeId)
              : t('desk.today.not_assigned', {}, 'Not assigned'),
            timesText: t('desk.stay.times_empty', {}, 'No times recorded yet.'),
            reservationRef: ref,
          });
        } catch (err) {
          if (isSignedOut(err)) {
            throw err;
          }
        }
      }
      return rows;
    }

    async function renderRows(rows: StayRow[], kind: 'arrival' | 'stay'): Promise<StayListRow[]> {
      return Promise.all(
        rows.map(async (row, index) => {
          const guestName = await resolveGuestName(row.guestId);
          return {
            key: row.stayId ?? row.reservationRef ?? `${kind}-${index}`,
            guestName,
            roomLabel: roomLabel(row.roomId),
            timesText: timesLine(row.actualArrival, row.actualDeparture),
            reservationRef: row.reservationRef,
            stayId: row.stayId,
          };
        }),
      );
    }

    async function refreshLists(): Promise<void> {
      businessDate.value = localBusinessDate();
      listsError.value = '';
      listsLoading.value = true;
      try {
        const lists = await apiFetch<{
          arrivals?: StayRow[];
          inHouse?: StayRow[];
          departures?: StayRow[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate: businessDate.value }),
        });
        // Room numbers for every list (Refs #370): stay rows
        // carry room UUIDs, so every housekeeping state is read to
        // map each room ID to its human number.
        const numbers: Record<string, string> = {};
        const ready: RoomRecord[] = [];
        for (const state of ['vacant-dirty', 'vacant-clean', 'vacant-inspected', 'occupied', 'out-of-order']) {
          const listed = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state }) },
          );
          for (const room of listed.rooms ?? []) {
            numbers[room.roomId] = room.number;
            if (state === 'vacant-inspected') {
              ready.push(room);
            }
          }
        }
        readyRooms.value = ready;
        roomNumbers.value = numbers;
        await loadRoomTypeNames();
        arrivalRows.value = [...(await fetchExpectedArrivals(businessDate.value)), ...(await renderRows(lists.arrivals ?? [], 'arrival'))];
        inHouseRows.value = await renderRows(lists.inHouse ?? [], 'stay');
        departureRows.value = await renderRows(lists.departures ?? [], 'stay');
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        listsError.value = errorMessage();
      } finally {
        listsLoading.value = false;
      }
    }

    function pickArrival(reservationRef: string | undefined): void {
      if (reservationRef) {
        bookingRef.value = reservationRef;
        checkinRef.value = null;
        checkinStatus.value = '';
        checkinError.value = '';
      } else {
        checkinStatus.value = t('desk.stay.need_ref', {}, 'Enter the booking reference first.');
      }
    }

    function pickStay(row: StayListRow | undefined): void {
      const stayId = row?.stayId;
      if (!stayId) {
        return;
      }
      moveStayId.value = stayId;
      timesStayId.value = stayId;
      checkoutStayId.value = stayId;
      checkoutCtx.value = null;
      moveDetails.value = [{ label: 'Stay ID', value: stayId }];
      timesDetails.value = [{ label: 'Stay ID', value: stayId }];
      // A new working stay invalidates the previous review: drop
      // its reference details with it (issue #372).
      checkoutDetails.value = [];
      showApproval.value = false;
      moveStatus.value = t(
        'desk.stay.stay_ready_named',
        { guestName: row?.guestName ?? '', roomLabel: row?.roomLabel ?? '' },
        `Working with ${row?.guestName ?? ''} (${row?.roomLabel ?? ''}).`,
      );
      timesStatus.value = '';
      checkoutStatus.value = '';
      checkoutError.value = '';
    }

    function onBookingRefInput(): void {
      checkinRef.value = null;
    }

    function onCheckoutStayInput(): void {
      checkoutCtx.value = null;
      showApproval.value = false;
      checkoutStatus.value = '';
      checkoutError.value = '';
    }

    function onRefresh(): Promise<void> {
      return refreshLists();
    }

    onMounted(() => {
      // The shell gates this screen on sign-in, so a signed-in
      // visit loads the lists straight away (same as the desk
      // screen); signed-out visits never reach this view.
      if (session.isSignedIn) {
        void refreshLists();
      }
    });

    async function onCheckIn(): Promise<void> {
      if (checkingIn.value) {
        return;
      }
      checkinError.value = '';
      const refValue = bookingRef.value.trim();
      if (!refValue) {
        checkinStatus.value = t('desk.stay.need_ref', {}, 'Enter the booking reference first.');
        return;
      }
      // First click loads the booking and the ready rooms of the
      // booked type into the picker (the quote step of the booking
      // form); the second click commits the check-in.
      if (checkinRef.value !== refValue) {
        checkingIn.value = true;
        try {
          let booking: { roomTypeId: string };
          try {
            booking = await apiFetch<{ roomTypeId: string }>('/v1/reservations/GetReservation', {
              method: 'POST',
              body: JSON.stringify({ reservationRef: refValue }),
            });
          } catch (err) {
            if (isSignedOut(err)) {
              expireToGate();
              return;
            }
            if (errorCode(err) === 'NOT_FOUND') {
              checkinError.value = t(
                'desk.stay.refused_unknown_ref',
                {},
                'Unknown booking reference. Check the reference and try again.',
              );
              return;
            }
            checkinError.value = errorMessage();
            return;
          }
          const rooms = await apiFetch<{ rooms?: RoomRecord[] }>(
            '/v1/rooms/ListRoomsByState',
            { method: 'POST', body: JSON.stringify({ state: 'vacant-inspected' }) },
          );
          const candidates = (rooms.rooms ?? []).filter(
            (room) => room.roomTypeId === booking.roomTypeId,
          );
          if (candidates.length === 0) {
            checkinStatus.value = bookedTypeStatus(booking.roomTypeId);
            checkinError.value = t(
              'desk.stay.no_ready_rooms',
              {},
              'No ready rooms of the booked type right now.',
            );
            return;
          }
          checkinRef.value = refValue;
          const roomsById: Record<string, string> = {};
          candidates.forEach((room) => {
            roomsById[room.roomId] = room.number;
            roomNumbers.value[room.roomId] = room.number;
          });
          checkinRooms.value = roomsById;
          checkinCandidates.value = candidates;
          checkinRoomId.value = '';
          checkinStatus.value = bookedTypeStatus(booking.roomTypeId);
          checkinError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          checkinError.value = errorMessage();
        } finally {
          checkingIn.value = false;
        }
        return;
      }
      const selectedRoomId = checkinRoomId.value;
      if (!selectedRoomId || !checkinRooms.value[selectedRoomId]) {
        checkinError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        return;
      }
      checkingIn.value = true;
      try {
        const stayId = newIdempotencyKey();
        let assigned: { roomId: string; roomNumber: string };
        try {
          assigned = await apiFetch<{ roomId: string; roomNumber: string }>(
            '/v1/rooms/AssignRoom',
            {
              method: 'POST',
              body: JSON.stringify({
                roomNumber: checkinRooms.value[selectedRoomId],
                businessDate: localBusinessDate(),
                stayLink: stayId,
                actor: session.displayName ?? '',
                idempotencyKey: newIdempotencyKey(),
              }),
            },
          );
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          if (errorCode(err) === 'CONFLICT') {
            checkinRef.value = null;
            checkinError.value = t(
              'desk.stay.refused_taken',
              {},
              'That room was just taken. Pick another ready room.',
            );
            return;
          }
          checkinError.value = errorMessage();
          return;
        }
        let readback: { reservationId: string; guest?: { guestId?: string } };
        try {
          readback = await apiFetch<{
            reservationId: string;
            guest?: { guestId?: string };
          }>('/v1/reservations/GetReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          checkinError.value = errorMessage();
          return;
        }
        const checkinBody: Record<string, unknown> = {
          stayId,
          reservationId: readback.reservationId,
          guestId: readback.guest?.guestId ?? null,
          roomId: assigned.roomId,
          actor: session.displayName ?? '',
        };
        const actualArrival = toISO(checkinArrival.value);
        if (actualArrival) {
          checkinBody.actualArrival = actualArrival;
        }
        try {
          await apiFetch<unknown>('/v1/stay/CheckIn', {
            method: 'POST',
            body: JSON.stringify(checkinBody),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          if (errorCode(err) === 'CONFLICT') {
            checkinError.value = t(
              'desk.stay.refused_checked_in',
              {},
              'That booking is already checked in.',
            );
            return;
          }
          checkinError.value = errorMessage();
          return;
        }
        try {
          await apiFetch<unknown>('/v1/reservations/CheckInReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue, stayId, actor: session.displayName ?? '' }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          checkinError.value = errorMessage();
          return;
        }
        checkinStatus.value = t(
          'desk.stay.checked_in_named',
          { ref: refValue, roomNumber: assigned.roomNumber },
          `Checked in for booking ${refValue} in room ${assigned.roomNumber}.`,
        );
        checkinDetails.value = [{ label: 'Stay ID', value: stayId }];
        bookingRef.value = '';
        checkinArrival.value = '';
        checkinRef.value = null;
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        checkinError.value = errorMessage();
      } finally {
        checkingIn.value = false;
      }
    }

    async function onMove(): Promise<void> {
      if (moving.value) {
        return;
      }
      moveError.value = '';
      const stayId = moveStayId.value.trim();
      if (!stayId) {
        moveStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const toRoomId = moveRoomId.value;
      if (!toRoomId) {
        moveError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        return;
      }
      let fromRoomId: string | null = null;
      try {
        const current = await apiFetch<{ inHouse?: StayRow[] }>(
          '/v1/stay/ListArrivalsDepartures',
          { method: 'POST', body: JSON.stringify({ businessDate: localBusinessDate() }) },
        );
        (current.inHouse ?? []).forEach((row) => {
          if (row.stayId === stayId) {
            fromRoomId = row.roomId ?? null;
          }
        });
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        moveError.value = errorMessage();
        return;
      }
      moving.value = true;
      try {
        const target = readyRooms.value.filter((room) => room.roomId === toRoomId)[0];
        const assigned = await apiFetch<{ roomId: string; roomNumber: string }>(
          '/v1/rooms/AssignRoom',
          {
            method: 'POST',
            body: JSON.stringify({
              roomNumber: target ? target.number : toRoomId,
              businessDate: localBusinessDate(),
              stayLink: stayId,
              actor: session.displayName ?? '',
              idempotencyKey: newIdempotencyKey(),
            }),
          },
        );
        const moved = await apiFetch<{ move: { movedAt: string } }>('/v1/stay/MoveRoom', {
          method: 'POST',
          body: JSON.stringify({
            stayId,
            toRoomId: assigned.roomId,
            actor: session.displayName ?? '',
            idempotencyKey: newIdempotencyKey(),
          }),
        });
        roomNumbers.value[assigned.roomId] = assigned.roomNumber;
        const fromNumber = fromRoomId
          ? roomLabel(fromRoomId)
          : t('desk.today.not_assigned', {}, 'Not assigned');
        moveStatus.value = t(
          'desk.stay.moved',
          { fromRoom: fromNumber, toRoom: assigned.roomNumber, movedAt: moved.move.movedAt },
          `Moved from room ${fromNumber} to room ${assigned.roomNumber} at ${moved.move.movedAt}.`,
        );
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'CONFLICT') {
          moveError.value = t(
            'desk.stay.refused_taken',
            {},
            'That room was just taken. Pick another ready room.',
          );
          await refreshLists();
          return;
        }
        moveError.value = errorMessage();
      } finally {
        moving.value = false;
      }
    }

    async function onRecordTimes(): Promise<void> {
      if (recording.value) {
        return;
      }
      timesError.value = '';
      const stayId = timesStayId.value.trim();
      if (!stayId) {
        timesStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const actualArrival = toISO(timesArrival.value);
      const actualDeparture = toISO(timesDeparture.value);
      if (!actualArrival && !actualDeparture) {
        timesStatus.value = t(
          'desk.stay.need_times',
          {},
          'Enter an arrival or a departure time first.',
        );
        return;
      }
      recording.value = true;
      try {
        const timesBody: Record<string, unknown> = { stayId, actor: session.displayName ?? '' };
        if (actualArrival) {
          timesBody.actualArrival = actualArrival;
        }
        if (actualDeparture) {
          timesBody.actualDeparture = actualDeparture;
        }
        const recorded = await apiFetch<{ actualArrival?: string | null; actualDeparture?: string | null }>(
          '/v1/stay/RecordActualTimes',
          { method: 'POST', body: JSON.stringify(timesBody) },
        );
        timesStatus.value = recordedTimesStatus(
          stayId,
          timesLine(recorded.actualArrival, recorded.actualDeparture),
        );
        timesDetails.value = [{ label: 'Stay ID', value: stayId }];
        timesArrival.value = '';
        timesDeparture.value = '';
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        timesError.value = errorMessage();
      } finally {
        recording.value = false;
      }
    }

    async function onReview(): Promise<void> {
      if (reviewing.value) {
        return;
      }
      checkoutError.value = '';
      const stayId = checkoutStayId.value.trim();
      if (!stayId) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      reviewing.value = true;
      try {
        const folio = await apiFetch<{
          folioId: string;
          balanceMinor: number;
          openBalanceApproval?: unknown;
        }>('/v1/billing/GetFolioBalance', {
          method: 'POST',
          body: JSON.stringify({ stayId, actor: session.displayName ?? '' }),
        });
        checkoutCtx.value = {
          stayId,
          folioId: folio.folioId,
          balanceMinor: folio.balanceMinor,
          approval: normalizeApproval(folio.openBalanceApproval),
        };
        folioStatus.value = t(
          'desk.stay.folio_balance',
          { balance: plainAmount(folio.balanceMinor) },
          `Folio balance: ${plainAmount(folio.balanceMinor)}.`,
        );
        checkoutDetails.value = [
          { label: 'Stay ID', value: stayId },
          { label: 'Folio ID', value: folio.folioId },
        ];
        if (folio.balanceMinor === 0) {
          showApproval.value = false;
          checkoutStatus.value = t(
            'desk.stay.balance_zero',
            {},
            'The balance is zero. Check-out is clear.',
          );
        } else if (folio.openBalanceApproval) {
          showApproval.value = false;
          checkoutStatus.value = t(
            'desk.stay.approval_recorded_brief',
            {},
            'Approval recorded.',
          );
        } else {
          showApproval.value = true;
          checkoutError.value = t(
            'desk.stay.refused_open_balance',
            {},
            'The folio still has an open balance, so check-out is refused and the stay remains in house. Record an approval first.',
          );
        }
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        checkoutError.value = errorMessage();
      } finally {
        reviewing.value = false;
      }
    }

    async function onApprove(): Promise<void> {
      if (approving.value) {
        return;
      }
      checkoutError.value = '';
      if (!checkoutCtx.value) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      const approvedBy = approvalBy.value.trim();
      const approverRole = approvalRole.value.trim();
      if (!approvedBy || !approverRole) {
        checkoutError.value = t(
          'desk.stay.need_approver',
          {},
          'Enter the approver name and role first.',
        );
        return;
      }
      approving.value = true;
      try {
        const approvalBody: Record<string, unknown> = {
          stayId: checkoutCtx.value.stayId,
          approvedBy,
          role: approverRole,
          actor: session.displayName ?? '',
          idempotencyKey: newIdempotencyKey(),
        };
        const reason = approvalReason.value.trim();
        if (reason) {
          approvalBody.reason = reason;
        }
        const recorded = await apiFetch<{
          openBalanceApproval: unknown;
          balanceMinor: number;
        }>('/v1/billing/RecordOpenBalanceApproval', {
          method: 'POST',
          body: JSON.stringify(approvalBody),
        });
        checkoutCtx.value.approval = normalizeApproval(recorded.openBalanceApproval);
        checkoutCtx.value.balanceMinor = recorded.balanceMinor;
        checkoutStatus.value = t(
          'desk.stay.approval_recorded_brief',
          {},
          'Approval recorded.',
        );
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        checkoutError.value = errorMessage();
      } finally {
        approving.value = false;
      }
    }

    async function onCheckOut(): Promise<void> {
      if (checkingOut.value) {
        return;
      }
      checkoutError.value = '';
      if (!checkoutCtx.value) {
        checkoutStatus.value = t('desk.stay.need_stay', {}, 'Choose a stay from the lists first.');
        return;
      }
      checkingOut.value = true;
      try {
        const folio = await apiFetch<{
          folioId: string;
          balanceMinor: number;
          openBalanceApproval?: unknown;
        }>('/v1/billing/GetFolioBalance', {
          method: 'POST',
          body: JSON.stringify({ stayId: checkoutCtx.value.stayId, actor: session.displayName ?? '' }),
        });
        const approval = normalizeApproval(folio.openBalanceApproval) ??
          checkoutCtx.value.approval ?? null;
        const checkoutBody: Record<string, unknown> = {
          stayId: checkoutCtx.value.stayId,
          folioId: folio.folioId,
          folioBalanceMinor: folio.balanceMinor,
          actor: session.displayName ?? '',
          idempotencyKey: newIdempotencyKey(),
        };
        if (approval) {
          checkoutBody.openBalanceApproval = approval;
        }
        const actualDeparture = toISO(checkoutDeparture.value);
        if (actualDeparture) {
          checkoutBody.actualDeparture = actualDeparture;
        }
        const closed = await apiFetch<{ stayId: string; invoiceRef: string }>(
          '/v1/stay/CheckOut',
          { method: 'POST', body: JSON.stringify(checkoutBody) },
        );
        checkoutStatus.value = checkedOutStatus(closed.stayId, folio.balanceMinor);
        checkoutDetails.value = [
          { label: 'Stay ID', value: closed.stayId },
          { label: 'Invoice ref', value: closed.invoiceRef },
        ];
        // The checked-out stay leaves the folio context behind: the
        // next review starts from a fresh stay.
        checkoutCtx.value = null;
        showApproval.value = false;
        checkoutStayId.value = '';
        checkoutDeparture.value = '';
        folioStatus.value = '';
        await refreshLists();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'SETTLEMENT_REQUIRED') {
          showApproval.value = true;
          checkoutError.value = t(
            'desk.stay.refused_open_balance',
            {},
            'The folio still has an open balance, so check-out is refused and the stay remains in house. Record an approval first.',
          );
          return;
        }
        // The second close of an already-closed stay is refused
        // STATE_ILLEGAL: name the closed stay instead of the raw
        // envelope (Refs #365).
        if (errorCode(err) === 'STATE_ILLEGAL') {
          checkoutError.value = t(
            'desk.stay.refused_already_closed',
            {},
            'That stay is already checked out, so closing it again is refused.',
          );
          return;
        }
        checkoutError.value = errorMessage();
      } finally {
        checkingOut.value = false;
        checkoutDialog.value = false;
      }
    }

    return {
      t,
      businessDate,
      listsLoading,
      listsError,
      arrivalRows,
      inHouseRows,
      departureRows,
      readyRooms,
      checkinCandidates,
      bookingRef,
      checkinArrival,
      checkinRoomId,
      checkinStatus,
      checkinError,
      checkingIn,
      checkinDetails,
      moveStayId,
      moveRoomId,
      moveStatus,
      moveError,
      moving,
      moveDetails,
      timesStayId,
      timesArrival,
      timesDeparture,
      timesStatus,
      timesError,
      recording,
      timesDetails,
      checkoutStayId,
      checkoutDeparture,
      folioStatus,
      checkoutStatus,
      checkoutError,
      checkoutDetails,
      reviewing,
      approving,
      checkingOut,
      showApproval,
      approvalBy,
      approvalRole,
      approvalReason,
      canCheckOut,
      checkoutDialog,
      pickArrival,
      pickStay,
      onBookingRefInput,
      onCheckoutStayInput,
      onRefresh,
      onCheckIn,
      onMove,
      onRecordTimes,
      onReview,
      onApprove,
      onCheckOut,
    };
  },
});
</script>
