<template>
  <main data-testid="folio-view">
    <!-- Folio screen (Refs #545, `docs/design/Folio.dc.html:3`): the
      v2 board carries no screen title or intro — the shell header
      owns the hotel name plus the seven design tabs with the
      `Hoá đơn` pill active — so the view opens directly on the
      folio: the stay-ID open step first (pre-board flow state,
      orchestrator decision on #545 resolving the F3 REPORTED item
      #498: the only in-app path to a folio), then the design
      `1fr 1fr` grid with the charges card left and the payments
      card right. Hooks and copy otherwise unchanged. -->
    <noscript><p>{{ t('desk.entry.noscript_folio', {}, 'This page needs JavaScript to open a folio.') }}</p></noscript>

    <section data-testid="folio-main">
      <!-- Open step (Refs #545, F3): pre-board flow state with no
        board counterpart — the board draws one illustrative guest
        folio, while the app must first resolve which stay to show.
        Stay-ID entry plus the open action stay exactly as today;
        hooks and copy unchanged. -->
      <Card data-testid="folio-open-card">
        <template #title>
          <h3>{{ t('desk.folio.open_heading', {}, 'Open a stay folio') }}</h3>
        </template>
        <template #content>
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
              class="folio-action"
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
        </template>
      </Card>

      <!-- Design grid (Refs #545, `docs/design/Folio.dc.html:3`):
        the two board cards directly in the `1fr 1fr` grid, charges
        left with its lines plus the post-charge form, payments
        right with the due block, its payment lines, plus the
        record-payment form. Hooks and copy otherwise unchanged. -->
      <div
        class="folio-layout"
        data-testid="folio-layout"
      >
        <!-- Charges card (Refs #568, `docs/design/Folio.dc.html:3`):
          the board titles it `Khoản phí · Lê Minh · P.201`, so the
          live title names the open folio's guest and room. The raw
          stay/folio IDs stay behind the reference disclosure
          (issue #372), and an unresolved half falls back to the
          catalogue wording rather than a record ID. -->
        <Card data-testid="folio-charges-card">
            <template #title>
              <h3 data-testid="folio-charges-title">{{ chargesHeading }}</h3>
            </template>
            <template #content>
              <!-- Board rows (Refs #545,
                `docs/design/Folio.dc.html:3`): the board draws plain
                name-plus-amount lines (`Tiền phòng 2 đêm` /
                `1.800.000 đ`), no table headers and no time/balance
                columns, so the lines render as plain rows — one per
                charge, tax/fee folded into the item text as before.
                The empty message stays as flow state. -->
              <div
                data-testid="folio-charge-lines"
                class="folio-lines"
              >
                <div
                  v-for="row in chargeRows"
                  :key="row.key"
                  class="folio-line"
                >
                  <span>{{ row.item }}</span><strong>{{ row.amount }}</strong>
                </div>
                <p
                  v-if="chargeRows.length === 0 && paymentRows.length === 0"
                  class="folio-empty"
                >
                  {{ t('desk.folio.no_lines', {}, 'No charges or payments yet. Posted charges and recorded payments appear here.') }}
                </p>
              </div>
              <ReferenceDetails
                v-if="folioDetails.length > 0"
                :items="folioDetails"
                testid-prefix="folio-details"
              />

              <!-- Charge kind (Refs #545): flow state with no board
                counterpart — the board draws a single `Mô tả` input,
                while `PostCharge` requires `itemKind`
                (`nightly-room-charge` posts a room charge,
                `charge-item` validates against the hotel list), so
                the kind select stays inline, copy unchanged. -->
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
                  {{ t('desk.folio.item_name', {}, 'Description') }}
                  <InputText
                    id="folio-charge-name"
                    v-model="chargeName"
                    name="charge-name"
                    autocomplete="off"
                    data-testid="folio-charge-name"
                  />
                </label>
                <label for="folio-charge-amount">
                  {{ t('desk.folio.amount_label', {}, 'Amount') }}
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
                  class="folio-action"
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
            </template>
          </Card>

          <Card data-testid="folio-payments-card">
            <template #title>
              <h3>{{ t('desk.folio.payment_heading', {}, 'Payment') }}</h3>
            </template>
            <template #content>
              <!-- Due block (Refs #545,
                `docs/design/Folio.dc.html:3`): the board heads the
                payments card with the muted `Còn phải trả` label
                above the large due figure (`960.000 đ`,
                `30px/700 #8A4B08`). The figure carries the
                locale-grouped balance; the sentence status below
                stays as flow state (same precedent as the Stay
                folio-status line, Refs #541). -->
              <div class="folio-due-label">
                {{ t('desk.folio.due_label', {}, 'Balance due') }}
              </div>
              <div
                role="status"
                data-testid="folio-balance"
                class="folio-balance-due"
              >
                {{ folioBalance }}
              </div>
              <p
                role="status"
                data-testid="folio-status"
                class="folio-status-line"
              >
                {{ folioStatus }}
              </p>
              <!-- Board payment rows (Refs #545,
                `docs/design/Folio.dc.html:3`): one plain
                method-plus-amount line per payment (`Tiền mặt` /
                `900.000 đ`), amounts rendered positive as drawn. -->
              <div
                data-testid="folio-payment-lines"
                class="folio-lines"
              >
                <div
                  v-for="row in paymentRows"
                  :key="row.key"
                  class="folio-line"
                >
                  <span>{{ row.item }}</span><strong>{{ row.amount }}</strong>
                </div>
              </div>
              <!-- Payment method (Refs #545): flow state with no
                board counterpart — the board draws a single `Số
                tiền` input, while `RecordPayment` requires `method`
                (`cash` or `card`), so the method select stays
                inline. Option labels resolve through the catalogue
                in both locales. -->
              <div>
                <label for="folio-payment-method">
                  <span>{{ t('desk.folio.method_label', {}, 'Method: ') }}</span>
                  <select
                    id="folio-payment-method"
                    v-model="paymentMethod"
                    data-testid="folio-payment-method"
                  >
                    <option value="cash">
                      {{ t('desk.folio.method_cash', {}, 'Cash') }}
                    </option>
                    <option value="card">
                      {{ t('desk.folio.method_card', {}, 'Card') }}
                    </option>
                  </select>
                </label>
                <label for="folio-payment-amount">
                  {{ t('desk.folio.amount_label', {}, 'Amount') }}
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
                  class="folio-action"
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
            </template>
          </Card>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { formatVnd, t } from '../i18n';
import { useSessionStore } from '../stores/session';
import ReferenceDetails, { type ReferenceItem } from '../components/ReferenceDetails.vue';

// Folio screen as Vue SFCs (Refs #296, ADR-0003).
// Behavioural port of the inline script in `frontend/folio.html`
// (Screen 4: open the single folio per stay with GetFolioBalance,
// post room charges and hotel-defined extras with PostCharge, and
// record cash/card payments with RecordPayment, with the running
// balance always re-read from the server so the screen agrees with
// what the guest owes). The legacy page is untouched and stays
// served in parallel; this view runs under `/app/` (`/app/folio`).
//
// The #545 rebuild adopts the v2 board
// (`docs/design/Folio.dc.html:3`, epic #537): no screen title or
// intro, h3 card titles with the board copy (`Charges`,
// `Payment`), board-literal inputs (`Description`, `Amount`) and
// actions, plain name-plus-amount rows per card (charges left,
// payments right) with the due label plus the large due figure,
// and the running-balance sentence kept as flow state. The
// stay-ID open step, the charge-kind select, and the payment
// method select stay as flow state with no board counterpart
// (orchestrator decision on #545: `PostCharge` requires
// `itemKind`, `RecordPayment` requires `method`, and the open
// step is the only in-app path to a folio). Amounts render with
// the active locale grouping via `formatAmount` (values
// unchanged).
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

// Stay pointer the folio belongs to (Refs #568): the guest and the
// room the charges card names. Reads only identifiers — the human
// name and room number come from the guest and room reads below.
interface StayPointer {
  guestId?: string;
  currentRoomId?: string;
  roomId?: string;
}

// Open-folio context the charges card title names (Refs #568).
// Either half may stay empty when its read fails (the other half and
// the plain title still render); both empty keeps the plain title, so
// no half ever falls back to a record ID.
interface StayContext {
  guestName: string;
  roomNumber: string;
}

interface EntryRow {
  key: string;
  item: string;
  amount: string;
}

// Folio amounts are VND on the desk: the design shape (locale
// grouping, no decimals, `đ` suffix) comes from the shared
// `formatVnd` helper (Refs #565, G-FO-2), values unchanged.
function formatAmount(minor: number): string {
  return formatVnd(minor);
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
    extras.push(
      t(
        'desk.folio.tax_part',
        { amount: formatAmount(line.taxMinor) },
        `tax ${formatAmount(line.taxMinor)}`,
      ),
    );
  }
  if (line.feeMinor) {
    extras.push(
      t(
        'desk.folio.fee_part',
        { amount: formatAmount(line.feeMinor) },
        `fee ${formatAmount(line.feeMinor)}`,
      ),
    );
  }
  return extras.length > 0 ? `${line.itemName} (${extras.join(', ')})` : line.itemName;
}

function methodLabel(method: string): string {
  if (method === 'cash') {
    return t('desk.folio.method_cash', {}, 'Cash');
  }
  if (method === 'card') {
    return t('desk.folio.method_card', {}, 'Card');
  }
  return method;
}

function paymentRowText(line: PaymentLine): string {
  const method = methodLabel(line.method);
  return t('desk.folio.payment_row', { method }, `${line.method} payment`);
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

// The envelope `field` for VALIDATION_FAILED refusals (Refs #365):
// a bad payment method arrives as `{ field: 'method' }`, a bad stay
// or folio id as `{ field: 'stayId' }` / `{ field: 'folioId' }`.
// Branching stays on code+details, never on resolved wording.
function refusedField(err: unknown): string {
  if (typeof err !== 'object' || err === null) {
    return '';
  }
  const details = (err as ApiError).details as { field?: unknown } | null | undefined;
  return typeof details?.field === 'string' ? details.field : '';
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

// Housekeeping states a folio's room can be in, ordered so the
// common cases resolve in one or two reads (Refs #568): an in-house
// stay's room is occupied, and a checked-out stay's room is dirty
// next. The desk board uses the same five lanes.
const ROOM_STATES = ['occupied', 'vacant-dirty', 'vacant-clean', 'vacant-inspected', 'out-of-order'];

// Best-effort reader (Refs #568, issue #372 rule): a failed read
// resolves to empty so the charges title keeps its plain wording,
// while a signed-out response still reaches the one 401 gate.
async function bestEffortText(read: () => Promise<string>): Promise<string> {
  try {
    return await read();
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return '';
  }
}

async function readGuestName(guestId: string | undefined): Promise<string> {
  if (!guestId) {
    return '';
  }
  const guest = await apiFetch<{ fullName?: string }>('/v1/guests/GetGuest', {
    method: 'POST',
    body: JSON.stringify({ guestId }),
  });
  return guest.fullName ?? '';
}

async function readRoomNumber(roomId: string | undefined): Promise<string> {
  if (!roomId) {
    return '';
  }
  for (const state of ROOM_STATES) {
    const listed = await apiFetch<{ rooms?: Array<{ roomId?: string; number?: string }> }>(
      '/v1/rooms/ListRoomsByState',
      { method: 'POST', body: JSON.stringify({ state }) },
    );
    const match = (listed.rooms ?? []).find((room) => room.roomId === roomId);
    if (match?.number) {
      return match.number;
    }
  }
  return '';
}

// The open folio's guest and room (Refs #568,
// `docs/design/Folio.dc.html:3`): resolved from the stay the folio
// belongs to through the existing GetStay / GetGuest reads plus the
// room-state read the desk already uses (no new endpoint). A stay
// read failure leaves both halves empty, and a room the states do
// not list keeps the room half empty — the title never shows a UUID.
async function readStayContext(stayId: string): Promise<StayContext> {
  let stay: StayPointer;
  try {
    stay = await apiFetch<StayPointer>('/v1/stay/GetStay', {
      method: 'POST',
      body: JSON.stringify({ stayId }),
    });
  } catch (err) {
    if (isSignedOut(err)) {
      throw err;
    }
    return { guestName: '', roomNumber: '' };
  }
  const guestName = await bestEffortText(() => readGuestName(stay.guestId));
  const roomNumber = await bestEffortText(() => readRoomNumber(stay.currentRoomId ?? stay.roomId));
  return { guestName, roomNumber };
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
  components: { Button, Card, InputText, Message, ReferenceDetails },
  setup() {
    const session = useSessionStore();
    const stayId = ref(prefilledStayId());
    const folio = ref<Folio | null>(null);
    // Transient open-form notice (e.g. missing stay id). The
    // balance line below derives from the folio, so switching
    // locale re-formats it with no re-read (Refs #423, AC-DSK-5).
    const folioNotice = ref('');
    const folioStatus = computed<string>(() => {
      if (folioNotice.value) {
        return folioNotice.value;
      }
      const current = folio.value;
      if (!current) {
        return '';
      }
      return t(
        'desk.folio.folio_balance',
        { balance: formatAmount(current.balanceMinor) },
        `Folio balance: ${formatAmount(current.balanceMinor)}.`,
      );
    });
    // Exact record IDs stay hidden by default (issue #372 owner
    // amendment) and surface only in these reference details.
    const folioDetails = ref<ReferenceItem[]>([]);
    // Open-folio context (Refs #568): the guest and room the charges
    // card names. Empty until the stay read resolves, and cleared as
    // soon as the typed stay ID changes — a request token drops a
    // slow read so an older folio's context never paints over a
    // newer one.
    const stayContext = ref<StayContext>({ guestName: '', roomNumber: '' });
    let contextRequest = 0;
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

    // Board rows (Refs #545): the charges card lists one row per
    // charge and the payments card one row per payment, each in
    // posted/paid order with positive locale-grouped amounts as
    // drawn — no time or running-balance columns. Unrecognised
    // lines still surface through the catalogue raw-line wording.
    const chargeRows = computed<EntryRow[]>(() => {
      const current = folio.value;
      if (!current) {
        return [];
      }
      const rows: { at: string; item: string; amount?: number }[] = [];
      (current.charges ?? []).forEach((line: unknown) => {
        if (isCharge(line)) {
          rows.push({ at: line.postedAt, item: chargeItemText(line), amount: chargeTotal(line) });
        } else {
          rows.push({ at: '', item: rawLineText(line) });
        }
      });
      rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      return rows.map((row, index) => ({
        key: `charge-${index}`,
        item: row.item,
        amount: row.amount === undefined ? '' : formatAmount(row.amount),
      }));
    });

    const paymentRows = computed<EntryRow[]>(() => {
      const current = folio.value;
      if (!current) {
        return [];
      }
      const rows: { at: string; item: string; amount?: number }[] = [];
      (current.payments ?? []).forEach((line: unknown) => {
        if (isPayment(line)) {
          rows.push({ at: line.paidAt, item: paymentRowText(line), amount: line.amountMinor });
        } else {
          rows.push({ at: '', item: rawLineText(line) });
        }
      });
      rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      return rows.map((row, index) => ({
        key: `payment-${index}`,
        item: row.item,
        amount: row.amount === undefined ? '' : formatAmount(row.amount),
      }));
    });

    // Due figure (Refs #545, `docs/design/Folio.dc.html:3`): the
    // board's large amount under the due label; empty until a folio
    // is open (the sentence status below carries the notice and the
    // running-balance wording as flow state).
    const folioBalance = computed<string>(() => {
      const current = folio.value;
      return current ? formatAmount(current.balanceMinor) : '';
    });

    // Charges card title (Refs #568, `docs/design/Folio.dc.html:3`):
    // the board draws `Khoản phí · Lê Minh · P.201`. The plain title
    // stands until the context resolves; once either half is known an
    // unresolved half takes the catalogue wording (`Unknown guest`,
    // `Room number unavailable`) — never a raw record ID (issue #372
    // rule).
    const chargesHeading = computed<string>(() => {
      const heading = t('desk.folio.folio_heading', {}, 'Charges');
      const context = stayContext.value;
      if (!context.guestName && !context.roomNumber) {
        return heading;
      }
      const guest = context.guestName
        || t('desk.today.unknown_guest', {}, 'Unknown guest');
      const room = context.roomNumber
        ? t('desk.today.room_short', { room: context.roomNumber }, `Room ${context.roomNumber}`)
        : t('desk.today.room_unknown', {}, 'Room number unavailable');
      return t(
        'desk.folio.charges_context',
        { heading, guest, room },
        `${heading} · ${guest} · ${room}`,
      );
    });

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      folio.value = null;
      stayContext.value = { guestName: '', roomNumber: '' };
      contextRequest += 1;
      session.expireSession();
    }

    function renderFolio(next: Folio): void {
      folio.value = next;
      folioNotice.value = '';
      folioDetails.value = [
        { label: 'Stay ID', value: next.stayId },
        { label: 'Folio ID', value: next.folioId },
      ];
    }

    // Re-resolve the context for the folio just rendered (Refs #568).
    // The token makes the newest request the only one that paints, so
    // a slow read never names the previous guest after the typed stay
    // ID changed; the context itself clears on that change
    // (`onStayIdInput`), so re-reads after a post or payment keep the
    // title steady instead of blanking it.
    async function loadStayContext(stayId: string): Promise<void> {
      const request = ++contextRequest;
      const resolved = await readStayContext(stayId);
      if (request === contextRequest) {
        stayContext.value = resolved;
      }
    }

    async function readFolio(id: string): Promise<void> {
      const next = await apiFetch<Folio>('/v1/billing/GetFolioBalance', {
        method: 'POST',
        body: JSON.stringify({ stayId: id, actor: session.displayName ?? '' }),
      });
      renderFolio(next);
      await loadStayContext(next.stayId || id);
    }

    function onStayIdInput(): void {
      folio.value = null;
      folioNotice.value = '';
      folioDetails.value = [];
      stayContext.value = { guestName: '', roomNumber: '' };
      contextRequest += 1;
      openError.value = '';
    }

    async function onOpen(): Promise<void> {
      if (opening.value) {
        return;
      }
      const id = stayId.value.trim();
      if (!id) {
        folioNotice.value = t('desk.folio.need_stay', {}, 'Enter a stay ID first.');
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
        // No folio for the stay: billing refuses an unknown folio
        // with NOT_FOUND and a malformed stay id with
        // VALIDATION_FAILED naming the field (Refs #365).
        if (
          errorCode(err) === 'NOT_FOUND' ||
          (errorCode(err) === 'VALIDATION_FAILED' &&
            (refusedField(err) === 'stayId' || refusedField(err) === 'folioId'))
        ) {
          openError.value = t(
            'desk.folio.refused_unknown_folio',
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
            amount: formatAmount(chargeTotal(posted)),
            postedAt: posted.postedAt,
          },
          `Posted ${posted.itemName}: ${formatAmount(chargeTotal(posted))} at ${posted.postedAt}.`,
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
            amount: formatAmount(recorded.amountMinor),
            paidAt: recorded.paidAt,
          },
          `Recorded ${recorded.method} payment: ${formatAmount(recorded.amountMinor)} at ${recorded.paidAt}.`,
        );
        paymentAmount.value = '';
        await readFolio(id);
      } catch (err) {
        if (isSignedOut(err)) {
          expireToGate();
          return;
        }
        // A method other than cash or card is refused
        // VALIDATION_FAILED naming the field (Refs #365): name the
        // accepted methods instead of the raw envelope.
        if (errorCode(err) === 'VALIDATION_FAILED' && refusedField(err) === 'method') {
          paymentError.value = t(
            'desk.folio.refused_bad_method',
            {},
            'That payment method is not accepted. Use cash or card.',
          );
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
      chargesHeading,
      folioBalance,
      folioStatus,
      folioDetails,
      openError,
      opening,
      chargeRows,
      paymentRows,
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
