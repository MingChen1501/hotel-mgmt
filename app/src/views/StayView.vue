<template>
  <main data-testid="stay-view">
    <!-- Stay screen (Refs #541, `docs/design/Stay.dc.html:3`): the v2
      board carries no screen title or intro, so the view opens
      directly on the two-panel grid — check-in left, check-out
      right — with no lists or times sections (zero extras vs the
      board). Refs #647 adds exactly one decided card below the two
      panels, the `Move room` affordance the owner-reported
      stale-hold defect needs. The lists read still runs underneath
      to feed the selects; the review-to-checkout flow state below
      the check-out panel stays as today (post-review states with no
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
            board counterpart. Refs #588: the approver role is the
            same fixed role select as the reviewer field, and the
            confirm button carries the same gate as the button, so
            every route to the close re-reads the folio first. -->
          <div
            v-if="showApproval"
            data-testid="stay-approval-section"
          >
            <!-- Approver-role select (Refs #588, `BR-17`/`FR-CKO-5`;
              #567 `G-ST-1`): a free-form role cannot be recorded from
              the desk, so the approver role is the same fixed role
              select the reviewer field already uses. Labels resolve
              through `desk.admin.role_*` in both locales. -->
            <label for="stay-approval-role">
              {{ t('desk.stay.approver_role', {}, 'Approver role: ') }}
              <select
                id="stay-approval-role"
                v-model="approvalRole"
                name="approval-role"
                data-testid="stay-approval-role"
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
              :disabled="!canCheckOut || checkingOut"
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
          <!-- Room-release line (Refs #588, `FR-CKO-2`): the outcome of
            the `ReleaseRoom` the close performs, always separate from
            the close line so a failed release never reads as a failed
            close. -->
          <p
            v-if="roomReleaseStatus"
            role="status"
            data-testid="stay-room-release"
          >
            {{ roomReleaseStatus }}
          </p>
          <!-- #646 (`FR-DEP-5`): a committed close whose booking
            completion could not be recorded says so plainly; the
            desk never claims a completion the booking read contradicts. -->
          <p
            v-if="bookingCompletionStatus"
            role="status"
            data-testid="stay-booking-completion"
          >
            {{ bookingCompletionStatus }}
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

      <!-- Move card (Refs #647, `AC-REA-2`/`AC-REA-4`, rollout 6.17):
        one additive card spanning both columns for the arrival-time
        swap after a committed check-in and the mid-stay move — one
        path, no second mechanic. It reuses the reads the panel
        already loads (the in-house list and the ready-pool
        `vacant-inspected` read) and only the existing
        `AssignRoom` -> `MoveRoom` -> `ReleaseRoom` calls: the target
        is assigned first, the stay moves second, and the vacated
        room is released last so no room is freed while a live stay
        still names it. -->
      <Card
        data-testid="stay-move-card"
        class="stay-move-card"
      >
        <template #title>
          <h3 class="stay-card-title">
            {{ t('desk.stay.move_heading', {}, 'Move room') }}
          </h3>
        </template>
        <template #content>
          <label for="stay-move-guest">
            {{ t('desk.stay.move_guest_label', {}, 'Guest in house') }}
            <select
              id="stay-move-guest"
              v-model="moveStayId"
              data-testid="stay-move-guest"
            >
              <option value="">
                {{ t('desk.stay.move_choose_guest', {}, 'Choose a guest in house...') }}
              </option>
              <option
                v-for="row in moveGuestOptions"
                :key="row.key"
                :value="row.stayId"
              >
                {{ row.guestName }} · {{ row.roomLabel }}
              </option>
            </select>
          </label>
          <label for="stay-move-room">
            {{ t('desk.stay.move_room_label', {}, 'New room') }}
            <select
              id="stay-move-room"
              v-model="moveRoomId"
              data-testid="stay-move-room"
            >
              <option value="">
                {{ t('desk.stay.move_choose_room', {}, 'Choose a ready room...') }}
              </option>
              <option
                v-for="room in readyRooms"
                :key="room.roomId"
                :value="room.roomId"
              >
                {{ room.number }}
              </option>
            </select>
          </label>
          <p
            v-if="moveStayId === '' || moveRoomId === ''"
            class="stay-hint"
            data-testid="stay-move-hint"
          >
            {{ t('desk.stay.move_hint', {}, 'Pick a guest in house and a ready room first.') }}
          </p>
          <Button
            id="stay-move-button"
            type="button"
            class="stay-action"
            :label="t('desk.stay.move_button', {}, 'Move guest')"
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
          <!-- Release line, kept apart from the move receipt so a failed
            release never reads as a failed move (the #588 precedent). -->
          <p
            v-if="moveReleaseStatus"
            role="status"
            data-testid="stay-move-release"
          >
            {{ moveReleaseStatus }}
          </p>
          <Message
            v-if="moveError"
            severity="error"
            role="alert"
            data-testid="stay-move-error"
          >
            {{ moveError }}
          </Message>
        </template>
      </Card>
    </div>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { formatAuditTime, t } from '../i18n';
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
//   approval -> ReleaseRoom for the room the stay held (Refs #588:
//   the desk closes the loop the API desk loop already ran, and the
//   release follows a committed close only). The arrival pick comes
//   from the reservation calendar
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
// as `approvedBy`. The pre-v2 lists and actual-times sections are
// gone (zero extras vs the board); panel data still reads through
// the same list endpoints. Refs #647 adds one decided card — the
// `Move room` path that assigns the target, moves the stay, and
// releases the vacated room in that order — plus the arrival
// compensation inside the check-in commit. The review-to-checkout
// flow state (folio status, approval form, check-out button, confirm
// dialog) carries no board counterpart and keeps its current
// presentation and copy. PrimeVue stays as logic carrier only. No call-order change.

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
  // The stay's room UUID stays on the row so the check-out close can
  // resolve the room number through the loaded room-state map instead
  // of parsing the label (Refs #588, `FR-CKO-1`).
  roomId?: string;
  // The stay's actual arrival bounds the calendar read that resolves
  // its booking (Refs #600): stay rows carry no booking reference, so
  // the room charge is posted against the booking the calendar links.
  actualArrival?: string | null;
}

interface CalendarEntry {
  reservationRef?: string;
  // QueryCalendar links each entry to the stay it checked in (#600).
  stayId?: string;
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
  // The frozen quoted total stored at booking (`FR-RTE-5`): the room
  // charge the desk posts when it closes the check-out (#600).
  priceBasis?: { totalMinor?: number; discountName?: string | null };
}

// The folio read the check-out review starts from (#600): the charge
// lines tell the desk whether the room charge is already posted.
interface FolioRead {
  folioId: string;
  balanceMinor: number;
  openBalanceApproval?: unknown;
  charges?: Array<{ itemKind?: string }>;
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

// A recorded open-balance approval carries the approver identity, a
// hotel role, and the recorded time (Refs #588, `BR-17`/`FR-CKO-5`).
interface RecordedApproval {
  approvedBy: string;
  role: string;
  approvedAt: string;
}

// The hotel's fixed role set (requirements section 3.2): the reviewer
// and approver selects both offer exactly these, and a recorded
// approval only counts when its role is one of them (Refs #588,
// `FR-CKO-5`: a free-form role is not an approval).
const HOTEL_ROLES: readonly string[] = ['manager', 'owner', 'front-desk'];

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

// Refs #647 (LLD 23.2): a definitive refusal is the operation's own
// `4xx` envelope answer. Every target operation validates and guards
// before it mutates, so a definitive answer proves the call wrote
// nothing and the desk may and must take back what it wrote earlier
// in the same action. Every other failure — offline, `5xx`, a
// non-envelope reply — is an unreadable outcome: the write may have
// landed, so the desk releases nothing and asks staff to re-read.
// `401` is never a business outcome; the shared client routes it to
// the sign-in gate first.
function isDefinitiveFailure(err: unknown): boolean {
  const status = typeof err === 'object' && err !== null ? (err as ApiError).status : undefined;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 401;
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

// The only allowed exception to the no-unpaid-close rule is the
// approval recorded through `RecordOpenBalanceApproval` (Refs #588,
// `BR-17`, `FR-CKO-5`): it must carry a non-blank approver identity, a
// role from the hotel's fixed three, and a recorded time the desk can
// render. Anything else — a free-form note, a partial object, a role
// outside the set — is not an approval and the close refuses.
function provenancedApproval(value: unknown): RecordedApproval | null {
  const record = normalizeApproval(value);
  if (!record) {
    return null;
  }
  const approvedBy = typeof record.approvedBy === 'string' ? record.approvedBy.trim() : '';
  const role = typeof record.role === 'string' ? record.role.trim() : '';
  const approvedAt = typeof record.approvedAt === 'string' ? record.approvedAt.trim() : '';
  if (!approvedBy || !role || !approvedAt || !HOTEL_ROLES.includes(role)) {
    return null;
  }
  if (formatAuditTime(approvedAt) === '') {
    // A stored time the desk cannot read is no recorded time.
    return null;
  }
  return { approvedBy, role, approvedAt };
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
    // Arrival-pick load sequencing (#586): every pick increments
    // the counter and owns that value, so a booked-type read that
    // returns late for an earlier pick never paints into the
    // current picker (`AC-DSK-17`). The commit success reset
    // increments it too (Refs #596), so a pick made inside the
    // commit window is dropped with the cleared panel.
    // `pendingLoadSeq` names the candidate load still in flight, so
    // clearing the pick can release only that load's in-flight flag
    // and never a commit the button owns. `commitInFlight` records
    // the commit half separately (#614): a preload started by a pick
    // taken inside the commit window can settle before the commit
    // does, and it must not release the busy state the commit still
    // owns.
    let loadSeq = 0;
    let pendingLoadSeq: number | null = null;
    let commitInFlight = false;

    const checkoutStayId = ref('');
    const folioStatus = ref('');
    const checkoutStatus = ref('');
    // #646 (`FR-DEP-5`): a committed close whose booking completion
    // could not be recorded keeps its own line so the desk reports the
    // split in plain words instead of claiming the booking is done.
    const bookingCompletionStatus = ref('');
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
    // #588: the approver role is a fixed-role select (the same set the
    // reviewer field offers), defaulting to the manager so a free-form
    // role cannot be recorded from the desk.
    const approvalRole = ref('manager');
    const approvalReason = ref('');
    const checkoutCtx = ref<CheckoutContext | null>(null);
    // Room-release line (Refs #588, `FR-CKO-2`): the truth about the
    // `ReleaseRoom` the close performs, kept apart from the close line.
    const roomReleaseStatus = ref('');

    // Move card (Refs #647, rollout 6.17): the guest in house and the
    // ready-room pick reuse the panel's own reads — no new read is
    // added, and the guest's current room is never offered because an
    // `occupied` room is not in the ready pool. `moveStatus` carries
    // the move receipt (both rooms and the time) and the compensation
    // outcome; `moveReleaseStatus` keeps a release failure apart from
    // the committed move.
    const moveStayId = ref('');
    const moveRoomId = ref('');
    const moveStatus = ref('');
    const moveReleaseStatus = ref('');
    const moveError = ref('');
    const moving = ref(false);

    // The catalogue label for a hotel role value, so the recorded
    // approval line names the role in the desk language (Refs #588).
    function roleLabelFor(value: string): string {
      const known = reviewerRoleOptions.value.find((option) => option.value === value);
      return known ? known.label : value;
    }

    // #588 (`FR-CKO-4`, `FR-CKO-5`): the button, the dialog confirm,
    // and `onCheckOut` all gate on a zero balance or a provenanced
    // recorded approval — never on review-time free-form text.
    const canCheckOut = computed(
      () =>
        checkoutCtx.value !== null &&
        (checkoutCtx.value.balanceMinor === 0 ||
          provenancedApproval(checkoutCtx.value.approval) !== null),
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

    // Move-card guest options (Refs #647): only guests in house can
    // move; today's departures are leaving, not moving.
    const moveGuestOptions = computed(() =>
      inHouseRows.value.filter((row) => row.stayId),
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

    // The visible approved-exception line (Refs #588, `FR-CKO-5`):
    // the approver identity, the role, and the recorded time in the
    // desk time form, so the exception is explicit rather than silent.
    function approvalRecordedLine(approval: RecordedApproval): string {
      const role = roleLabelFor(approval.role);
      const time = formatAuditTime(approval.approvedAt);
      return t(
        'desk.stay.approval_recorded_by',
        { approvedBy: approval.approvedBy, role, time },
        `Approved by ${approval.approvedBy} (${role}) at ${time}.`,
      );
    }

    // The picked departing row for a stay, from the panel data already
    // on screen (#588: the release never retypes or guesses a room).
    function departingRowForStay(stayId: string): StayListRow | null {
      for (const row of [...inHouseRows.value, ...departureRows.value]) {
        if (row.stayId === stayId) {
          return row;
        }
      }
      return null;
    }

    // The room number the stay held, resolved through the loaded
    // room-state map (`roomNumbers`) — empty when the map cannot name it.
    function roomNumberForStay(stayId: string): string {
      const row = departingRowForStay(stayId);
      if (!row?.roomId) {
        return '';
      }
      return roomNumbers.value[row.roomId] ?? '';
    }

    function roomLabelForStay(stayId: string): string {
      return departingRowForStay(stayId)?.roomLabel ?? t('desk.today.room_unknown', {}, 'Room number unavailable');
    }

    // The room charge the desk posts when the check-out review opens
    // (Refs #600): the stay's own booking carries the frozen quoted
    // total (`priceBasis.totalMinor`, `FR-RTE-5`), and live stay rows
    // carry no booking reference (Refs #349), so the booking is resolved
    // through the reservation calendar by the stay it links — the same
    // read the arrival pick uses. `null` means the booking could not be
    // resolved, which refuses the check-out instead of closing a folio
    // that carries no room charge.
    async function resolveStayRoomCharge(stayId: string): Promise<number | null> {
      const row = departingRowForStay(stayId);
      const businessDate = localBusinessDate();
      const arrivalDay = (row?.actualArrival ?? '').slice(0, 10) || businessDate;
      const calendar = await apiFetch<{ reservations?: CalendarEntry[] }>(
        '/v1/reservations/QueryCalendar',
        {
          method: 'POST',
          body: JSON.stringify({ dateFrom: arrivalDay, dateTo: nextDay(businessDate) }),
        },
      );
      const entry = (calendar.reservations ?? []).find((candidate) => candidate.stayId === stayId);
      if (!entry?.reservationRef) {
        return null;
      }
      const booking = await apiFetch<ReservationReadback>('/v1/reservations/GetReservation', {
        method: 'POST',
        body: JSON.stringify({ reservationRef: entry.reservationRef }),
      });
      const total = booking.priceBasis?.totalMinor;
      return typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : null;
    }

    // One `nightly-room-charge` line marks the stay's room charge as
    // posted (Refs #600): a folio that already carries one — posted from
    // the Folio screen or by the API desk loop — is never charged twice.
    function folioCarriesRoomCharge(folio: FolioRead): boolean {
      return (folio.charges ?? []).some((line) => line.itemKind === 'nightly-room-charge');
    }

    // The posted line names the room the stay held, resolved through the
    // loaded room-state map; a room the map cannot name still posts, with
    // the plain item name (`contracts/http/PostCharge.json` requires one).
    function roomChargeItemName(stayId: string): string {
      const roomNumber = roomNumberForStay(stayId);
      return roomNumber ? `Room ${roomNumber}` : 'Room charge';
    }

    // Refusal used when the stay's room charge cannot be posted, so staff
    // know the check-out is blocked on the charge and not on the folio.
    function roomChargeRefusal(): string {
      return t(
        'desk.stay.refused_room_charge',
        {},
        'The room charge could not be posted for this stay, so check-out is refused and the stay remains in house. Check the booking and try again.',
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
            roomId: row.roomId,
            actualArrival: row.actualArrival ?? null,
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

    // A new arrival pick resets the previous booking's state and
    // loads the booked-type ready-room candidates straight away
    // (#586, `AC-DSK-17`): the picker is populated without a Check
    // in click, while the commit stays on the button. The pick
    // owns a load sequence number so a slow read for an earlier
    // pick never paints into the later one.
    async function onArrivalChange(): Promise<void> {
      const seq = ++loadSeq;
      checkinRef.value = null;
      checkinCandidates.value = [];
      checkinRooms.value = {};
      checkinRoomId.value = '';
      checkinStatus.value = '';
      checkinError.value = '';
      checkinDetails.value = [];
      const refValue = arrivalRef.value;
      if (!refValue) {
        // #586: clearing the pick supersedes the in-flight load
        // (its late reads paint nothing), so the panel must not
        // stay in the checking-in state until the next pick. A
        // commit in flight keeps its own flag: only a pending
        // candidate load is released here.
        if (pendingLoadSeq !== null) {
          pendingLoadSeq = null;
          if (!commitInFlight) {
            checkingIn.value = false;
          }
        }
        return;
      }
      await loadCandidates(refValue, seq);
    }

    // A valid room pick clears the room guard immediately (#586):
    // the multi-candidate load raises `need_room` when the
    // candidates arrive, so the pick must resolve it without
    // another Check in click. The placeholder (empty id) and any
    // value outside the candidate map leave the guard in place at
    // commit time.
    watch(checkinRoomId, (value) => {
      if (value !== '' && checkinRooms.value[value]) {
        checkinError.value = '';
      }
    });

    // A new departing pick resets the review context: the
    // previous folio review never authorizes the next stay.
    function onDepartureChange(): void {
      checkoutCtx.value = null;
      showApproval.value = false;
      checkoutDetails.value = [];
      folioStatus.value = '';
      checkoutStatus.value = '';
      checkoutError.value = '';
      roomReleaseStatus.value = '';
      bookingCompletionStatus.value = '';
    }

    onMounted(() => {
      // The shell gates this screen on sign-in, so a signed-in
      // visit loads the panel data straight away (same as the desk
      // screen); signed-out visits never reach this view.
      if (session.isSignedIn) {
        void loadPanelData();
      }
    });

    // The arrival pick loads the booking and the ready rooms of the
    // booked type into the picker (#586); a Check in click after a
    // successful load reuses them and commits, and a click after a
    // failed load retries this read instead of committing a stale
    // selection. `seq` is the pick's load sequence number: a read
    // that returns for an earlier pick paints nothing.
    async function loadCandidates(refValue: string, seq: number = loadSeq): Promise<boolean> {
      checkingIn.value = true;
      pendingLoadSeq = seq;
      try {
        let booking: { roomTypeId: string };
        try {
          booking = await apiFetch<{ roomTypeId: string }>('/v1/reservations/GetReservation', {
            method: 'POST',
            body: JSON.stringify({ reservationRef: refValue }),
          });
        } catch (err) {
          if (seq !== loadSeq) {
            return false;
          }
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
        if (seq !== loadSeq) {
          return false;
        }
        const rooms = await apiFetch<{ rooms?: RoomRecord[] }>(
          '/v1/rooms/ListRoomsByState',
          { method: 'POST', body: JSON.stringify({ state: 'vacant-inspected' }) },
        );
        if (seq !== loadSeq) {
          return false;
        }
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
        if (seq !== loadSeq) {
          return false;
        }
        if (isSignedOut(err)) {
          expireToGate();
          return false;
        }
        checkinError.value = errorMessage();
        return false;
      } finally {
        if (seq === loadSeq) {
          pendingLoadSeq = null;
          // #614: a preload for a pick taken inside the commit
          // window owns the newest sequence and settles before the
          // commit does, so releasing the read's half must wait for
          // the commit to settle (the commit's own `finally` then
          // releases it).
          if (!commitInFlight) {
            checkingIn.value = false;
          }
        }
      }
    }

    // Refs #647 (LLD 23.2/23.3): one release helper for both flows.
    // `released` and `already-free` are the intended end states — a
    // `STATE_ILLEGAL` answer means the room is not occupied, the #588
    // precedent — while any other failure is named by the caller.
    async function releaseRoomTo(
      roomNumber: string,
      toState: 'vacant-inspected' | 'vacant-dirty',
    ): Promise<'released' | 'already-free' | 'failed'> {
      try {
        await apiFetch<{ roomNumber: string; oldState: string; newState: string }>(
          '/v1/rooms/ReleaseRoom',
          {
            method: 'POST',
            body: JSON.stringify({
              roomNumber,
              toState,
              actor: session.displayName ?? '',
            }),
          },
        );
        return 'released';
      } catch (err) {
        if (isSignedOut(err)) {
          throw err;
        }
        // A room that is no longer occupied already holds the intended
        // end state; a definitive or unreadable failure is named by
        // the caller, which never claims a free room it did not see
        // freed.
        return errorCode(err) === 'STATE_ILLEGAL' ? 'already-free' : 'failed';
      }
    }

    // Refs #647 (`FR-REA-1`, `AC-REA-1`): a check-in commit that
    // assigned a room but recorded no stay takes that room back to the
    // ready state it held. A failed compensation is named, never
    // hidden; the plain refusal stays in the error line.
    async function compensateCheckinRoom(roomNumber: string): Promise<void> {
      const outcome = await releaseRoomTo(roomNumber, 'vacant-inspected');
      checkinStatus.value =
        outcome === 'failed'
          ? t(
              'desk.stay.checkin_release_failed',
              { roomNumber },
              `The check-in was refused, but room ${roomNumber} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
            )
          : t(
              'desk.stay.checkin_compensated',
              { roomNumber },
              `The check-in was refused and room ${roomNumber} is free again.`,
            );
    }

    // Check in validates the selected room and commits once. The
    // arrival pick already loaded the booking and its candidates
    // (#586), so this click normally reuses them; a click after a
    // failed load retries the load instead of committing a stale
    // selection, and a click while the read or the commit is in
    // flight stays a no-op.
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
      commitInFlight = true;
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
          if (isDefinitiveFailure(err)) {
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
          // Refs #647 (`FR-REA-1`): an unreadable assignment may have
          // landed, so nothing is released; the room is named for a
          // re-read instead.
          checkinError.value = t(
            'desk.stay.checkin_outcome_unknown',
            { roomNumber: checkinRooms.value[selectedRoomId] },
            `The check-in result could not be read. Reload the desk and check room ${checkinRooms.value[selectedRoomId]} before acting again.`,
          );
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
          if (isDefinitiveFailure(err)) {
            checkinError.value =
              errorCode(err) === 'NOT_FOUND'
                ? t(
                    'desk.stay.refused_unknown_ref',
                    {},
                    'Unknown booking reference. Check the reference and try again.',
                  )
                : errorMessage();
            // Refs #647 (`AC-REA-1`): no stay was recorded, so the
            // room this commit assigned goes back to ready.
            await compensateCheckinRoom(assigned.roomNumber);
            return;
          }
          checkinError.value = t(
            'desk.stay.checkin_outcome_unknown',
            { roomNumber: assigned.roomNumber },
            `The check-in result could not be read. Reload the desk and check room ${assigned.roomNumber} before acting again.`,
          );
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
          if (isDefinitiveFailure(err)) {
            checkinError.value =
              errorCode(err) === 'CONFLICT'
                ? t(
                    'desk.stay.refused_checked_in',
                    {},
                    'That booking is already checked in.',
                  )
                : errorMessage();
            // Refs #647 (`FR-REA-1`): the stay write refused, so no
            // stay names the room and the assignment is taken back.
            await compensateCheckinRoom(assigned.roomNumber);
            return;
          }
          checkinError.value = t(
            'desk.stay.checkin_outcome_unknown',
            { roomNumber: assigned.roomNumber },
            `The check-in result could not be read. Reload the desk and check room ${assigned.roomNumber} before acting again.`,
          );
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
          // Refs #647 (`FR-REA-1`): the stay landed, so the room a
          // live stay names is never freed. Report the split in plain
          // words and leave the room occupied.
          checkinError.value = t(
            'desk.stay.checkin_link_not_recorded',
            { roomNumber: assigned.roomNumber },
            `The guest is in room ${assigned.roomNumber}, but the booking link is not recorded. Reload the desk, and tell the manager if the booking still shows no check-in.`,
          );
          return;
        }
        checkinStatus.value = t(
          'desk.stay.checked_in_named',
          { ref: refValue, roomNumber: assigned.roomNumber },
          `Checked in for booking ${refValue} in room ${assigned.roomNumber}.`,
        );
        checkinDetails.value = [{ label: 'Stay ID', value: stayId }];
        // The commit success reset owns the picker (Refs #596): the
        // arrival select stays enabled during the commit, so a pick
        // inside that window starts a load of its own. Bumping the
        // sequence and dropping the pending load here invalidates
        // that load, so its late read paints no candidate, status, or
        // error into the cleared panel, and the next arrival clear
        // cannot release the commit's in-flight flag on its behalf.
        ++loadSeq;
        pendingLoadSeq = null;
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
        // #614: the commit releases its own half; a candidate load
        // still in flight (a pick taken inside the commit window
        // that has not settled yet) keeps the panel busy until its
        // own `finally` runs.
        commitInFlight = false;
        if (pendingLoadSeq === null) {
          checkingIn.value = false;
        }
      }
    }

    // Move a guest in house to a ready room (Refs #647, `FR-REA-2`/
    // `FR-REA-4`). One path serves the arrival-time swap and the
    // mid-stay move: assign the target first (a taken or blocked
    // target refuses before anything moves), move the stay second (the
    // guest is recorded in the new room before the old one stops
    // naming them), release the vacated room last (it only becomes
    // free once the stay no longer holds it). Every definitive refusal
    // after the target assignment runs exactly one compensating
    // release back to ready; an unreadable outcome releases nothing.
    async function onMove(): Promise<void> {
      if (moving.value) {
        return;
      }
      moveError.value = '';
      moveStatus.value = '';
      moveReleaseStatus.value = '';
      const stayId = moveStayId.value;
      const guestRow = inHouseRows.value.find((row) => row.stayId === stayId) ?? null;
      if (!stayId || !guestRow) {
        moveError.value = t(
          'desk.stay.move_need_guest',
          {},
          'Choose a guest in house first.',
        );
        return;
      }
      const target = readyRooms.value.find((room) => room.roomId === moveRoomId.value) ?? null;
      if (!target) {
        moveError.value = t('desk.stay.need_room', {}, 'Pick a ready room first.');
        return;
      }
      const targetNumber = target.number;
      moving.value = true;
      try {
        let assigned: { roomId: string; roomNumber: string };
        try {
          assigned = await apiFetch<{ roomId: string; roomNumber: string }>(
            '/v1/rooms/AssignRoom',
            {
              method: 'POST',
              body: JSON.stringify({
                roomNumber: targetNumber,
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
          if (isDefinitiveFailure(err)) {
            // Nothing was assigned, so nothing is compensated; reload
            // the ready pool so a just-taken room leaves the picker.
            moveError.value =
              errorCode(err) === 'CONFLICT'
                ? t(
                    'desk.stay.move_refused_taken',
                    {},
                    'That room was just taken. Pick another ready room.',
                  )
                : errorMessage();
            await loadPanelData();
            return;
          }
          moveError.value = t(
            'desk.stay.move_outcome_unknown',
            { fromRoom: roomLabel(guestRow.roomId), toRoom: targetNumber },
            `The move result could not be read. Reload the desk and check rooms ${roomLabel(guestRow.roomId)} and ${targetNumber} before acting again.`,
          );
          return;
        }
        let moved: { move: { fromRoomId: string; toRoomId: string; movedAt: string } };
        try {
          moved = await apiFetch<{
            move: { fromRoomId: string; toRoomId: string; movedAt: string };
          }>('/v1/stay/MoveRoom', {
            method: 'POST',
            body: JSON.stringify({
              stayId,
              toRoomId: assigned.roomId,
              actor: session.displayName ?? '',
              idempotencyKey: newIdempotencyKey(),
            }),
          });
        } catch (err) {
          if (isSignedOut(err)) {
            expireToGate();
            return;
          }
          if (isDefinitiveFailure(err)) {
            // The stay did not move, so the target this action
            // assigned goes back to the ready state it held.
            moveError.value =
              errorCode(err) === 'STATE_ILLEGAL'
                ? t(
                    'desk.stay.move_refused_stay',
                    {},
                    'That guest is no longer in house, so the move is refused.',
                  )
                : errorMessage();
            const outcome = await releaseRoomTo(targetNumber, 'vacant-inspected');
            moveStatus.value =
              outcome === 'failed'
                ? t(
                    'desk.stay.move_target_stuck',
                    { toRoom: targetNumber },
                    `The move was refused, but room ${targetNumber} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
                  )
                : t(
                    'desk.stay.move_compensated',
                    { toRoom: targetNumber },
                    `The move was refused and room ${targetNumber} is free again.`,
                  );
            return;
          }
          moveError.value = t(
            'desk.stay.move_outcome_unknown',
            { fromRoom: roomLabel(guestRow.roomId), toRoom: targetNumber },
            `The move result could not be read. Reload the desk and check rooms ${roomLabel(guestRow.roomId)} and ${targetNumber} before acting again.`,
          );
          return;
        }
        // The release follows the echo, never the panel's remembered
        // row (LLD 23.1): a second desk moving the same guest cannot
        // make this action free a room another stay still names.
        const fromRoomId = moved.move.fromRoomId;
        const newRoomId = moved.move.toRoomId;
        const fromRoomNumber = roomNumbers.value[fromRoomId] ?? '';
        const newRoomNumber = roomNumbers.value[newRoomId] ?? assigned.roomNumber;
        moveStatus.value = t(
          'desk.stay.moved_named',
          {
            guest: guestRow.guestName,
            fromRoom: fromRoomNumber || roomLabel(fromRoomId),
            toRoom: newRoomNumber,
            time: formatAuditTime(moved.move.movedAt),
          },
          `Moved ${guestRow.guestName} from room ${fromRoomNumber} to room ${newRoomNumber} at ${formatAuditTime(moved.move.movedAt)}.`,
        );
        if (!fromRoomNumber) {
          // Without the number the panel cannot release the vacated
          // room and must not invent one: name the unsolved half.
          moveReleaseStatus.value = t(
            'desk.stay.move_release_failed',
            { fromRoom: roomLabel(fromRoomId), toRoom: newRoomNumber },
            `The guest is now in room ${newRoomNumber}, but room ${roomLabel(fromRoomId)} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
          );
        } else {
          const outcome = await releaseRoomTo(fromRoomNumber, 'vacant-dirty');
          if (outcome === 'already-free') {
            moveReleaseStatus.value = t(
              'desk.stay.room_already_free',
              { roomNumber: fromRoomNumber },
              `Room ${fromRoomNumber} is already free.`,
            );
          } else if (outcome === 'failed') {
            moveReleaseStatus.value = t(
              'desk.stay.move_release_failed',
              { fromRoom: fromRoomNumber, toRoom: newRoomNumber },
              `The guest is now in room ${newRoomNumber}, but room ${fromRoomNumber} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
            );
          }
        }
        // The receipt stays until the next pick; the reload makes the
        // board, the Rooms map, and the ready pool agree.
        moveStayId.value = '';
        moveRoomId.value = '';
        await loadPanelData();
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        moveError.value = errorMessage();
      } finally {
        moving.value = false;
      }
    }

    async function onReview(): Promise<void> {
      if (reviewing.value) {
        return;
      }
      checkoutError.value = '';
      roomReleaseStatus.value = '';
      const stayId = checkoutStayId.value.trim();
      if (!stayId) {
        checkoutStatus.value = t('desk.stay.need_departure', {}, 'Choose a departing guest first.');
        return;
      }
      reviewing.value = true;
      // A review that fails leaves nothing to close: the previous stay's
      // context, folio line, and details never authorize the next
      // check-out.
      checkoutCtx.value = null;
      showApproval.value = false;
      checkoutStatus.value = '';
      checkoutDetails.value = [];
      folioStatus.value = '';
      try {
        const readFolio = (): Promise<FolioRead> =>
          apiFetch<FolioRead>('/v1/billing/GetFolioBalance', {
            method: 'POST',
            body: JSON.stringify({ stayId, actor: session.displayName ?? '' }),
          });
        let folio = await readFolio();
        // Refs #600: the desk check-out posts the stay's room charge
        // before the review shows a balance, so the close is gated on a
        // folio that carries the room it paid for. A folio that already
        // carries a nightly room charge is left untouched, and a stay
        // whose booking cannot be resolved is never closed uncharged.
        if (!folioCarriesRoomCharge(folio)) {
          const roomChargeMinor = await resolveStayRoomCharge(stayId);
          if (roomChargeMinor === null) {
            checkoutError.value = roomChargeRefusal();
            return;
          }
          if (roomChargeMinor > 0) {
            await apiFetch<unknown>('/v1/billing/PostCharge', {
              method: 'POST',
              body: JSON.stringify({
                stayId,
                itemKind: 'nightly-room-charge',
                itemName: roomChargeItemName(stayId),
                amountMinor: roomChargeMinor,
                actor: session.displayName ?? '',
                // One key per stay: a repeated review returns the line
                // it already posted instead of charging the room twice
                // (`NFR-CON-2`, `contracts/http/PostCharge.json`).
                idempotencyKey: `room-charge:${stayId}`,
              }),
            });
            folio = await readFolio();
          }
        }
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
        const approval = provenancedApproval(folio.openBalanceApproval);
        if (folio.balanceMinor === 0) {
          showApproval.value = false;
          checkoutStatus.value = t(
            'desk.stay.balance_zero',
            {},
            'The balance is zero. Check-out is clear.',
          );
        } else if (approval) {
          showApproval.value = false;
          checkoutStatus.value = approvalRecordedLine(approval);
        } else if (normalizeApproval(folio.openBalanceApproval)) {
          // #588: an approval object without the identity, the recorded
          // time, or a hotel role is not an approval (`FR-CKO-5`).
          showApproval.value = true;
          checkoutError.value = t(
            'desk.stay.refused_approval_incomplete',
            {},
            'The recorded approval has no approver or no recorded time, so check-out is refused and the stay remains in house. Record the approval again.',
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
        const recordedApproval = provenancedApproval(recorded.openBalanceApproval);
        checkoutCtx.value.approval = normalizeApproval(recorded.openBalanceApproval);
        checkoutCtx.value.balanceMinor = recorded.balanceMinor;
        if (recordedApproval) {
          showApproval.value = false;
          checkoutStatus.value = approvalRecordedLine(recordedApproval);
        } else {
          // The record came back without provenance (`FR-CKO-5`): it is
          // not an approval, so the form stays open for a new record.
          showApproval.value = true;
          checkoutStatus.value = '';
          checkoutError.value = t(
            'desk.stay.refused_approval_incomplete',
            {},
            'The recorded approval has no approver or no recorded time, so check-out is refused and the stay remains in house. Record the approval again.',
          );
        }
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
      roomReleaseStatus.value = '';
      bookingCompletionStatus.value = '';
      if (!checkoutCtx.value) {
        checkoutStatus.value = t('desk.stay.need_departure', {}, 'Choose a departing guest first.');
        return;
      }
      const stayId = checkoutCtx.value.stayId;
      // Resolve the room the picked departing row shows before the
      // close clears the selection (#588, `FR-CKO-1`): staff never
      // retype a room number and the panel never releases a room the
      // stay did not hold.
      const releaseRoomNumber = roomNumberForStay(stayId);
      checkingOut.value = true;
      try {
        const folio = await apiFetch<{
          folioId: string;
          balanceMinor: number;
          openBalanceApproval?: unknown;
        }>('/v1/billing/GetFolioBalance', {
          method: 'POST',
          body: JSON.stringify({ stayId, actor: session.displayName ?? '' }),
        });
        // #588 (`FR-CKO-4`): the freshly read folio governs every route
        // to the close; the review-time approval fallback is gone, so a
        // charge added between review and confirm refuses here.
        const approval = provenancedApproval(folio.openBalanceApproval);
        const rawApproval = normalizeApproval(folio.openBalanceApproval);
        checkoutCtx.value = {
          stayId,
          folioId: folio.folioId,
          balanceMinor: folio.balanceMinor,
          approval: rawApproval,
        };
        if (folio.balanceMinor !== 0 && !approval) {
          checkoutDialog.value = false;
          showApproval.value = true;
          checkoutStatus.value = '';
          checkoutError.value = rawApproval
            ? t(
                'desk.stay.refused_approval_incomplete',
                {},
                'The recorded approval has no approver or no recorded time, so check-out is refused and the stay remains in house. Record the approval again.',
              )
            : t(
                'desk.stay.refused_open_balance',
                {},
                'The folio still has an open balance, so check-out is refused and the stay remains in house. Record an approval first.',
              );
          return;
        }
        const checkoutBody: Record<string, unknown> = {
          stayId,
          folioId: folio.folioId,
          folioBalanceMinor: folio.balanceMinor,
          actor: session.displayName ?? '',
          idempotencyKey: newIdempotencyKey(),
        };
        if (approval) {
          checkoutBody.openBalanceApproval = approval;
        }
        const closed = await apiFetch<{
          stayId: string;
          invoiceRef: string;
          bookingCompletion?: { state?: string; reason?: string };
        }>(
          '/v1/stay/CheckOut',
          { method: 'POST', body: JSON.stringify(checkoutBody) },
        );
        checkoutStatus.value = checkedOutStatus(closed.stayId, folio.balanceMinor);
        // #646 (`FR-DEP-5`): the close stands even when the booking
        // completion could not be recorded. The desk says so in plain
        // words and never renders the envelope code.
        bookingCompletionStatus.value =
          closed.bookingCompletion?.state === 'not-recorded'
            ? t(
                'desk.stay.booking_not_recorded',
                {},
                'The guest is checked out, but the booking behind this stay still reads in house. Tell the manager so it can be recorded.',
              )
            : '';
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
        // The committed close releases the room it just vacated
        // (`FR-CKO-1`, `FR-CKO-2`): the close already stands, so a
        // failed release never reads as a failed close and nothing is
        // reported released before the rooms service confirms it.
        if (releaseRoomNumber) {
          try {
            await apiFetch<{ roomNumber: string; oldState: string; newState: string }>(
              '/v1/rooms/ReleaseRoom',
              {
                method: 'POST',
                body: JSON.stringify({
                  roomNumber: releaseRoomNumber,
                  toState: 'vacant-dirty',
                  actor: session.displayName ?? '',
                }),
              },
            );
            roomReleaseStatus.value = t(
              'desk.stay.room_released',
              { roomNumber: releaseRoomNumber },
              `Room ${releaseRoomNumber} is now vacant and dirty.`,
            );
          } catch (err) {
            if (isSignedOut(err)) {
              expireToGate();
              return;
            }
            // A room that is no longer occupied already holds the
            // intended end state: say it is free, claim no
            // housekeeping state the panel did not set.
            roomReleaseStatus.value =
              errorCode(err) === 'STATE_ILLEGAL'
                ? t(
                    'desk.stay.room_already_free',
                    { roomNumber: releaseRoomNumber },
                    `Room ${releaseRoomNumber} is already free.`,
                  )
                : t(
                    'desk.stay.room_release_failed',
                    { roomNumber: releaseRoomNumber },
                    `The guest is checked out, but room ${releaseRoomNumber} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
                  );
          }
        } else {
          // Without a room number the panel cannot release anything and
          // must not invent one (`FR-CKO-1`): the close stands and the
          // next step names the unsolved half.
          roomReleaseStatus.value = t(
            'desk.stay.room_release_failed',
            { roomNumber: roomLabelForStay(closed.stayId) },
            `The guest is checked out, but room ${roomLabelForStay(closed.stayId)} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.`,
          );
        }
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
      roomReleaseStatus,
      bookingCompletionStatus,
      moveGuestOptions,
      moveStayId,
      moveRoomId,
      moveStatus,
      moveReleaseStatus,
      moveError,
      moving,
      onArrivalChange,
      onDepartureChange,
      onCheckIn,
      onMove,
      onReview,
      onApprove,
      onCheckOut,
    };
  },
});
</script>
