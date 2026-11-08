<template>
  <main data-testid="stay-view">
    <!-- Stay screen (Refs #541, `docs/design/Stay.dc.html:3`): the v2
      board carries no screen title or intro, so the view opens
      directly on the two-panel grid — check-in left, check-out
      right — with no lists, move, or times sections (zero extras
      vs the board). The lists read still runs underneath to feed
      both selects; the review-to-checkout flow state below the
      check-out panel stays as today (post-review states with no
      design counterpart). -->
    <noscript><p>{{ t('desk.entry.noscript_stay', {}, 'This page needs JavaScript to run the stay lifecycle.') }}</p></noscript>

    <div
      data-testid="stay-panels"
      class="stay-panels"
    >
      <Card data-testid="stay-checkin-card">
        <template #title>
          <h3 class="stay-card-title">
            {{ t('desk.stay.checkin_heading', {}, 'Check in') }}
          </h3>
        </template>
        <template #content>
          <label for="stay-checkin-arrival">
            {{ t('desk.stay.arriving_label', {}, 'Arriving guest') }}
            <select
              id="stay-checkin-arrival"
              v-model="arrivalRef"
              data-testid="stay-checkin-arrival"
              @change="onArrivalChange"
            >
              <option value="">
                {{ t('desk.stay.choose_arrival', {}, 'Choose an arrival...') }}
              </option>
              <option
                v-for="row in checkinOptions"
                :key="row.key"
                :value="row.reservationRef"
              >
                {{ row.guestName }} · {{ row.reservationRef }}
              </option>
            </select>
          </label>
          <label for="stay-checkin-room">
            {{ t('desk.stay.room_choice', {}, 'Room') }}
            <select
              id="stay-checkin-room"
              v-model="checkinRoomId"
              data-testid="stay-checkin-room"
            >
              <option value="">
                {{ t('desk.stay.choose_room', {}, 'Choose a room...') }}
              </option>
              <option
                v-for="room in checkinCandidates"
                :key="room.roomId"
                :value="room.roomId"
              >
                {{ room.number }}
              </option>
            </select>
          </label>
          <!-- Room-picker hint (Refs #541, `docs/design/Stay.dc.html:3`:
            the board's amber `color:#8A4B08;font-size:14px` note;
            copy unchanged). -->
          <p
            v-if="checkinRoomId === ''"
            class="stay-hint-amber"
            data-testid="stay-checkin-room-hint"
          >
            {{ t('desk.stay.room_hint', {}, 'Choose a ready room first.') }}
          </p>
          <Button
            id="stay-checkin-button"
            type="button"
            class="stay-action"
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
        </template>
      </Card>

      <Card data-testid="stay-checkout-card">
        <template #title>
          <h3 class="stay-card-title">
            {{ t('desk.stay.checkout_heading', {}, 'Check out') }}
          </h3>
        </template>
        <template #content>
          <label for="stay-checkout-stay">
            {{ t('desk.stay.departing_label', {}, 'Departing guest') }}
            <select
              id="stay-checkout-stay"
              v-model="checkoutStayId"
              data-testid="stay-checkout-stay"
              @change="onDepartureChange"
            >
              <option value="">
                {{ t('desk.stay.choose_departure', {}, 'Choose a departing guest...') }}
              </option>
              <option
                v-for="row in checkoutOptions"
                :key="row.key"
                :value="row.stayId"
              >
                {{ row.guestName }} · {{ row.roomLabel }}
              </option>
            </select>
          </label>
          <!-- Reviewer select (issue #567; #563 audit `G-ST-1`): the
            board draws `Người duyệt` as a prefilled text input
            (`Quản lý ca`, `docs/design/Stay.dc.html:3`); the panel
            deliberately diverges and offers the catalogue-defined role
            list instead of free text, still sending the selected role
            string as `approvedBy`. -->
          <label for="stay-approval-by">
            {{ t('desk.stay.approved_by', {}, 'Reviewer') }}
            <select
              id="stay-approval-by"
              v-model="approvalBy"
              name="approval-by"
              data-testid="stay-approval-by"
            >
              <option
                v-for="role in reviewerRoleOptions"
                :key="role.value"
                :value="role.value"
              >
                {{ role.label }}
              </option>
            </select>
          </label>
          <!-- Folio-reconciliation hint (Refs #541,
            `docs/design/Stay.dc.html:3`: `font-size:14px;
            color:#4B5D5B`; copy unchanged). -->
          <p
            class="stay-hint"
            data-testid="stay-checkout-gate-note"
          >
            {{ t('desk.stay.checkout_gate_note', {}, 'The folio must be fully paid before check-out.') }}
          </p>
          <Button
            id="stay-review-button"
            type="button"
            class="stay-action"
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
          <!-- Post-review flow state (Refs #541): the approval
            form, check-out button, and confirm dialog carry no
            board counterpart and keep their current presentation
            and copy, exactly like the v1 flow-state blocks. -->
          <div
            v-if="showApproval"
            data-testid="stay-approval-section"
          >
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
              class="stay-action"
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
            v-if="checkoutCtx"
            id="stay-checkout-button"
            type="button"
            class="stay-action"
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
              class="stay-action"
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
        </template>
      </Card>
    </div>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';
import ReferenceDetails, { type ReferenceItem } from '../components/ReferenceDetails.vue';

// Stay screen as Vue SFCs (Refs #295, ADR-0003).
//
// Behavioural port of the inline script in `frontend/stay.html`
// (Screen 3: check in from an arrival pick, folio-gated
// check-out). The legacy page is untouched and stays served in
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
//   (reservationRef, stayId); GetFolioBalance ->
//   RecordOpenBalanceApproval when the balance is open -> CheckOut
//   carrying the reviewed folio id, balance, and the recorded
//   approval. The arrival pick comes from the reservation calendar
//   (QueryCalendar plus a GetReservation read-back per due
//   reference, Refs #349) because stay rows never carry booking
//   references in production; the departing pick comes from the
//   in-house and departures stay lists with guest names via
//   GetGuest. Every mutating click carries an in-flight guard plus
//   a client-generated idempotencyKey wherever the contract
//   defines one (AssignRoom, RecordOpenBalanceApproval, CheckOut).
//
// Design rebuild (Refs #541, `docs/design/Stay.dc.html:3`): the
// two-panel v2 board — check-in (arrival select, room select, the
// amber pick-a-ready-room note, check-in button) beside check-out
// (departing-guest select, reviewer role select, the muted
// fully-paid gate note, review-folio button) on the `1fr 1fr` grid.
// The reviewer select (issue #567; #563 audit `G-ST-1`) offers the
// catalogue-defined roles and keeps sending the selected role string
// as `approvedBy`. The pre-v2 lists, move, and actual-times sections
// are gone (zero extras vs the board); panel data still reads through
// the same list endpoints. The review-to-checkout flow state (folio
// status, approval form, check-out button, confirm dialog) carries no
// board counterpart and keeps its current presentation and copy.
// PrimeVue stays as logic carrier only. No call-order change.

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
  components: { Button, Card, Dialog, InputText, Message, ReferenceDetails },
  setup() {
    const session = useSessionStore();
    // Panel rows: arrivals with booking references feed the
    // check-in arrival select; in-house plus departures feed the
    // departing-guest select. Guest names resolve via GetGuest
    // and room numbers through ListRoomsByState, same as before.
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
    const checkoutDetails = ref<ReferenceItem[]>([]);
    const checkinCandidates = ref<RoomRecord[]>([]);
    const checkinRooms = ref<Record<string, string>>({});
    const checkinRef = ref<string | null>(null);

    const arrivalRef = ref('');
    const checkinRoomId = ref('');
    const checkinStatus = ref('');
    const checkinError = ref('');
    const checkingIn = ref(false);

    const checkoutStayId = ref('');
    const folioStatus = ref('');
    const checkoutStatus = ref('');
    const checkoutError = ref('');
    const reviewing = ref(false);
    const approving = ref(false);
    const checkingOut = ref(false);
    const checkoutDialog = ref(false);
    const showApproval = ref(false);
    // Reviewer select (issue #567; #563 audit `G-ST-1`): the panel
    // reviewer is a role select over the MVP's fixed role catalogue
    // (requirements section 3.2), so `approvedBy` always carries one
    // of the hotel's defined role strings instead of arbitrary text.
    // Labels resolve through the catalogue in both locales
    // (`desk.admin.role_*`), never hardcoded. This is a deliberate
    // divergence from the board's prefilled `Quản lý ca` text input
    // (`docs/design/Stay.dc.html:3`), recorded in the #563 audit;
    // manager leads the list so the default matches that illustrated
    // reviewer and the select carries no placeholder option.
    const reviewerRoleOptions = computed(() => [
      { value: 'manager', label: t('desk.admin.role_manager', {}, 'Manager') },
      { value: 'owner', label: t('desk.admin.role_owner', {}, 'Owner') },
      { value: 'front-desk', label: t('desk.admin.role_front_desk', {}, 'Front desk') },
    ]);
    const approvalBy = ref('manager');
    const approvalRole = ref('');
    const approvalReason = ref('');
    const checkoutCtx = ref<CheckoutContext | null>(null);

    const canCheckOut = computed(
      () =>
        checkoutCtx.value !== null &&
        (checkoutCtx.value.balanceMinor === 0 || checkoutCtx.value.approval !== null),
    );

    // Check-in arrival options: expected arrivals carry the
    // booking reference in the option value, so the select
    // replaces the retired booking-reference text entry.
    const checkinOptions = computed(() =>
      arrivalRows.value.filter((row) => row.reservationRef),
    );

    // Check-out departing options: in-house stays first, then
    // today's departures; only rows with a stay id are pickable.
    const checkoutOptions = computed(() =>
      [...inHouseRows.value, ...departureRows.value].filter((row) => row.stayId),
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

    // Guest name for a stay from already-fetched panel data (the
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
    // reservationId UUIDs), so the arrival select renders from
    // these reference-backed rows instead (Refs #349). Every row
    // is verified through GetReservation, so a rendered option
    // always fills a live reference; a calendar outage degrades
    // to an empty select rather than failing the panel.
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
            timesText: '',
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
            timesText: '',
            reservationRef: row.reservationRef,
            stayId: row.stayId,
          };
        }),
      );
    }

    // Panel data (Refs #541): the same list reads as before feed
    // the two selects — arrival options, departing options, room
    // numbers, and the ready-room pool. Failures surface on the
    // check-in panel; the calendar read still degrades to an
    // empty arrival select on its own.
    async function loadPanelData(): Promise<void> {
      checkinError.value = '';
      try {
        const businessDate = localBusinessDate();
        const lists = await apiFetch<{
          arrivals?: StayRow[];
          inHouse?: StayRow[];
          departures?: StayRow[];
        }>('/v1/stay/ListArrivalsDepartures', {
          method: 'POST',
          body: JSON.stringify({ businessDate }),
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
        arrivalRows.value = [...(await fetchExpectedArrivals(businessDate)), ...(await renderRows(lists.arrivals ?? [], 'arrival'))];
        inHouseRows.value = await renderRows(lists.inHouse ?? [], 'stay');
        departureRows.value = await renderRows(lists.departures ?? [], 'stay');
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        checkinError.value = errorMessage();
      }
    }

    // A new arrival pick resets the two-step check-in flow: the
    // booked-type read and the ready-room candidates reload on
    // the next click, so a stale room can never commit.
    function onArrivalChange(): void {
      checkinRef.value = null;
      checkinCandidates.value = [];
      checkinRooms.value = {};
      checkinRoomId.value = '';
      checkinStatus.value = '';
      checkinError.value = '';
      checkinDetails.value = [];
    }

    // A new departing pick resets the review context: the
    // previous folio review never authorizes the next stay.
    function onDepartureChange(): void {
      checkoutCtx.value = null;
      showApproval.value = false;
      checkoutDetails.value = [];
      folioStatus.value = '';
      checkoutStatus.value = '';
      checkoutError.value = '';
    }

    onMounted(() => {
      // The shell gates this screen on sign-in, so a signed-in
      // visit loads the panel data straight away (same as the desk
      // screen); signed-out visits never reach this view.
      if (session.isSignedIn) {
        void loadPanelData();
      }
    });

    // First click loads the booking and the ready rooms of the
    // booked type into the picker (the quote step of the booking
    // form); the second click commits the check-in.
    async function loadCandidates(refValue: string): Promise<boolean> {
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
            return false;
          }
          if (errorCode(err) === 'NOT_FOUND') {
            checkinError.value = t(
              'desk.stay.refused_unknown_ref',
              {},
              'Unknown booking reference. Check the reference and try again.',
            );
            return false;
          }
          checkinError.value = errorMessage();
          return false;
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
          return false;
        }
        checkinRef.value = refValue;
        const roomsById: Record<string, string> = {};
        candidates.forEach((room) => {
          roomsById[room.roomId] = room.number;
          roomNumbers.value[room.roomId] = room.number;
        });
        checkinRooms.value = roomsById;
        checkinCandidates.value = candidates;
        // Refs #411: with exactly one ready room there is nothing
        // to choose, so bind it directly and clear the hint;
        // otherwise open on the empty prompt so the shown
        // value always matches the (empty) bound id.
        if (candidates.length === 1) {
          checkinRoomId.value = candidates[0].roomId;
          checkinError.value = '';
        } else {
          checkinRoomId.value = '';
          checkinError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        }
        checkinStatus.value = bookedTypeStatus(booking.roomTypeId);
        return true;
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return false;
        }
        checkinError.value = errorMessage();
        return false;
      } finally {
        checkingIn.value = false;
      }
    }

    async function onCheckIn(): Promise<void> {
      if (checkingIn.value) {
        return;
      }
      checkinError.value = '';
      const refValue = arrivalRef.value;
      if (!refValue) {
        checkinStatus.value = t('desk.stay.need_arrival', {}, 'Choose an arriving guest first.');
        return;
      }
      if (checkinRef.value !== refValue) {
        await loadCandidates(refValue);
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
        arrivalRef.value = '';
        checkinRoomId.value = '';
        checkinCandidates.value = [];
        checkinRooms.value = {};
        checkinRef.value = null;
        await loadPanelData();
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

    async function onReview(): Promise<void> {
      if (reviewing.value) {
        return;
      }
      checkoutError.value = '';
      const stayId = checkoutStayId.value.trim();
      if (!stayId) {
        checkoutStatus.value = t('desk.stay.need_departure', {}, 'Choose a departing guest first.');
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
        checkoutStatus.value = t('desk.stay.need_departure', {}, 'Choose a departing guest first.');
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
        checkoutStatus.value = t('desk.stay.need_departure', {}, 'Choose a departing guest first.');
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
        folioStatus.value = '';
        await loadPanelData();
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
      arrivalRows,
      inHouseRows,
      departureRows,
      readyRooms,
      checkinCandidates,
      checkinOptions,
      checkoutOptions,
      arrivalRef,
      checkinRoomId,
      checkinStatus,
      checkinError,
      checkingIn,
      checkinDetails,
      checkoutStayId,
      folioStatus,
      checkoutStatus,
      checkoutError,
      checkoutDetails,
      reviewing,
      approving,
      checkingOut,
      showApproval,
      reviewerRoleOptions,
      approvalBy,
      checkoutCtx,
      approvalRole,
      approvalReason,
      canCheckOut,
      checkoutDialog,
      onArrivalChange,
      onDepartureChange,
      onCheckIn,
      onReview,
      onApprove,
      onCheckOut,
    };
  },
});
</script>
