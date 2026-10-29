<template>
  <main data-testid="onboarding-view">
    <h1>{{ t('desk.onboarding.title', {}, 'First-time setup') }}</h1>
    <p>{{ t('desk.onboarding.intro', {}, 'Complete the steps below to get the hotel running.') }}</p>
    <noscript><p>{{ t('desk.onboarding.noscript', {}, 'This page needs JavaScript to set up the hotel.') }}</p></noscript>

    <Message
      v-if="loading"
      severity="info"
      data-testid="onboarding-loading"
    >
      {{ t('desk.onboarding.loading', {}, 'Checking setup status…') }}
    </Message>
    <template v-else>
      <p data-testid="onboarding-progress">
        {{ t('desk.onboarding.progress', { current: step, total: TOTAL_STEPS }, 'Step 1 of 4') }}
      </p>
      <ProgressBar
        :value="stepProgress"
        :show-value="false"
        data-testid="onboarding-progress-bar"
      />
      <section
        v-if="step === 1"
        data-testid="onboarding-step-1"
      >
        <h2>{{ t('desk.onboarding.step1_heading', {}, 'Name the hotel') }}</h2>
        <form
          data-testid="onboarding-step1-form"
          @submit.prevent="onContinueStep1"
        >
          <label for="onboarding-hotel-name">
            {{ t('desk.onboarding.hotel_name_label', {}, 'Hotel name') }}
            <InputText
              id="onboarding-hotel-name"
              v-model="hotelName"
              name="hotel-name"
              autocomplete="organization"
              :placeholder="t('desk.onboarding.hotel_name_placeholder', {}, 'Example: Sunrise Riverside Hotel')"
              data-testid="onboarding-hotel-name"
            />
          </label>
          <p data-testid="onboarding-hotel-name-helper">
            {{ t('desk.onboarding.hotel_name_helper', {}, 'This name appears on invoices and receipts.') }}
          </p>
          <Message
            v-if="formError"
            severity="error"
            role="alert"
            data-testid="onboarding-error"
          >
            {{ formError }}
          </Message>
          <p>
            <Button
              type="button"
              :label="t('desk.onboarding.back', {}, 'Back')"
              disabled
              data-testid="onboarding-back"
            />
            <Button
              type="submit"
              :label="saving ? t('desk.onboarding.saving', {}, 'Saving…') : t('desk.onboarding.continue', {}, 'Continue')"
              :disabled="saving"
              :loading="saving"
              data-testid="onboarding-continue"
            />
          </p>
          <p v-if="loadFailed">
            <Button
              type="button"
              :label="t('desk.shell.retry_now', {}, 'Retry now')"
              :disabled="loading"
              data-testid="onboarding-retry"
              @click="onRetry"
            />
          </p>
        </form>
      </section>
      <section
        v-if="step === 2"
        data-testid="onboarding-step-2"
      >
        <h2>{{ t('desk.onboarding.step2_heading', {}, 'Hotel details') }}</h2>
        <p data-testid="onboarding-step2-note">
          {{ t('desk.onboarding.step2_optional_note', {}, 'Address, phone, and email are optional.') }}
        </p>
        <form
          data-testid="onboarding-step2-form"
          @submit.prevent="onContinueStep2"
        >
          <label for="onboarding-address">
            {{ t('desk.onboarding.address_label', {}, 'Address') }}
            <InputText
              id="onboarding-address"
              v-model="address"
              name="address"
              autocomplete="street-address"
              data-testid="onboarding-address"
            />
          </label>
          <label for="onboarding-phone">
            {{ t('desk.onboarding.phone_label', {}, 'Phone') }}
            <InputText
              id="onboarding-phone"
              v-model="phone"
              name="phone"
              autocomplete="tel"
              data-testid="onboarding-phone"
            />
          </label>
          <label for="onboarding-email">
            {{ t('desk.onboarding.email_label', {}, 'Email') }}
            <InputText
              id="onboarding-email"
              v-model="email"
              name="email"
              autocomplete="email"
              data-testid="onboarding-email"
            />
          </label>
          <label for="onboarding-timezone">
            {{ t('desk.onboarding.timezone_label', {}, 'Timezone') }}
            <InputText
              id="onboarding-timezone"
              v-model="timezone"
              name="timezone"
              :placeholder="t('desk.onboarding.timezone_placeholder', {}, 'Example: Asia/Ho_Chi_Minh')"
              data-testid="onboarding-timezone"
            />
          </label>
          <label for="onboarding-retention-floor">
            {{ t('desk.onboarding.retention_floor_label', {}, 'Keep records for at least (days)') }}
            <InputText
              id="onboarding-retention-floor"
              v-model="retentionFloor"
              name="retention-floor"
              inputmode="numeric"
              :placeholder="t('desk.onboarding.retention_floor_placeholder', {}, 'Example: 365')"
              data-testid="onboarding-retention-floor"
            />
          </label>
          <p data-testid="onboarding-retention-floor-helper">
            {{ t('desk.onboarding.retention_floor_helper', {}, 'Leave blank to keep the 365-day default.') }}
          </p>
          <Message
            v-if="formError"
            severity="error"
            role="alert"
            data-testid="onboarding-error"
          >
            {{ formError }}
          </Message>
          <p>
            <Button
              type="button"
              :label="t('desk.onboarding.back', {}, 'Back')"
              :disabled="saving"
              data-testid="onboarding-back"
              @click="goBack"
            />
            <Button
              type="submit"
              :label="saving ? t('desk.onboarding.saving', {}, 'Saving…') : t('desk.onboarding.continue', {}, 'Continue')"
              :disabled="saving"
              :loading="saving"
              data-testid="onboarding-continue"
            />
          </p>
        </form>
      </section>
      <section
        v-if="step === 3"
        data-testid="onboarding-step-3"
      >
        <h2>{{ t('desk.onboarding.step3_heading', {}, 'Rooms and room types') }}</h2>
        <form
          data-testid="onboarding-step3-form"
          @submit.prevent="onContinueStep3"
        >
          <fieldset>
            <legend>{{ t('desk.onboarding.room_type_label', {}, 'Room type') }}</legend>
            <div
              v-for="(typeRow, typeIndex) in roomTypes"
              :key="`type-${typeIndex}`"
            >
              <label :for="`onboarding-type-name-${typeIndex}`">
                {{ t('desk.onboarding.room_type_name_label', {}, 'Room type name') }}
                <InputText
                  :id="`onboarding-type-name-${typeIndex}`"
                  v-model="typeRow.name"
                  :data-testid="`onboarding-type-name-${typeIndex}`"
                />
              </label>
              <label :for="`onboarding-type-capacity-${typeIndex}`">
                {{ t('desk.onboarding.room_type_capacity_label', {}, 'Capacity (guests)') }}
                <InputText
                  :id="`onboarding-type-capacity-${typeIndex}`"
                  v-model="typeRow.capacity"
                  inputmode="numeric"
                  :data-testid="`onboarding-type-capacity-${typeIndex}`"
                />
              </label>
              <label :for="`onboarding-type-bed-${typeIndex}`">
                {{ t('desk.onboarding.room_type_bed_label', {}, 'Bed type (optional)') }}
                <InputText
                  :id="`onboarding-type-bed-${typeIndex}`"
                  v-model="typeRow.bedType"
                  :data-testid="`onboarding-type-bed-${typeIndex}`"
                />
              </label>
              <Button
                v-if="roomTypes.length > 1"
                type="button"
                :label="t('desk.onboarding.remove_row', {}, 'Remove')"
                :disabled="saving"
                :data-testid="`onboarding-remove-type-${typeIndex}`"
                @click="removeTypeRow(typeIndex)"
              />
            </div>
            <Button
              type="button"
              :label="t('desk.onboarding.add_room_type', {}, 'Add room type')"
              :disabled="saving"
              data-testid="onboarding-add-type"
              @click="addTypeRow"
            />
          </fieldset>
          <fieldset>
            <legend>{{ t('desk.onboarding.room_number_label', {}, 'Room number') }}</legend>
            <div
              v-for="(roomRow, roomIndex) in rooms"
              :key="`room-${roomIndex}`"
            >
              <label :for="`onboarding-room-number-${roomIndex}`">
                {{ t('desk.onboarding.room_number_label', {}, 'Room number') }}
                <InputText
                  :id="`onboarding-room-number-${roomIndex}`"
                  v-model="roomRow.number"
                  :data-testid="`onboarding-room-number-${roomIndex}`"
                />
              </label>
              <label :for="`onboarding-room-floor-${roomIndex}`">
                {{ t('desk.onboarding.room_floor_label', {}, 'Floor (optional)') }}
                <InputText
                  :id="`onboarding-room-floor-${roomIndex}`"
                  v-model="roomRow.floor"
                  :data-testid="`onboarding-room-floor-${roomIndex}`"
                />
              </label>
              <label :for="`onboarding-room-type-${roomIndex}`">
                {{ t('desk.onboarding.room_type_label', {}, 'Room type') }}
                <select
                  :id="`onboarding-room-type-${roomIndex}`"
                  v-model="roomRow.roomType"
                  :data-testid="`onboarding-room-type-${roomIndex}`"
                >
                  <option value="" />
                  <option
                    v-for="name in enteredTypeNames"
                    :key="name"
                    :value="name"
                  >
                    {{ name }}
                  </option>
                </select>
              </label>
              <Button
                v-if="rooms.length > 1"
                type="button"
                :label="t('desk.onboarding.remove_row', {}, 'Remove')"
                :disabled="saving"
                :data-testid="`onboarding-remove-room-${roomIndex}`"
                @click="removeRoomRow(roomIndex)"
              />
            </div>
            <Button
              type="button"
              :label="t('desk.onboarding.add_room', {}, 'Add room')"
              :disabled="saving"
              data-testid="onboarding-add-room"
              @click="addRoomRow"
            />
          </fieldset>
          <Message
            v-if="formError"
            severity="error"
            role="alert"
            data-testid="onboarding-error"
          >
            {{ formError }}
          </Message>
          <p>
            <Button
              type="button"
              :label="t('desk.onboarding.back', {}, 'Back')"
              :disabled="saving"
              data-testid="onboarding-back"
              @click="goBack"
            />
            <Button
              type="submit"
              :label="saving ? t('desk.onboarding.saving', {}, 'Saving…') : t('desk.onboarding.continue', {}, 'Continue')"
              :disabled="saving"
              :loading="saving"
              data-testid="onboarding-continue"
            />
          </p>
        </form>
      </section>
      <section
        v-if="step === 4"
        data-testid="onboarding-step-4"
      >
        <h2>{{ t('desk.onboarding.step4_heading', {}, 'Create the owner account') }}</h2>
        <p data-testid="onboarding-role-note">
          {{ t('desk.onboarding.role_owner_note', {}, 'Role: owner. This account manages users and hotel setup.') }}
        </p>
        <form
          data-testid="onboarding-step4-form"
          @submit.prevent="onFinish"
        >
          <label for="onboarding-display-name">
            {{ t('desk.onboarding.display_name_label', {}, 'Your name') }}
            <InputText
              id="onboarding-display-name"
              v-model="displayName"
              name="display-name"
              autocomplete="name"
              data-testid="onboarding-display-name"
            />
          </label>
          <label for="onboarding-signin-identity">
            {{ t('desk.onboarding.signin_identity_label', {}, 'Sign-in name') }}
            <InputText
              id="onboarding-signin-identity"
              v-model="signinIdentity"
              name="username"
              autocomplete="username"
              data-testid="onboarding-signin-identity"
            />
          </label>
          <label for="onboarding-secret">
            {{ t('desk.onboarding.secret_label', {}, 'Password') }}
            <InputText
              id="onboarding-secret"
              v-model="secret"
              type="password"
              name="new-password"
              autocomplete="new-password"
              data-testid="onboarding-secret"
            />
          </label>
          <Message
            v-if="formError"
            severity="error"
            role="alert"
            data-testid="onboarding-error"
          >
            {{ formError }}
          </Message>
          <p>
            <Button
              type="button"
              :label="t('desk.onboarding.back', {}, 'Back')"
              :disabled="saving"
              data-testid="onboarding-back"
              @click="goBack"
            />
            <Button
              type="submit"
              :label="saving ? t('desk.onboarding.saving', {}, 'Saving…') : t('desk.onboarding.finish', {}, 'Finish')"
              :disabled="saving"
              :loading="saving"
              data-testid="onboarding-continue"
            />
          </p>
        </form>
      </section>
    </template>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// First-run setup wizard (Refs #425 step 1, #438 steps 2–4, LLD
// section 13.4, rollout section 10). The owner design carries four
// steps at 25/50/75/100 percent progress: step 1 names the hotel,
// step 2 completes the remaining hotel profile (FR-DSK-8), step 3
// seeds rooms and room types (FR-DSK-9), step 4 creates the first
// owner account (FR-DSK-10). Each step persists through its
// existing operation on continue — UpdateHotelConfig (FR-ADM-1),
// UpsertRoomType / UpsertRoom (FR-ADM-3), CreateUser (FR-ADM-2) —
// with per-step validation that keeps staff on the failing step.
// The wizard launches on an empty database only: a configured
// hotel name redirects to the shell, and seeded desks never see
// this screen.
const TOTAL_STEPS = 4;

interface RoomTypeRow {
  name: string;
  capacity: string;
  bedType: string;
}

interface RoomRow {
  number: string;
  floor: string;
  roomType: string;
}

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null
    ? String((err as ApiError).code ?? '')
    : '';
}

function errorDetails(err: unknown): Record<string, unknown> {
  if (typeof err === 'object' && err !== null) {
    const details = (err as ApiError).details;
    if (typeof details === 'object' && details !== null) {
      return details as Record<string, unknown>;
    }
  }
  return {};
}

function isSignedOut(err: unknown): boolean {
  return errorCode(err) === 'UNAUTHENTICATED';
}

// Unexpected failures read as one plain sentence (FR-DSP-3,
// desk.shell.request_failed): technical codes never surface.
function errorMessage(): string {
  return t(
    'desk.shell.request_failed',
    {},
    'That did not work. Try again; if it keeps failing, tell the manager.',
  );
}

function configuredName(values: unknown): string {
  if (typeof values !== 'object' || values === null) {
    return '';
  }
  const name = (values as Record<string, unknown>)['name'];
  return typeof name === 'string' && name.trim() !== '' ? name : '';
}

function isWholeNumber(raw: string): boolean {
  return /^\d+$/.test(raw);
}

export default defineComponent({
  name: 'OnboardingView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button under this canonical name (Refs #338 component mapping).
  components: { Button, InputText, Message, ProgressBar },
  emits: ['setup-complete'],
  setup(_, { emit }) {
    const session = useSessionStore();
    const router = useRouter();
    const loading = ref(true);
    const loadFailed = ref(false);
    const step = ref(1);
    const stepProgress = computed(() => step.value * 25);
    // Step 1 (Refs #425, unchanged): the hotel name.
    const hotelName = ref('');
    // Step 2 (FR-DSK-8): the remaining hotel profile. Contact
    // details stay unset when blank; the retention floor keeps the
    // 365-day default unless staff enter a whole number of days.
    const address = ref('');
    const phone = ref('');
    const email = ref('');
    const timezone = ref('');
    const retentionFloor = ref('');
    // Step 3 (FR-DSK-9): room types first, then the rooms linked
    // to a type entered in this step. Rows are added and removed
    // in the wizard; nothing persists until continue validates.
    const roomTypes = ref<RoomTypeRow[]>([{ name: '', capacity: '', bedType: '' }]);
    const rooms = ref<RoomRow[]>([{ number: '', floor: '', roomType: '' }]);
    // Step 4 (FR-DSK-10): the first owner account. The role is
    // fixed to owner, so no role input renders.
    const displayName = ref('');
    const signinIdentity = ref('');
    const secret = ref('');
    const saving = ref(false);
    const formError = ref('');

    const enteredTypeNames = computed(() => {
      const names = roomTypes.value.map((row) => row.name.trim()).filter((name) => name !== '');
      return [...new Set(names)];
    });

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      session.expireSession();
    }

    function actorName(): string {
      return session.displayName?.trim() ? session.displayName : 'owner';
    }

    async function checkGate(): Promise<void> {
      loading.value = true;
      loadFailed.value = false;
      formError.value = '';
      try {
        const config = await apiFetch<{ values?: unknown }>(
          '/v1/admin/GetHotelConfig',
          { method: 'POST', body: '{}' },
        );
        if (configuredName(config.values) !== '') {
          // Seeded database: the wizard never launches (Refs #425).
          await router.replace('/');
          return;
        }
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        loadFailed.value = true;
        formError.value = errorMessage();
      } finally {
        loading.value = false;
      }
    }

    async function onRetry(): Promise<void> {
      await checkGate();
    }

    function goBack(): void {
      if (saving.value || step.value <= 1) {
        return;
      }
      // Back keeps every entered value: the refs above outlive
      // the step switch, and saved steps stay saved (per-step
      // atomicity, LLD section 13.4 back edges).
      formError.value = '';
      step.value -= 1;
    }

    function addTypeRow(): void {
      roomTypes.value.push({ name: '', capacity: '', bedType: '' });
    }

    function removeTypeRow(index: number): void {
      if (roomTypes.value.length > 1) {
        roomTypes.value.splice(index, 1);
      }
    }

    function addRoomRow(): void {
      rooms.value.push({ number: '', floor: '', roomType: '' });
    }

    function removeRoomRow(index: number): void {
      if (rooms.value.length > 1) {
        rooms.value.splice(index, 1);
      }
    }

    async function onContinueStep1(): Promise<void> {
      if (saving.value) {
        return;
      }
      const name = hotelName.value.trim();
      if (name === '') {
        // Step 1 validation keeps staff on step 1 (LLD section
        // 13.4 P–Q): the field is named, nothing persists.
        formError.value = t(
          'desk.onboarding.name_required',
          {},
          'Enter the hotel name to continue.',
        );
        return;
      }
      saving.value = true;
      formError.value = '';
      try {
        await apiFetch<unknown>('/v1/admin/UpdateHotelConfig', {
          method: 'POST',
          body: JSON.stringify({ values: { name }, updatedBy: actorName() }),
        });
        // Step 1 persists and advances: completion (the desk
        // route plus setup-complete) waits for step 4 (Refs #438).
        formError.value = '';
        step.value = 2;
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'FORBIDDEN') {
          // Setup stays owner/manager only (LLD section 13.4
          // R–S); the server still enforces the role.
          formError.value = t(
            'desk.onboarding.forbidden',
            {},
            'Setup is for the owner or manager. Ask the manager if something needs changing.',
          );
        } else {
          // Unknown failures read as the plain catalogue sentence
          // (FR-DSP-3): the raw server/offline text never surfaces.
          formError.value = errorMessage();
        }
      } finally {
        saving.value = false;
      }
    }

    async function onContinueStep2(): Promise<void> {
      if (saving.value) {
        return;
      }
      const zone = timezone.value.trim();
      if (zone === '') {
        formError.value = t(
          'desk.onboarding.timezone_required',
          {},
          'Enter the timezone to continue.',
        );
        return;
      }
      const floorRaw = retentionFloor.value.trim();
      let floor: number | undefined;
      if (floorRaw !== '') {
        if (!isWholeNumber(floorRaw)) {
          formError.value = t(
            'desk.onboarding.retention_floor_invalid',
            {},
            'Retention days must be a whole number of 0 or more.',
          );
          return;
        }
        floor = Number(floorRaw);
      }
      saving.value = true;
      formError.value = '';
      try {
        const values: Record<string, unknown> = { timezone: zone };
        if (address.value.trim() !== '') {
          values['address'] = address.value.trim();
        }
        if (phone.value.trim() !== '') {
          values['phone'] = phone.value.trim();
        }
        if (email.value.trim() !== '') {
          values['email'] = email.value.trim();
        }
        if (floor !== undefined) {
          values['retentionFloorDays'] = floor;
        }
        await apiFetch<unknown>('/v1/admin/UpdateHotelConfig', {
          method: 'POST',
          body: JSON.stringify({ values, updatedBy: actorName() }),
        });
        formError.value = '';
        step.value = 3;
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'FORBIDDEN') {
          formError.value = t(
            'desk.onboarding.forbidden',
            {},
            'Setup is for the owner or manager. Ask the manager if something needs changing.',
          );
        } else {
          formError.value = errorMessage();
        }
      } finally {
        saving.value = false;
      }
    }

    // Step 3 validation (FR-DSK-9) names the missing, duplicate,
    // or unlinked field and persists nothing for the step. The
    // intra-batch number-uniqueness rule is wizard client-side
    // validation: UpsertRoom updates on duplicate server-side, and
    // the wizard gates to an empty database, so only intra-batch
    // duplicates can occur.
    function step3ValidationError(): string {
      for (const row of roomTypes.value) {
        if (row.name.trim() === '') {
          return t(
            'desk.onboarding.room_type_name_required',
            {},
            'Enter a room type name to continue.',
          );
        }
        if (row.capacity.trim() !== '' && !isWholeNumber(row.capacity.trim())) {
          return t(
            'desk.onboarding.capacity_invalid',
            {},
            'Capacity must be a whole number of 0 or more.',
          );
        }
      }
      const seen = new Set<string>();
      for (const row of rooms.value) {
        const number = row.number.trim();
        if (number === '') {
          return t(
            'desk.onboarding.room_number_required',
            {},
            'Enter a room number to continue.',
          );
        }
        if (seen.has(number)) {
          return t(
            'desk.onboarding.room_number_duplicate',
            { number },
            `Room number ${number} is already listed. Use a different number.`,
          );
        }
        seen.add(number);
      }
      const linked = new Set(enteredTypeNames.value);
      for (const row of rooms.value) {
        if (row.roomType.trim() === '' || !linked.has(row.roomType.trim())) {
          return t(
            'desk.onboarding.room_type_required',
            {},
            'Link every room to a room type listed in this step.',
          );
        }
      }
      return '';
    }

    async function onContinueStep3(): Promise<void> {
      if (saving.value) {
        return;
      }
      const validation = step3ValidationError();
      if (validation !== '') {
        formError.value = validation;
        return;
      }
      saving.value = true;
      formError.value = '';
      try {
        const actor = actorName();
        // Types first so every room links to a type saved in this
        // step; saved rows stay saved on a later failure (the seed
        // path is retry-safe by number, LLD section 13.4 T3–U3).
        for (const row of roomTypes.value) {
          const payload: Record<string, unknown> = { name: row.name.trim(), actor };
          if (row.capacity.trim() !== '') {
            payload['capacity'] = Number(row.capacity.trim());
          }
          if (row.bedType.trim() !== '') {
            payload['bedType'] = row.bedType.trim();
          }
          await apiFetch<unknown>('/v1/rooms/UpsertRoomType', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        for (const row of rooms.value) {
          const payload: Record<string, unknown> = {
            number: row.number.trim(),
            roomType: row.roomType.trim(),
            actor,
          };
          if (row.floor.trim() !== '') {
            payload['floor'] = row.floor.trim();
          }
          await apiFetch<unknown>('/v1/rooms/UpsertRoom', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }
        formError.value = '';
        step.value = 4;
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'FORBIDDEN') {
          formError.value = t(
            'desk.onboarding.forbidden',
            {},
            'Setup is for the owner or manager. Ask the manager if something needs changing.',
          );
        } else {
          formError.value = errorMessage();
        }
      } finally {
        saving.value = false;
      }
    }

    async function onFinish(): Promise<void> {
      if (saving.value) {
        return;
      }
      const name = displayName.value.trim();
      if (name === '') {
        formError.value = t(
          'desk.onboarding.display_name_required',
          {},
          'Enter your name to finish.',
        );
        return;
      }
      const identity = signinIdentity.value.trim();
      if (identity === '') {
        formError.value = t(
          'desk.onboarding.identity_required',
          {},
          'Enter a sign-in name to finish.',
        );
        return;
      }
      if (secret.value === '') {
        formError.value = t(
          'desk.onboarding.secret_required',
          {},
          'Enter a password to finish.',
        );
        return;
      }
      saving.value = true;
      formError.value = '';
      try {
        await apiFetch<unknown>('/v1/admin/CreateUser', {
          method: 'POST',
          body: JSON.stringify({
            displayName: name,
            signinIdentity: identity,
            secret: secret.value,
            role: 'owner',
          }),
        });
        secret.value = '';
        // Setup completes only with a working owner sign-in: the
        // shell reloads its brand and the wizard never shows again
        // on this now-seeded database.
        emit('setup-complete');
        await router.replace('/');
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        if (errorCode(err) === 'FORBIDDEN') {
          formError.value = t(
            'desk.onboarding.forbidden',
            {},
            'Setup is for the owner or manager. Ask the manager if something needs changing.',
          );
        } else if (errorCode(err) === 'VALIDATION_FAILED') {
          const taken = errorDetails(err)['signinIdentity'];
          formError.value =
            typeof taken === 'string' && taken !== ''
              ? t(
                'desk.onboarding.identity_taken',
                { identity: taken },
                `Sign-in name ${taken} is already in use. Choose another.`,
              )
              : errorMessage();
        } else {
          formError.value = errorMessage();
        }
      } finally {
        saving.value = false;
      }
    }

    onMounted(() => {
      void checkGate();
    });

    return {
      TOTAL_STEPS,
      step,
      stepProgress,
      loading,
      loadFailed,
      hotelName,
      address,
      phone,
      email,
      timezone,
      retentionFloor,
      roomTypes,
      rooms,
      enteredTypeNames,
      displayName,
      signinIdentity,
      secret,
      saving,
      formError,
      onRetry,
      goBack,
      addTypeRow,
      removeTypeRow,
      addRoomRow,
      removeRoomRow,
      onContinueStep1,
      onContinueStep2,
      onContinueStep3,
      onFinish,
      t,
    };
  },
});
</script>
