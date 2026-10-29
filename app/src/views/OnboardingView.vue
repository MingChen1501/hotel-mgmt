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
        {{ t('desk.onboarding.progress', { current: STEP_NUMBER, total: TOTAL_STEPS }, 'Step 1 of 4') }}
      </p>
      <ProgressBar
        :value="STEP_PROGRESS"
        :show-value="false"
        data-testid="onboarding-progress-bar"
      />
      <section data-testid="onboarding-step-1">
        <h2>{{ t('desk.onboarding.step1_heading', {}, 'Name the hotel') }}</h2>
        <form
          data-testid="onboarding-step1-form"
          @submit.prevent="onContinue"
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
    </template>
  </main>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ProgressBar from 'primevue/progressbar';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// First-run setup wizard (Refs #425, LLD section 13.4, rollout
// section 2 row 3). The owner design carries four steps and shows
// step 1 at 25 percent progress; only step 1 ships here — steps
// 2–4 ride the future product-owner spec, so the shell below
// completes setup once step 1 persists instead of inventing later
// content. The wizard launches on an empty database only: a
// configured hotel name redirects to the shell, and seeded desks
// never see this screen.
const TOTAL_STEPS = 4;
const STEP_NUMBER = 1;
const STEP_PROGRESS = 25;

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null
    ? String((err as ApiError).code ?? '')
    : '';
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
    const hotelName = ref('');
    const saving = ref(false);
    const formError = ref('');

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      session.expireSession();
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

    async function onContinue(): Promise<void> {
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
        const actor = session.displayName?.trim() ? session.displayName : 'owner';
        await apiFetch<unknown>('/v1/admin/UpdateHotelConfig', {
          method: 'POST',
          body: JSON.stringify({ values: { name }, updatedBy: actor }),
        });
        hotelName.value = '';
        // Step 1 is the whole setup until the steps 2–4 spec
        // lands: the shell reloads its brand and the wizard never
        // shows again on this now-seeded database.
        emit('setup-complete');
        await router.replace('/');
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

    onMounted(() => {
      void checkGate();
    });

    return {
      STEP_NUMBER,
      TOTAL_STEPS,
      STEP_PROGRESS,
      loading,
      loadFailed,
      hotelName,
      saving,
      formError,
      onRetry,
      onContinue,
      t,
    };
  },
});
</script>
