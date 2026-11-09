<template>
  <main data-testid="manage-view">
    <!-- Rooms and rates management screen (Refs #590): the three
      setup sections of the approved board
      (`docs/design/RoomsRates.dc.md` sections 4-7) in setup order —
      room types, rooms and floors, nightly prices — driving the seven
      existing rooms and rates operations. Spec:
      `docs/product/rooms-rates-management.md` (T2 reader-visible
      change); the flow diagrams are `docs/architecture/lld.md`
      section 19. Views carry no style blocks (M4): every rule lives
      in the shell stylesheet (`App.vue`, `@media screen`). -->
    <noscript><p>{{ t('desk.manage.noscript', {}, 'This page needs JavaScript to manage rooms and prices.') }}</p></noscript>

    <div class="manage-head">
      <h1 class="manage-title">
        {{ t('desk.manage.title', {}, 'Manage rooms and rates') }}
      </h1>
      <p class="manage-intro">
        {{ t('desk.manage.intro', {}, 'Set up room types, place rooms on floors, and set the nightly price for each date.') }}
      </p>
    </div>

    <!-- Refusal path (Refs #590 section 8, G6): the product-surface
      rule on top of today's token-only operations. Front-desk sees
      every list read-only with product wording, never an envelope
      code, and the view makes no write call on that path. -->
    <Message
      v-if="!canManage"
      severity="info"
      data-testid="manage-readonly-notice"
    >
      {{ roleReadonly }}
    </Message>
    <Message
      v-if="!canManage"
      severity="warn"
      data-testid="manage-refused-notice"
    >
      {{ refusedRole }}
    </Message>
    <Message
      v-if="loading"
      severity="info"
      data-testid="manage-loading"
    >
      {{ t('desk.manage.loading', {}, 'Loading rooms and prices…') }}
    </Message>

    <!-- Section A - room types (board section 5). -->
    <section
      data-testid="manage-types"
      class="manage-section"
    >
      <div class="manage-grid-types">
        <Card data-testid="manage-types-card">
          <template #title>
            <h3>{{ typesHeading }}</h3>
          </template>
          <template #content>
            <Message
              v-if="typesError"
              severity="error"
              role="alert"
              data-testid="manage-types-error"
            >
              {{ typesError }}
            </Message>
            <Button
              v-if="typesError"
              type="button"
              class="manage-action-secondary"
              :label="t('desk.manage.retry', {}, 'Try again')"
              data-testid="manage-types-retry"
              @click="refreshTypes"
            />
            <div
              class="manage-rows"
              data-testid="manage-type-rows"
            >
              <div
                v-for="type in roomTypes"
                :key="type.id"
                class="manage-row"
                data-testid="manage-type-row"
              >
                <span class="manage-row-main">
                  <strong>{{ type.name }}</strong>
                  <span class="manage-row-meta">{{ typeMeta(type) }}</span>
                </span>
                <Button
                  type="button"
                  class="manage-row-action"
                  :label="t('desk.manage.edit', {}, 'Edit')"
                  :disabled="!canManage"
                  :title="canManage ? undefined : refusedRole"
                  :data-testid="`manage-type-edit-${type.id}`"
                  @click="onEditType(type)"
                />
              </div>
              <p
                v-if="!typesLoading && roomTypes.length === 0"
                class="manage-empty"
                data-testid="manage-types-empty"
              >
                {{ typesEmpty }}
              </p>
            </div>
          </template>
        </Card>

        <Card data-testid="manage-type-form-card">
          <template #title>
            <h3>{{ editingType ? typeEditHeading : typeNewHeading }}</h3>
          </template>
          <template #content>
            <form
              class="manage-form"
              data-testid="manage-type-form"
              @submit.prevent="onSaveType"
            >
              <label for="manage-type-name">
                {{ t('desk.manage.type_name_label', {}, 'Type name') }}
                <InputText
                  id="manage-type-name"
                  v-model="typeName"
                  name="manage-type-name"
                  data-testid="manage-type-name"
                  :readonly="editingType !== null"
                />
              </label>
              <p
                v-if="editingType"
                class="manage-hint"
                data-testid="manage-type-name-locked"
              >
                {{ t('desk.manage.type_name_locked', {}, 'The name cannot be changed here. A different name creates a new room type.') }}
              </p>
              <label for="manage-type-capacity">
                {{ t('desk.manage.type_capacity_label', {}, 'Guests') }}
                <InputText
                  id="manage-type-capacity"
                  v-model="typeCapacity"
                  name="manage-type-capacity"
                  inputmode="numeric"
                  data-testid="manage-type-capacity"
                />
              </label>
              <label for="manage-type-bed">
                {{ t('desk.manage.type_bed_label', {}, 'Bed type') }}
                <select
                  id="manage-type-bed"
                  v-model="typeBedType"
                  name="manage-type-bed"
                  data-testid="manage-type-bed"
                >
                  <option value="">
                    —
                  </option>
                  <option
                    v-for="option in bedTypeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <p
                v-if="typeFormError"
                class="manage-error"
                role="alert"
                data-testid="manage-type-error"
              >
                {{ typeFormError }}
              </p>
              <p
                v-if="typeSavedMessage"
                class="manage-success"
                data-testid="manage-type-success"
              >
                {{ typeSavedMessage }}
              </p>
              <div class="manage-actions">
                <Button
                  type="submit"
                  class="manage-action"
                  :label="t('desk.manage.type_save', {}, 'Save room type')"
                  :disabled="!canManage || typeSaving"
                  :title="canManage ? undefined : refusedRole"
                  data-testid="manage-type-save"
                />
                <Button
                  v-if="editingType"
                  type="button"
                  class="manage-action-secondary"
                  :label="t('desk.manage.type_new', {}, 'New room type')"
                  :disabled="!canManage"
                  :title="canManage ? undefined : refusedRole"
                  data-testid="manage-type-new"
                  @click="onNewType"
                />
              </div>
            </form>
          </template>
        </Card>
      </div>
    </section>

    <!-- Section B - rooms and floors (board section 6). -->
    <section
      data-testid="manage-rooms"
      class="manage-section"
    >
      <Card data-testid="manage-add-room-card">
        <template #title>
          <h3>{{ t('desk.manage.rooms_add_heading', {}, 'Add a room') }}</h3>
        </template>
        <template #content>
          <form
            class="manage-form manage-form-wide"
            data-testid="manage-room-form"
            @submit.prevent="onAddRoom"
          >
            <label for="manage-room-number">
              {{ t('desk.manage.room_number_label', {}, 'Room number') }}
              <InputText
                id="manage-room-number"
                v-model="roomNumber"
                name="manage-room-number"
                data-testid="manage-room-number"
              />
            </label>
            <label for="manage-room-type">
              {{ t('desk.manage.room_type_label', {}, 'Room type') }}
              <select
                id="manage-room-type"
                v-model="roomTypeId"
                name="manage-room-type"
                data-testid="manage-room-type"
              >
                <option value="">
                  —
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
            <label for="manage-room-floor">
              {{ t('desk.manage.room_floor_label', {}, 'Floor') }}
              <InputText
                id="manage-room-floor"
                v-model="roomFloor"
                name="manage-room-floor"
                data-testid="manage-room-floor"
              />
            </label>
            <label for="manage-room-bed">
              {{ t('desk.manage.type_bed_label', {}, 'Bed type') }}
              <select
                id="manage-room-bed"
                v-model="roomBedType"
                name="manage-room-bed"
                data-testid="manage-room-bed"
              >
                <option value="">
                  —
                </option>
                <option
                  v-for="option in bedTypeOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label for="manage-room-capacity">
              {{ t('desk.manage.type_capacity_label', {}, 'Guests') }}
              <InputText
                id="manage-room-capacity"
                v-model="roomCapacity"
                name="manage-room-capacity"
                inputmode="numeric"
                data-testid="manage-room-capacity"
              />
            </label>
            <p
              v-if="roomFormError"
              class="manage-error"
              role="alert"
              data-testid="manage-room-error"
            >
              {{ roomFormError }}
            </p>
            <p
              v-if="roomSavedMessage"
              class="manage-success"
              data-testid="manage-room-success"
            >
              {{ roomSavedMessage }}
            </p>
            <div class="manage-actions">
              <Button
                type="submit"
                class="manage-action"
                :label="t('desk.manage.room_save', {}, 'Save room')"
                :disabled="!canManage || roomSaving"
                :title="canManage ? undefined : refusedRole"
                data-testid="manage-room-save"
              />
            </div>
          </form>
        </template>
      </Card>

      <Card data-testid="manage-rooms-card">
        <template #title>
          <h3>{{ t('desk.manage.rooms_heading', {}, 'Rooms by floor') }}</h3>
        </template>
        <template #content>
          <Message
            v-if="roomsError"
            severity="error"
            role="alert"
            data-testid="manage-rooms-error"
          >
            {{ roomsError }}
          </Message>
          <Message
            v-if="failedRoomStates.length > 0"
            severity="warn"
            data-testid="manage-rooms-partial"
          >
            {{ failedStatesNotice }}
          </Message>
          <Button
            v-if="roomsError || failedRoomStates.length > 0"
            type="button"
            class="manage-action-secondary"
            :label="t('desk.manage.retry', {}, 'Try again')"
            data-testid="manage-rooms-retry"
            @click="refreshRooms"
          />
          <Message
            v-if="roomRowError"
            severity="error"
            role="alert"
            data-testid="manage-room-row-error"
          >
            {{ roomRowError }}
          </Message>
          <div
            v-for="floor in floors"
            :key="floor.key"
            class="manage-floor"
            :data-testid="floor.unknown ? 'manage-floor-unknown' : 'manage-floor'"
          >
            <h3 class="manage-floor-title">
              {{ floor.title }} {{ roomCountLabel(floor.rooms.length) }}
            </h3>
            <div class="manage-rows">
              <div
                v-for="room in floor.rooms"
                :key="room.roomId"
                class="manage-row manage-room-row"
                data-testid="manage-room-row"
              >
                <span class="manage-room-number">
                  <strong>{{ room.number }}</strong>
                  <span class="manage-row-meta">{{ roomTypeName(room.roomTypeId) }}</span>
                </span>
                <InputText
                  v-model="floorDrafts[room.number]"
                  class="manage-room-floor"
                  :aria-label="t('desk.manage.room_floor_label', {}, 'Floor')"
                  :data-testid="`manage-room-floor-${room.number}`"
                />
                <select
                  v-model="typeDrafts[room.number]"
                  :aria-label="t('desk.manage.room_type_label', {}, 'Room type')"
                  :data-testid="`manage-room-type-${room.number}`"
                >
                  <option
                    v-for="type in roomTypes"
                    :key="type.id"
                    :value="type.id"
                  >
                    {{ type.name }}
                  </option>
                </select>
                <Button
                  type="button"
                  class="manage-row-action"
                  :label="t('desk.manage.save', {}, 'Save')"
                  :disabled="!canManage || roomLineSaving[room.number] === true"
                  :title="canManage ? undefined : refusedRole"
                  :data-testid="`manage-room-save-${room.number}`"
                  @click="onSaveRoomRow(room)"
                />
              </div>
            </div>
          </div>
          <p
            v-if="!roomsLoading && rooms.length === 0"
            class="manage-empty"
            data-testid="manage-rooms-empty"
          >
            {{ t('desk.manage.rooms_empty', {}, 'No rooms yet. Add the first room to start the room map.') }}
          </p>
        </template>
      </Card>
    </section>

    <!-- Section C - nightly prices (board section 7). -->
    <section
      data-testid="manage-rates"
      class="manage-section"
    >
      <Card data-testid="manage-rates-card">
        <template #title>
          <h3>{{ t('desk.manage.rates_heading', {}, 'Nightly prices') }}</h3>
        </template>
        <template #content>
          <div class="manage-rate-controls">
            <label for="manage-rate-type">
              {{ t('desk.manage.room_type_label', {}, 'Room type') }}
              <select
                id="manage-rate-type"
                v-model="priceTypeId"
                name="manage-rate-type"
                data-testid="manage-rate-type"
                @change="onRateInput"
              >
                <option value="">
                  —
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
            <label for="manage-rate-plan">
              {{ t('desk.manage.rate_plan_label', {}, 'Rate plan') }}
              <InputText
                id="manage-rate-plan"
                v-model="ratePlan"
                name="manage-rate-plan"
                data-testid="manage-rate-plan"
                @input="onRateInput"
              />
            </label>
            <label for="manage-rate-from">
              {{ t('desk.manage.rate_from_label', {}, 'First night') }}
              <DatePicker
                v-model="firstNightPicker"
                input-id="manage-rate-from"
                name="manage-rate-from"
                :date-format="deskDateFormat"
                :placeholder="t('desk.book.date_placeholder', {}, datePlaceholder)"
                :manual-input="true"
                :show-on-focus="false"
                show-icon
                icon-display="input"
                :pt="firstNightAttrs"
              />
            </label>
            <label for="manage-rate-to">
              {{ t('desk.manage.rate_to_label', {}, 'Last night') }}
              <DatePicker
                v-model="lastNightPicker"
                input-id="manage-rate-to"
                name="manage-rate-to"
                :date-format="deskDateFormat"
                :placeholder="t('desk.book.date_placeholder', {}, datePlaceholder)"
                :manual-input="true"
                :show-on-focus="false"
                show-icon
                icon-display="input"
                :pt="lastNightAttrs"
              />
            </label>
            <div class="manage-rate-read">
              <Button
                type="button"
                class="manage-action"
                :label="t('desk.manage.rate_reload', {}, 'Read prices')"
                :disabled="ratesReading || priceWriting"
                data-testid="manage-rate-read"
                @click="readPrices"
              />
            </div>
          </div>
          <p
            class="manage-hint"
            data-testid="manage-rate-plan-hint"
          >
            {{ t('desk.manage.rate_plan_hint', {}, 'If this rate plan does not exist yet, the screen offers to create it before saving prices.') }}
          </p>

          <p
            v-if="ratesError"
            class="manage-error"
            role="alert"
            data-testid="manage-rates-error"
          >
            {{ ratesError }}
          </p>

          <p
            v-if="rangeSummary !== ''"
            class="manage-rate-summary"
            data-testid="manage-rate-summary"
          >
            {{ rangeSummary }}
          </p>

          <!-- Read-path plan-missing state (board sections 7.2-7.3,
            AC-MANAGE-7): a quote naming an unknown rate plan is the
            only signal that the plan does not exist, so the read
            offers the same explicit create action the save path
            does. Nothing is created behind the manager's back. -->
          <div
            v-if="planMissingOnRead"
            class="manage-plan-missing"
            data-testid="manage-rate-plan-read-missing"
          >
            <p class="manage-error">
              {{ t('desk.manage.rate_plan_missing', {}, 'No rate plan has this name yet.') }}
            </p>
            <Button
              type="button"
              class="manage-action"
              :label="t('desk.manage.rate_plan_create', {}, 'Create this rate plan')"
              :disabled="!canManage || priceWriting || ratesReading"
              :title="canManage ? undefined : refusedRole"
              data-testid="manage-rate-plan-read-create"
              @click="onCreatePlanFromRead"
            />
          </div>

          <!-- The no-price state (board section 7.4, AC-MANAGE-9):
            reuses #589's "not open for booking" phrase, invents no
            price, and keeps the pricing form usable inside it. -->
          <div
            v-if="showEmptyState"
            class="manage-rate-empty"
            data-testid="manage-rate-empty"
          >
            <h4 class="manage-rate-empty-title">
              {{ emptyStateTitle }}
            </h4>
            <p class="manage-rate-empty-body">
              {{ t('desk.manage.rate_empty_body', {}, 'No price is set for these dates, so the front desk cannot quote it. Enter a nightly price below to open it.') }}
            </p>
          </div>

          <!-- Nightly grid (board section 7.2): one column per night,
            seven per page, exact per-night state and never a guessed
            price. -->
          <div
            v-if="!showEmptyState && visibleNights.length > 0"
            class="manage-rate-grid"
            data-testid="manage-rate-grid"
          >
            <div
              v-for="night in visibleNights"
              :key="night"
              class="manage-rate-cell"
              data-testid="manage-rate-cell"
            >
              <span class="manage-rate-weekday">{{ weekdayLabel(night) }}</span>
              <span class="manage-rate-date">{{ formatDeskDate(night) }}</span>
              <span
                class="manage-rate-amount"
                :data-testid="`manage-rate-amount-${night}`"
              >{{ cellPrice(night) }}</span>
              <span
                v-if="cellCaption(night) !== ''"
                class="manage-rate-caption"
                :data-testid="`manage-rate-caption-${night}`"
              >{{ cellCaption(night) }}</span>
            </div>
          </div>
          <div
            v-if="pagedNights.length > PAGE_NIGHTS"
            class="manage-actions"
          >
            <Button
              type="button"
              class="manage-action-secondary"
              :label="t('desk.manage.rate_prev', {}, 'Earlier nights')"
              :disabled="page === 0 || ratesReading"
              data-testid="manage-rate-prev"
              @click="readPage(page - 1)"
            />
            <Button
              type="button"
              class="manage-action-secondary"
              :label="t('desk.manage.rate_next', {}, 'Later nights')"
              :disabled="(page + 1) * PAGE_NIGHTS >= selectedNights.length || ratesReading"
              data-testid="manage-rate-next"
              @click="readPage(page + 1)"
            />
          </div>

          <form
            class="manage-form manage-form-wide"
            data-testid="manage-rate-form"
            @submit.prevent="onSavePrice"
          >
            <label for="manage-rate-amount">
              {{ t('desk.manage.rate_price_label', {}, 'Price per night') }}
              <InputText
                id="manage-rate-amount"
                v-model="priceAmount"
                name="manage-rate-amount"
                inputmode="numeric"
                data-testid="manage-rate-amount"
              />
            </label>
            <p
              v-if="overwriteNote !== ''"
              class="manage-hint"
              data-testid="manage-rate-overwrite"
            >
              {{ overwriteNote }}
            </p>
            <div class="manage-actions">
              <Button
                type="submit"
                class="manage-action"
                :label="saveLabel"
                :disabled="!canManage || priceWriting"
                :title="canManage ? undefined : refusedRole"
                data-testid="manage-rate-save"
              />
              <Button
                v-if="partialFailure !== null"
                type="button"
                class="manage-action-secondary"
                :label="t('desk.manage.rate_retry', {}, 'Save the remaining nights')"
                :disabled="!canManage || priceWriting"
                :title="canManage ? undefined : refusedRole"
                data-testid="manage-rate-resume"
                @click="onResume"
              />
            </div>
          </form>

          <p
            v-if="partialFailure !== null"
            class="manage-error"
            role="alert"
            data-testid="manage-rate-partial"
          >
            {{ partialMessage }}
          </p>
          <div
            v-if="planMissing !== null"
            class="manage-plan-missing"
            data-testid="manage-rate-plan-missing"
          >
            <p class="manage-error">
              {{ t('desk.manage.rate_plan_missing', {}, 'No rate plan has this name yet.') }}
            </p>
            <Button
              type="button"
              class="manage-action"
              :label="t('desk.manage.rate_plan_create', {}, 'Create this rate plan')"
              :disabled="!canManage || priceWriting"
              :title="canManage ? undefined : refusedRole"
              data-testid="manage-rate-plan-create"
              @click="onCreatePlan"
            />
          </div>
          <p
            v-if="ratesSuccess !== ''"
            class="manage-success"
            data-testid="manage-rates-success"
          >
            {{ ratesSuccess }}
          </p>
        </template>
      </Card>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
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

// Rooms and rates management desk screen (Refs #590, T2).
//
// The screen drives seven operations that already exist:
// `ListRoomTypes`, `UpsertRoomType`, `UpsertRoom`,
// `ListRoomsByState` (rooms) and `UpsertRatePlan`,
// `UpsertRatePrice`, `QuotePrice` (rates). It adds no operation,
// contract, schema, state value, design token, or pricing semantic
// (`docs/product/rooms-rates-management.md` section 10).
//
// Flow decisions this file implements, with their specification:
// - Room types: keyed by name, so the name is read-only while editing
//   (G1) and `features` is never sent, so the service preserves the
//   stored object (`services/rooms/src/pgstore.ts`). LLD 19.5-19.6.
// - Rooms: the five state reads are merged by `roomId`; a blank floor
//   field omits the member so the stored floor is kept (G5), and the
//   service preserves the room's state on update. LLD 19.3-19.4.
// - Prices: read one night at a time through `QuotePrice` (G2), write
//   one `UpsertRatePrice` row per night in date order, stop at the
//   first failure, and resume from that night; a plan is created only
//   through the explicit action on the first unknown-plan refusal
//   (O-4). LLD 19.1-19.2.
// - Refusal: a cosmetic client gate on the session role (G6); the
//   operations check the token only today, and this screen claims no
//   server-side enforcement. LLD 19.7.
const ROOM_STATES = [
  'occupied',
  'vacant-dirty',
  'vacant-clean',
  'vacant-inspected',
  'out-of-order',
] as const;

// Rate-plan name remembered per browser as a UI preference only,
// never auth data (O-4, board section 7.1).
const RATE_PLAN_STORAGE_KEY = 'hotel-mgmt.desk.manage.rate-plan';
const PAGE_NIGHTS = 7;
const MAX_NIGHTS = 31;
const MAX_PRICE_DONG = 100000000;

interface RoomTypeRow {
  id: string;
  name: string;
  capacity: number | null;
  bedType: string | null;
}

interface RoomRow {
  roomId: string;
  number: string;
  roomTypeId: string;
  state: string;
  floor: string;
}

interface FloorGroup {
  key: string;
  title: string;
  unknown: boolean;
  rooms: RoomRow[];
}

type NightState = 'priced' | 'missing' | 'unreadable' | 'plan-missing';

interface NightCell {
  date: string;
  state: NightState;
  priceMinor: number | null;
}

interface BedOption {
  value: string;
  label: string;
}

interface SaveStop {
  saved: number;
  total: number;
  index: number;
}

interface PartialFailure extends SaveStop {
  date: string;
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

function errorDetails(err: unknown): { reason?: unknown; ratePlanName?: unknown } {
  if (typeof err !== 'object' || err === null) {
    return {};
  }
  const details = (err as ApiError).details;
  return typeof details === 'object' && details !== null
    ? (details as { reason?: unknown; ratePlanName?: unknown })
    : {};
}

// Catalogue fallback for the picker shape, mirroring the active desk
// form exactly as the Book screen does (Refs #581).
function fallbackDatePlaceholder(): string {
  return catalogueLocale() === 'en' ? 'mm/dd/yyyy' : 'dd/mm/yyyy';
}

// Inclusive night list on the hotel calendar day: the night is the
// date the guest sleeps, so a 01/12 -> 07/12 range is seven nights
// (board section 7.1, O-3).
function nightList(from: string, to: string): string[] {
  const nights: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor !== '' && cursor <= to && guard < 400) {
    nights.push(cursor);
    const date = dateFromCanonical(cursor);
    if (date === null) {
      break;
    }
    date.setDate(date.getDate() + 1);
    cursor = canonicalFromDate(date);
    guard += 1;
  }
  return nights;
}

function addDays(canonical: string, days: number): string {
  const date = dateFromCanonical(canonical);
  if (date === null) {
    return '';
  }
  date.setDate(date.getDate() + days);
  return canonicalFromDate(date);
}

function readStoredPlan(): string {
  try {
    return globalThis.localStorage.getItem(RATE_PLAN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredPlan(name: string): void {
  try {
    globalThis.localStorage.setItem(RATE_PLAN_STORAGE_KEY, name);
  } catch {
    // Storage unavailable (private mode): the name still works for
    // this session; only the per-browser memory is lost.
  }
}

export default defineComponent({
  name: 'ManageView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Card, DatePicker, InputText, Message },
  setup() {
    const session = useSessionStore();

    // Cosmetic role gate (Refs #340, G6): the same session value the
    // Admin console reads. Server enforcement is untouched and is not
    // claimed here.
    const canManage = computed(
      () => session.role === 'owner' || session.role === 'manager',
    );
    // Catalogue copy resolves through computed refs, so a locale
    // switch re-renders every state line without a reload.
    const roleReadonly = computed<string>(() =>
      t(
        'desk.manage.role_readonly',
        {},
        'You can see the setup here; only the owner or a manager can change it.',
      ),
    );
    const refusedRole = computed<string>(() =>
      t(
        'desk.manage.refused_role',
        {},
        'Only the owner or a manager can change rooms and prices. Ask a manager if something needs changing.',
      ),
    );

    const roomTypes = ref<RoomTypeRow[]>([]);
    const typesLoading = ref(false);
    const typesError = ref('');
    const rooms = ref<RoomRow[]>([]);
    const roomsLoading = ref(false);
    const roomsError = ref('');
    const failedRoomStates = ref<string[]>([]);
    const loading = computed(() => typesLoading.value || roomsLoading.value);

    const readError = computed<string>(() =>
      t('desk.manage.read_error', {}, 'Could not read the setup. Try again.'),
    );
    const errorGeneric = computed<string>(() =>
      t('desk.manage.error_generic', {}, 'That did not save. Check the values and try again.'),
    );

    function expireToGate(): void {
      session.expireSession();
    }

    function actorName(): string {
      return session.displayName ?? '';
    }

    // ---------------------------------------------------------------
    // Section A - room types
    // ---------------------------------------------------------------
    const editingTypeId = ref('');
    const typeName = ref('');
    const typeCapacity = ref('');
    const typeBedType = ref('');
    const typeFormError = ref('');
    const typeSaving = ref(false);
    const typeSavedMessage = ref('');

    const editingType = computed<RoomTypeRow | null>(
      () => roomTypes.value.find((type) => type.id === editingTypeId.value) ?? null,
    );
    const typesHeading = computed<string>(() =>
      t(
        'desk.manage.types_heading',
        { count: roomTypes.value.length },
        `Room types (${roomTypes.value.length})`,
      ),
    );
    const typesEmpty = computed<string>(() =>
      t(
        'desk.manage.types_empty',
        {},
        'No room types yet. Create the first type so rooms can be set up.',
      ),
    );
    const typeNewHeading = computed<string>(() =>
      t('desk.manage.type_new_heading', {}, 'New room type'),
    );
    const typeEditHeading = computed<string>(() =>
      t('desk.manage.type_edit_heading', {}, 'Edit room type'),
    );

    // Catalogue-led bed-type options (board section 5.2). A stored
    // value the options do not know (the first-run wizard keeps free
    // text) stays selectable under its own label, so an edit never
    // silently rewrites it.
    const bedTypeOptions = computed<BedOption[]>(() => {
      const options: BedOption[] = [
        { value: 'double', label: t('desk.manage.bed_double', {}, 'Double bed') },
        { value: 'twin', label: t('desk.manage.bed_twin', {}, 'Twin beds') },
        { value: 'single', label: t('desk.manage.bed_single', {}, 'Single bed') },
      ];
      const stored = typeBedType.value.trim();
      if (stored !== '' && !options.some((option) => option.value === stored)) {
        options.push({ value: stored, label: stored });
      }
      return options;
    });

    function bedTypeLabel(value: string): string {
      const match = bedTypeOptions.value.find((option) => option.value === value);
      return match?.label ?? value;
    }

    function typeMeta(type: RoomTypeRow): string {
      const capacity = type.capacity === null || type.capacity === undefined
        ? '—'
        : String(type.capacity);
      const bedType = type.bedType === null || type.bedType === undefined || type.bedType === ''
        ? '—'
        : bedTypeLabel(type.bedType);
      return t(
        'desk.manage.type_row_meta',
        { capacity, bedType },
        `${capacity} guests · ${bedType}`,
      );
    }

    async function refreshTypes(): Promise<void> {
      typesLoading.value = true;
      try {
        const listed = await apiFetch<{
          roomTypes?: Array<{ id?: string; name?: string; capacity?: number | null; bedType?: string | null }>;
        }>('/v1/rooms/ListRoomTypes', { method: 'POST', body: JSON.stringify({}) });
        roomTypes.value = (listed.roomTypes ?? [])
          .filter((type) => typeof type.id === 'string' && typeof type.name === 'string')
          .map((type) => ({
            id: type.id as string,
            name: type.name as string,
            capacity: type.capacity ?? null,
            bedType: type.bedType ?? null,
          }));
        typesError.value = '';
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        typesError.value = readError.value;
      } finally {
        typesLoading.value = false;
      }
    }

    function resetTypeForm(): void {
      editingTypeId.value = '';
      typeName.value = '';
      typeCapacity.value = '';
      typeBedType.value = '';
      typeFormError.value = '';
    }

    function onEditType(type: RoomTypeRow): void {
      if (!canManage.value) {
        return;
      }
      editingTypeId.value = type.id;
      typeName.value = type.name;
      typeCapacity.value = type.capacity === null ? '' : String(type.capacity);
      typeBedType.value = type.bedType ?? '';
      typeFormError.value = '';
      typeSavedMessage.value = '';
    }

    function onNewType(): void {
      if (!canManage.value) {
        return;
      }
      resetTypeForm();
      typeSavedMessage.value = '';
    }

    async function onSaveType(): Promise<void> {
      // Refusal path: the disabled control sends nothing even if a
      // stray event reaches the handler (LLD 19.7 B-D / B-E).
      if (!canManage.value || typeSaving.value) {
        return;
      }
      typeFormError.value = '';
      typeSavedMessage.value = '';
      const name = typeName.value.trim();
      if (name === '') {
        typeFormError.value = t('desk.manage.type_name_required', {}, 'Enter a room type name.');
        return;
      }
      const capacityText = typeCapacity.value.trim();
      let capacity: number | undefined;
      if (capacityText !== '') {
        if (!/^\d+$/.test(capacityText)) {
          typeFormError.value = t(
            'desk.manage.type_capacity_invalid',
            {},
            'Enter a whole number of guests from 1 to 20, or leave it empty.',
          );
          return;
        }
        capacity = Number(capacityText);
        if (capacity < 1 || capacity > 20) {
          typeFormError.value = t(
            'desk.manage.type_capacity_invalid',
            {},
            'Enter a whole number of guests from 1 to 20, or leave it empty.',
          );
          return;
        }
      }
      // Only the fields the manager filled, never `features`: the
      // service merges the stored object when the member is absent
      // (G1, LLD 19.5 E-F).
      const payload: Record<string, unknown> = { name, actor: actorName() };
      if (capacity !== undefined) {
        payload['capacity'] = capacity;
      }
      const bedType = typeBedType.value.trim();
      if (bedType !== '') {
        payload['bedType'] = bedType;
      }
      typeSaving.value = true;
      try {
        await apiFetch<unknown>('/v1/rooms/UpsertRoomType', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        resetTypeForm();
        typeSavedMessage.value = t('desk.manage.type_saved', { name }, `Saved ${name}.`);
        await refreshTypes();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        typeFormError.value = errorCode(err) === 'FORBIDDEN' ? refusedRole.value : errorGeneric.value;
      } finally {
        typeSaving.value = false;
      }
    }

    // ---------------------------------------------------------------
    // Section B - rooms and floors
    // ---------------------------------------------------------------
    const roomNumber = ref('');
    const roomTypeId = ref('');
    const roomFloor = ref('');
    const roomBedType = ref('');
    const roomCapacity = ref('');
    const roomFormError = ref('');
    const roomSaving = ref(false);
    const roomSavedMessage = ref('');
    const roomRowError = ref('');
    const floorDrafts = ref<Record<string, string>>({});
    const typeDrafts = ref<Record<string, string>>({});
    const roomLineSaving = ref<Record<string, boolean>>({});

    const typeNameById = computed<Record<string, string>>(() => {
      const names: Record<string, string> = {};
      for (const type of roomTypes.value) {
        names[type.id] = type.name;
      }
      return names;
    });

    function typeNameOf(roomTypeIdValue: string): string {
      return typeNameById.value[roomTypeIdValue]
        ?? t('desk.today.room_type_unresolved', {}, 'Room type');
    }

    const failedStatesNotice = computed<string>(() => {
      const names = failedRoomStates.value.join(', ');
      return `${readError.value} (${names})`;
    });

    function roomCountLabel(count: number): string {
      return t('desk.manage.room_count', { count }, `(${count} rooms)`);
    }

    // Floor grouping follows the Rooms map's existing rule (LLD 19.3
    // E-F): floor labels in numeric order plus one no-floor group, so
    // an empty floor never drops a room.
    const floors = computed<FloorGroup[]>(() => {
      const groups = new Map<string, RoomRow[]>();
      const unknown: RoomRow[] = [];
      for (const room of rooms.value) {
        if (room.floor.trim() !== '') {
          const list = groups.get(room.floor);
          if (list) {
            list.push(room);
          } else {
            groups.set(room.floor, [room]);
          }
        } else {
          unknown.push(room);
        }
      }
      const byNumber = (a: RoomRow, b: RoomRow): number =>
        a.number.localeCompare(b.number, undefined, { numeric: true });
      const ordered: FloorGroup[] = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
        .map(([key, list]) => ({
          key,
          title: t('desk.rooms.floor_title', { floor: key }, `Floor ${key}`),
          unknown: false,
          rooms: [...list].sort(byNumber),
        }));
      if (unknown.length > 0) {
        ordered.push({
          key: 'unknown',
          title: t('desk.rooms.floor_unknown', {}, 'Rooms without a listed floor'),
          unknown: true,
          rooms: [...unknown].sort(byNumber),
        });
      }
      return ordered;
    });

    function resetRoomDrafts(): void {
      const floorsDraft: Record<string, string> = {};
      const typesDraft: Record<string, string> = {};
      for (const room of rooms.value) {
        floorsDraft[room.number] = room.floor;
        typesDraft[room.number] = room.roomTypeId;
      }
      floorDrafts.value = floorsDraft;
      typeDrafts.value = typesDraft;
    }

    async function refreshRooms(): Promise<void> {
      roomsLoading.value = true;
      roomsError.value = '';
      failedRoomStates.value = [];
      try {
        const merged = new Map<string, RoomRow>();
        const failed: string[] = [];
        for (const state of ROOM_STATES) {
          try {
            const answer = await apiFetch<{
              rooms?: Array<{
                roomId?: string;
                number?: string;
                roomTypeId?: string;
                state?: string;
                floor?: string;
              }>;
            }>('/v1/rooms/ListRoomsByState', {
              method: 'POST',
              body: JSON.stringify({ state }),
            });
            for (const room of answer.rooms ?? []) {
              if (
                typeof room.roomId !== 'string'
                || typeof room.number !== 'string'
                || typeof room.roomTypeId !== 'string'
              ) {
                continue;
              }
              if (!merged.has(room.roomId)) {
                merged.set(room.roomId, {
                  roomId: room.roomId,
                  number: room.number,
                  roomTypeId: room.roomTypeId,
                  state: room.state ?? state,
                  floor: typeof room.floor === 'string' ? room.floor : '',
                });
              }
            }
          } catch (err) {
            if (isSignedOut(err) || !session.isSignedIn) {
              expireToGate();
              return;
            }
            failed.push(state);
          }
        }
        rooms.value = [...merged.values()];
        resetRoomDrafts();
        failedRoomStates.value = failed;
        if (failed.length === ROOM_STATES.length) {
          roomsError.value = readError.value;
        }
      } finally {
        roomsLoading.value = false;
      }
    }

    async function onAddRoom(): Promise<void> {
      if (!canManage.value || roomSaving.value) {
        return;
      }
      roomFormError.value = '';
      roomSavedMessage.value = '';
      const number = roomNumber.value.trim();
      if (number === '') {
        roomFormError.value = t('desk.manage.room_number_required', {}, 'Enter a room number.');
        return;
      }
      const type = roomTypes.value.find((candidate) => candidate.id === roomTypeId.value);
      if (type === undefined) {
        roomFormError.value = t('desk.manage.room_type_required', {}, 'Choose a room type for this room.');
        return;
      }
      const payload: Record<string, unknown> = {
        number,
        roomType: type.name,
        actor: actorName(),
      };
      // A blank floor omits the member (the wizard's rule, G5): the
      // service then keeps the stored floor for an existing room.
      const floor = roomFloor.value.trim();
      if (floor !== '') {
        payload['floor'] = floor;
      }
      const bedType = roomBedType.value.trim();
      if (bedType !== '') {
        payload['bedType'] = bedType;
      }
      const capacityText = roomCapacity.value.trim();
      if (capacityText !== '') {
        if (!/^\d+$/.test(capacityText) || Number(capacityText) < 1) {
          roomFormError.value = t(
            'desk.manage.type_capacity_invalid',
            {},
            'Enter a whole number of guests from 1 to 20, or leave it empty.',
          );
          return;
        }
        payload['capacity'] = Number(capacityText);
      }
      roomSaving.value = true;
      try {
        await apiFetch<unknown>('/v1/rooms/UpsertRoom', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        roomNumber.value = '';
        roomFloor.value = '';
        roomBedType.value = '';
        roomCapacity.value = '';
        roomSavedMessage.value = t('desk.manage.room_saved', { number }, `Saved room ${number}.`);
        await refreshRooms();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        roomFormError.value = errorCode(err) === 'FORBIDDEN' ? refusedRole.value : errorGeneric.value;
      } finally {
        roomSaving.value = false;
      }
    }

    async function onSaveRoomRow(room: RoomRow): Promise<void> {
      if (!canManage.value || roomLineSaving.value[room.number] === true) {
        return;
      }
      roomRowError.value = '';
      roomSavedMessage.value = '';
      const type = roomTypes.value.find(
        (candidate) => candidate.id === typeDrafts.value[room.number],
      );
      if (type === undefined) {
        roomRowError.value = t('desk.manage.room_type_required', {}, 'Choose a room type for this room.');
        return;
      }
      const payload: Record<string, unknown> = {
        number: room.number,
        roomType: type.name,
        actor: actorName(),
      };
      const floor = (floorDrafts.value[room.number] ?? '').trim();
      if (floor !== '') {
        payload['floor'] = floor;
      }
      roomLineSaving.value = { ...roomLineSaving.value, [room.number]: true };
      try {
        await apiFetch<unknown>('/v1/rooms/UpsertRoom', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        roomSavedMessage.value = t(
          'desk.manage.room_saved',
          { number: room.number },
          `Saved room ${room.number}.`,
        );
        await refreshRooms();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        roomRowError.value = errorCode(err) === 'FORBIDDEN' ? refusedRole.value : errorGeneric.value;
      } finally {
        const next = { ...roomLineSaving.value };
        delete next[room.number];
        roomLineSaving.value = next;
      }
    }

    // ---------------------------------------------------------------
    // Section C - nightly prices
    // ---------------------------------------------------------------
    const priceTypeId = ref('');
    const ratePlan = ref(readStoredPlan());
    const firstNight = ref('');
    const lastNight = ref('');
    const priceAmount = ref('');
    const ratesReading = ref(false);
    const ratesError = ref('');
    const ratesSuccess = ref('');
    const nightCells = ref<Record<string, NightCell>>({});
    const selectedNights = ref<string[]>([]);
    const page = ref(0);
    const priceWriting = ref(false);
    const priceSavedCount = ref(0);
    const priceTotal = ref(0);
    const partialFailure = ref<PartialFailure | null>(null);
    const planMissing = ref<SaveStop | null>(null);
    const planMissingOnRead = computed<boolean>(() =>
      visibleNights.value.some((night) => cellFor(night).state === 'plan-missing'),
    );

    const deskDateFormat = computed<string>(() => primeVueDateFormat(localeTag.value));
    const datePlaceholder = computed<string>(() => fallbackDatePlaceholder());

    const firstNightPicker = computed<Date | null>({
      get: () => dateFromCanonical(firstNight.value),
      set: (value) => {
        firstNight.value = canonicalFromDate(value);
        onRateInput();
      },
    });
    const lastNightPicker = computed<Date | null>({
      get: () => dateFromCanonical(lastNight.value),
      set: (value) => {
        lastNight.value = canonicalFromDate(value);
        onRateInput();
      },
    });
    const firstNightAttrs = {
      pcInputText: { root: { 'data-testid': 'manage-rate-from' } },
    };
    const lastNightAttrs = {
      pcInputText: { root: { 'data-testid': 'manage-rate-to' } },
    };

    const selectedType = computed<RoomTypeRow | null>(
      () => roomTypes.value.find((type) => type.id === priceTypeId.value) ?? null,
    );
    const selectedTypeName = computed<string>(() =>
      selectedType.value?.name ?? t('desk.today.room_type_unresolved', {}, 'Room type'),
    );
    const visibleNights = computed<string[]>(() =>
      selectedNights.value.slice(page.value * PAGE_NIGHTS, (page.value + 1) * PAGE_NIGHTS),
    );
    const pagedNights = computed<string[]>(() => selectedNights.value);

    // Plain-words range validation before anything is sent (O-3).
    function rangeError(): string {
      if (firstNight.value === '' || lastNight.value === '' || ratePlan.value.trim() === '' || selectedType.value === null) {
        return t(
          'desk.manage.need_fields',
          {},
          'Choose a room type, a rate plan, and both dates.',
        );
      }
      if (lastNight.value < firstNight.value) {
        return t(
          'desk.manage.range_order',
          {},
          'The last night cannot be before the first night.',
        );
      }
      if (nightList(firstNight.value, lastNight.value).length > MAX_NIGHTS) {
        return t(
          'desk.manage.range_too_long',
          { max: MAX_NIGHTS },
          `Choose at most ${MAX_NIGHTS} nights at a time.`,
        );
      }
      return '';
    }

    function amountMinor(): number | null {
      const digits = priceAmount.value.trim();
      if (!/^\d+$/.test(digits)) {
        return null;
      }
      const dong = Number(digits);
      if (!Number.isSafeInteger(dong) || dong < 0 || dong > MAX_PRICE_DONG) {
        return null;
      }
      return dong * 100;
    }

    function rangeSummaryText(): string {
      if (selectedNights.value.length === 0) {
        return '';
      }
      return t(
        'desk.manage.rate_range_summary',
        {
          nights: selectedNights.value.length,
          from: formatDeskDate(selectedNights.value[0]),
          to: formatDeskDate(selectedNights.value[selectedNights.value.length - 1]),
        },
        `${selectedNights.value.length} nights`,
      );
    }
    const rangeSummary = computed<string>(() => rangeSummaryText());

    function cellFor(night: string): NightCell {
      return nightCells.value[night] ?? { date: night, state: 'missing', priceMinor: null };
    }

    function cellPrice(night: string): string {
      const cell = cellFor(night);
      return cell.state === 'priced' && cell.priceMinor !== null
        ? formatVnd(cell.priceMinor)
        : '—';
    }

    function cellCaption(night: string): string {
      const cell = cellFor(night);
      if (cell.state === 'missing') {
        return t('desk.manage.rate_night_missing', {}, 'no price');
      }
      if (cell.state === 'unreadable') {
        return t('desk.manage.rate_night_unreadable', {}, 'could not read');
      }
      return '';
    }

    function weekdayLabel(night: string): string {
      const date = dateFromCanonical(night);
      if (date === null) {
        return '';
      }
      try {
        return new Intl.DateTimeFormat(catalogueLocale(), { weekday: 'short' }).format(date);
      } catch {
        return '';
      }
    }

    // The no-price state (board section 7.4, AC-MANAGE-9): every
    // visible night has no price row. The title reuses #589's Book
    // phrase (`desk.book.room_type_not_operational_short`) so the two
    // surfaces cannot drift; the body names the action.
    const showEmptyState = computed<boolean>(() => {
      if (selectedNights.value.length === 0 || visibleNights.value.length === 0) {
        return false;
      }
      return visibleNights.value.every((night) => {
        const cell = nightCells.value[night];
        return cell === undefined || cell.state === 'missing';
      });
    });
    const emptyStateTitle = computed<string>(() => {
      const phrase = t(
        'desk.book.room_type_not_operational_short',
        {},
        'not open for booking',
      );
      return `${selectedTypeName.value} — ${phrase}`;
    });

    // The overwrite/fill counts come from the grid read, so the write
    // is predictable before the click (board section 7.3).
    const overwriteNote = computed<string>(() => {
      if (selectedNights.value.length === 0) {
        return '';
      }
      let priced = 0;
      let empty = 0;
      for (const night of selectedNights.value) {
        const cell = nightCells.value[night];
        if (cell?.state === 'priced') {
          priced += 1;
        } else {
          empty += 1;
        }
      }
      return t(
        'desk.manage.rate_overwrite_note',
        { priced, empty },
        `This replaces ${priced} nights that already have a price and adds ${empty} empty nights.`,
      );
    });

    const saveLabel = computed<string>(() => {
      if (priceWriting.value) {
        return t(
          'desk.manage.rate_saving',
          { saved: priceSavedCount.value, total: priceTotal.value },
          `Saving ${priceSavedCount.value}/${priceTotal.value}…`,
        );
      }
      const count = firstNight.value !== '' && lastNight.value !== ''
        ? nightList(firstNight.value, lastNight.value).length
        : 0;
      return t('desk.manage.rate_save', { nights: count }, `Save ${count} nights`);
    });

    const partialMessage = computed<string>(() => {
      const state = partialFailure.value;
      if (state === null) {
        return '';
      }
      return t(
        'desk.manage.rate_partial',
        { saved: state.saved, total: state.total, date: formatDeskDate(state.date) },
        `Saved ${state.saved}/${state.total} nights. ${formatDeskDate(state.date)} did not save; try again.`,
      );
    });

    // Changing a control clears the current read so a stale grid can
    // never be written against silently.
    function onRateInput(): void {
      selectedNights.value = [];
      page.value = 0;
      nightCells.value = {};
      ratesError.value = '';
      ratesSuccess.value = '';
      partialFailure.value = null;
      planMissing.value = null;
    }

    async function readNight(night: string): Promise<{ cell: NightCell; signedOut: boolean }> {
      const type = selectedType.value;
      const plan = ratePlan.value.trim();
      if (type === null || plan === '') {
        return { cell: { date: night, state: 'unreadable', priceMinor: null }, signedOut: false };
      }
      try {
        const quote = await apiFetch<{ nights?: Array<{ nightDate?: string; priceMinor?: number }> }>(
          '/v1/rates/QuotePrice',
          {
            method: 'POST',
            body: JSON.stringify({
              roomTypeId: type.id,
              arrivalDate: night,
              departureDate: addDays(night, 1),
              ratePlanName: plan,
            }),
          },
        );
        const priced = quote.nights?.[0];
        if (priced && typeof priced.priceMinor === 'number') {
          return { cell: { date: night, state: 'priced', priceMinor: priced.priceMinor }, signedOut: false };
        }
        return { cell: { date: night, state: 'unreadable', priceMinor: null }, signedOut: false };
      } catch (err) {
        if (isSignedOut(err)) {
          return { cell: { date: night, state: 'unreadable', priceMinor: null }, signedOut: true };
        }
        const details = errorDetails(err);
        if (errorCode(err) === 'NOT_FOUND' && (details.reason === 'no_rate_price' || details.reason === 'no_rate_plan')) {
          return { cell: { date: night, state: 'missing', priceMinor: null }, signedOut: false };
        }
        if (errorCode(err) === 'NOT_FOUND' && typeof details.ratePlanName === 'string') {
          return { cell: { date: night, state: 'plan-missing', priceMinor: null }, signedOut: false };
        }
        return { cell: { date: night, state: 'unreadable', priceMinor: null }, signedOut: false };
      }
    }

    // One single-night `QuotePrice` per visible night, none off page
    // (G2, LLD 19.8.2).
    async function readVisibleNights(): Promise<boolean> {
      const cells = { ...nightCells.value };
      for (const night of visibleNights.value) {
        const result = await readNight(night);
        if (result.signedOut) {
          expireToGate();
          return false;
        }
        cells[night] = result.cell;
      }
      nightCells.value = cells;
      return true;
    }

    async function readPrices(): Promise<void> {
      if (ratesReading.value) {
        return;
      }
      ratesError.value = '';
      ratesSuccess.value = '';
      partialFailure.value = null;
      planMissing.value = null;
      const validation = rangeError();
      if (validation !== '') {
        ratesError.value = validation;
        return;
      }
      const nights = nightList(firstNight.value, lastNight.value);
      selectedNights.value = nights;
      page.value = 0;
      nightCells.value = {};
      ratesReading.value = true;
      try {
        await readVisibleNights();
      } finally {
        ratesReading.value = false;
      }
    }

    async function readPage(nextPage: number): Promise<void> {
      if (ratesReading.value || nextPage < 0) {
        return;
      }
      if (nextPage * PAGE_NIGHTS >= selectedNights.value.length) {
        return;
      }
      page.value = nextPage;
      ratesReading.value = true;
      try {
        await readVisibleNights();
      } finally {
        ratesReading.value = false;
      }
    }

    // One `UpsertRatePrice` per night in date order; stop at the first
    // failure and keep what was written (LLD 19.1-19.2).
    async function writeNights(startIndex: number): Promise<void> {
      const type = selectedType.value;
      const plan = ratePlan.value.trim();
      const nights = selectedNights.value.length > 0
        ? selectedNights.value
        : nightList(firstNight.value, lastNight.value);
      const minor = amountMinor();
      if (type === null || plan === '' || minor === null || nights.length === 0) {
        return;
      }
      priceWriting.value = true;
      priceSavedCount.value = startIndex;
      priceTotal.value = nights.length;
      partialFailure.value = null;
      planMissing.value = null;
      ratesError.value = '';
      ratesSuccess.value = '';
      let success = false;
      try {
        for (let index = startIndex; index < nights.length; index += 1) {
          try {
            await apiFetch<unknown>('/v1/rates/UpsertRatePrice', {
              method: 'POST',
              body: JSON.stringify({
                ratePlanName: plan,
                roomTypeId: type.id,
                nightDate: nights[index],
                priceMinor: minor,
              }),
            });
            priceSavedCount.value = index + 1;
          } catch (err) {
            if (isSignedOut(err) || !session.isSignedIn) {
              expireToGate();
              return;
            }
            if (errorCode(err) === 'FORBIDDEN') {
              ratesError.value = refusedRole.value;
              return;
            }
            const details = errorDetails(err);
            // Unknown plan: `details.ratePlanName` without a quote
            // reason (LLD 19.2 A-B). The plan is created only through
            // the explicit action (O-4).
            if (
              errorCode(err) === 'NOT_FOUND'
              && typeof details.ratePlanName === 'string'
              && details.reason === undefined
            ) {
              planMissing.value = { saved: priceSavedCount.value, total: nights.length, index };
              return;
            }
            partialFailure.value = {
              saved: priceSavedCount.value,
              total: nights.length,
              date: nights[index],
              index,
            };
            return;
          }
        }
        success = true;
      } finally {
        priceWriting.value = false;
      }
      if (success) {
        writeStoredPlan(plan);
        const saved = t(
          'desk.manage.rate_saved',
          { nights: nights.length, roomType: type.name },
          `Saved ${nights.length} nights for ${type.name}.`,
        );
        await readPrices();
        ratesSuccess.value = saved;
      }
    }

    async function onSavePrice(): Promise<void> {
      if (!canManage.value || priceWriting.value) {
        return;
      }
      ratesError.value = '';
      ratesSuccess.value = '';
      partialFailure.value = null;
      planMissing.value = null;
      const validation = rangeError();
      if (validation !== '') {
        ratesError.value = validation;
        return;
      }
      if (amountMinor() === null) {
        ratesError.value = t(
          'desk.manage.price_invalid',
          {},
          'Enter a whole amount between 0 and 100000000.',
        );
        return;
      }
      if (selectedNights.value.length === 0) {
        selectedNights.value = nightList(firstNight.value, lastNight.value);
        page.value = 0;
      }
      await writeNights(0);
    }

    // Read-path plan creation: name only once, then the grid re-reads
    // the same range.
    async function onCreatePlanFromRead(): Promise<void> {
      const plan = ratePlan.value.trim();
      if (plan === '' || !canManage.value || priceWriting.value || ratesReading.value) {
        return;
      }
      priceWriting.value = true;
      ratesError.value = '';
      try {
        await apiFetch<unknown>('/v1/rates/UpsertRatePlan', {
          method: 'POST',
          body: JSON.stringify({ name: plan }),
        });
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        ratesError.value = errorCode(err) === 'FORBIDDEN' ? refusedRole.value : errorGeneric.value;
        return;
      } finally {
        priceWriting.value = false;
      }
      writeStoredPlan(plan);
      await readPrices();
    }

    async function onResume(): Promise<void> {
      const state = partialFailure.value;
      if (state === null || !canManage.value) {
        return;
      }
      await writeNights(state.index);
    }

    // Explicit plan creation (O-4): name only, once, then the pending
    // nights retry from the first unsaved one.
    async function onCreatePlan(): Promise<void> {
      const state = planMissing.value;
      const plan = ratePlan.value.trim();
      if (state === null || plan === '' || !canManage.value || priceWriting.value) {
        return;
      }
      priceWriting.value = true;
      try {
        await apiFetch<unknown>('/v1/rates/UpsertRatePlan', {
          method: 'POST',
          body: JSON.stringify({ name: plan }),
        });
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        ratesError.value = errorCode(err) === 'FORBIDDEN' ? refusedRole.value : errorGeneric.value;
        return;
      } finally {
        priceWriting.value = false;
      }
      planMissing.value = null;
      await writeNights(state.index);
    }

    onMounted(() => {
      // A reload restores the token: read both lists so the screen
      // renders for owner, manager, and front desk alike.
      if (!session.isSignedIn) {
        return;
      }
      void refreshTypes();
      void refreshRooms();
    });

    return {
      t,
      formatDeskDate,
      PAGE_NIGHTS,
      canManage,
      roleReadonly,
      refusedRole,
      loading,
      typesLoading,
      typesError,
      roomsLoading,
      roomsError,
      failedRoomStates,
      failedStatesNotice,
      roomTypes,
      typesHeading,
      typesEmpty,
      typeNewHeading,
      typeEditHeading,
      editingType,
      typeName,
      typeCapacity,
      typeBedType,
      bedTypeOptions,
      typeFormError,
      typeSaving,
      typeSavedMessage,
      typeMeta,
      refreshTypes,
      onEditType,
      onNewType,
      onSaveType,
      rooms,
      floors,
      roomCountLabel,
      roomTypeName: typeNameOf,
      refreshRooms,
      roomNumber,
      roomTypeId,
      roomFloor,
      roomBedType,
      roomCapacity,
      roomFormError,
      roomSaving,
      roomSavedMessage,
      onAddRoom,
      floorDrafts,
      typeDrafts,
      roomLineSaving,
      roomRowError,
      onSaveRoomRow,
      priceTypeId,
      ratePlan,
      firstNightPicker,
      lastNightPicker,
      deskDateFormat,
      datePlaceholder,
      firstNightAttrs,
      lastNightAttrs,
      ratesReading,
      ratesError,
      ratesSuccess,
      visibleNights,
      pagedNights,
      selectedNights,
      page,
      readPrices,
      readPage,
      rangeSummary,
      cellPrice,
      cellCaption,
      weekdayLabel,
      showEmptyState,
      emptyStateTitle,
      priceAmount,
      overwriteNote,
      saveLabel,
      onSavePrice,
      partialFailure,
      partialMessage,
      onResume,
      planMissing,
      planMissingOnRead,
      onCreatePlan,
      onCreatePlanFromRead,
      priceWriting,
      onRateInput,
    };
  },
});
</script>
