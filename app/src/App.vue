<template>
  <div id="shell">
    <div
      v-if="!connectivity.online"
      role="alert"
      data-testid="offline-banner"
    >
      <p data-testid="offline-text">
        {{ t('desk.shell.offline_lost', {}, 'Connection lost') }}{{ connectivity.lastError ? ` — ${connectivity.lastError}` : '' }}. {{ t('desk.shell.offline_blocked', {}, 'Desk actions are blocked until the connection returns; nothing is queued.') }}
      </p>
      <button
        type="button"
        data-testid="offline-retry"
        @click="onRetry"
      >
        {{ t('desk.shell.retry_now', {}, 'Retry now') }}
      </button>
      <p
        v-if="retryMessage"
        data-testid="offline-retry-result"
      >
        {{ retryMessage }}
      </p>
    </div>

    <!-- Single shell-owned sign-in gate (Refs #338, FR-DSP-2): a
      signed-out visitor on any /app/* path sees only this form.
      Per-screen sign-in copies were removed to this gate. -->
    <main
      v-if="!session.isSignedIn"
      data-testid="shell-gate"
      class="shell-column"
    >
      <h1>{{ t('desk.shell.brand', {}, 'Hotel Management') }}</h1>
      <!-- Locale switcher on the gate too (Refs #339): staff pick VI
        before signing in so the whole loop, gate included, runs
        without English. -->
      <div
        class="shell-locale"
        data-testid="locale-switcher"
        role="group"
        :aria-label="t('desk.shell.language', {}, 'Language')"
      >
        <span class="shell-locale-label">{{ t('desk.shell.language', {}, 'Language') }}:</span>
        <Button
          type="button"
          :label="t('desk.shell.locale_en', {}, 'English')"
          :severity="localeTag === 'en' ? undefined : 'secondary'"
          size="small"
          :aria-pressed="localeTag === 'en'"
          data-testid="locale-en"
          @click="onLocale('en')"
        />
        <Button
          type="button"
          :label="t('desk.shell.locale_vi', {}, 'Tiếng Việt')"
          :severity="localeTag === 'vi' ? undefined : 'secondary'"
          size="small"
          :aria-pressed="localeTag === 'vi'"
          data-testid="locale-vi"
          @click="onLocale('vi')"
        />
      </div>
      <p>{{ t('desk.shell.signin_intro', {}, 'Sign in to work the desk.') }}</p>
      <form
        data-testid="shell-signin-form"
        class="shell-form"
        @submit.prevent="onSignIn"
      >
        <label for="shell-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <InputText
            id="shell-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="shell-signin-identity"
          />
        </label>
        <label for="shell-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <Password
            v-model="secret"
            :feedback="false"
            input-id="shell-signin-secret"
            autocomplete="current-password"
            data-testid="shell-signin-secret"
          />
        </label>
        <Button
          type="submit"
          :label="t('desk.admin.sign_in', {}, 'Sign in')"
          :disabled="signingIn"
          :loading="signingIn"
          data-testid="shell-signin-submit"
        />
      </form>
      <p
        v-if="signingIn"
        data-testid="shell-signing-in"
      >
        {{ t('desk.shell.signing_in', {}, 'Signing in…') }}
      </p>
      <Message
        v-if="signInError"
        severity="error"
        role="alert"
        data-testid="shell-signin-error"
      >
        {{ signInError }}
      </Message>
      <Message
        v-else-if="session.signOutNotice !== null"
        severity="warn"
        role="alert"
        data-testid="shell-expired-notice"
      >
        {{ t('desk.today.session_expired', {}, 'Session expired. Sign in again.') }}
      </Message>
    </main>

    <!-- Signed-in shell: top nav plus the centred content column
      (Refs #338, FR-DSP-1). Each item routes to its existing path;
      the active route is bold with a desk-blue underline. -->
    <div v-else>
      <nav
        data-testid="shell-nav"
        class="shell-nav"
        :aria-label="t('desk.shell.nav_label', {}, 'Desk screens')"
      >
        <span
          data-testid="shell-brand"
          class="shell-brand"
        >{{ hotelName || t('desk.shell.brand', {}, 'Hotel Management') }}</span>
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          :data-testid="`shell-nav-${item.name}`"
          class="shell-nav-item"
          :class="{ 'shell-nav-active': route.name === item.name }"
        >
          {{ t(item.labelKey, {}, item.fallback) }}
        </RouterLink>
        <span class="shell-user">
          <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="shell-user">{{ displayName }}</strong>
        </span>
        <!-- Locale switcher (Refs #339): EN/VI persisted in
          localStorage (locale only, never auth data); default stays
          EN so current behaviour is unchanged until switched. -->
        <div
          class="shell-locale"
          data-testid="locale-switcher"
          role="group"
          :aria-label="t('desk.shell.language', {}, 'Language')"
        >
          <Button
            type="button"
            :label="t('desk.shell.locale_en', {}, 'English')"
            :severity="localeTag === 'en' ? undefined : 'secondary'"
            size="small"
            :aria-pressed="localeTag === 'en'"
            data-testid="locale-en"
            @click="onLocale('en')"
          />
          <Button
            type="button"
            :label="t('desk.shell.locale_vi', {}, 'Tiếng Việt')"
            :severity="localeTag === 'vi' ? undefined : 'secondary'"
            size="small"
            :aria-pressed="localeTag === 'vi'"
            data-testid="locale-vi"
            @click="onLocale('vi')"
          />
        </div>
        <Button
          type="button"
          :label="t('desk.admin.signout', {}, 'Sign out')"
          severity="secondary"
          data-testid="shell-signout"
          @click="onSignOut"
        />
      </nav>
      <div
        data-testid="shell-content"
        class="shell-column"
      >
        <RouterView />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { apiFetch, connectivity, retryLastRequest } from './api/client';
import type { ApiError } from './api/client';
import { localeTag, setLocale, t } from './i18n';
import { useSessionStore } from './stores/session';

interface NavItem {
  name: string;
  to: string;
  labelKey: string;
  fallback: string;
}

// Contract section 2 order: Desk · Book · Stay · Folio · Print · Admin.
const NAV_ITEMS: NavItem[] = [
  { name: 'desk', to: '/', labelKey: 'desk.shell.nav_desk', fallback: 'Desk' },
  { name: 'book', to: '/book', labelKey: 'desk.shell.nav_book', fallback: 'Book' },
  { name: 'stay', to: '/stay', labelKey: 'desk.shell.nav_stay', fallback: 'Stay' },
  { name: 'folio', to: '/folio', labelKey: 'desk.shell.nav_folio', fallback: 'Folio' },
  { name: 'print', to: '/print', labelKey: 'desk.shell.nav_print', fallback: 'Print' },
  { name: 'admin', to: '/admin', labelKey: 'desk.shell.nav_admin', fallback: 'Admin' },
];

function errorCode(err: unknown): string {
  return typeof err === 'object' && err !== null
    ? String((err as ApiError).code ?? '')
    : '';
}

export default defineComponent({
  name: 'ShellApp',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, InputText, Message, Password, RouterLink, RouterView },
  setup() {
    const session = useSessionStore();
    const route = useRoute();
    const retryMessage = ref('');
    const identity = ref('');
    const secret = ref('');
    const signingIn = ref(false);
    const signInError = ref('');
    const displayName = computed(() => session.displayName ?? '');
    // Configured hotel name for the teal header (Refs #419, #420,
    // FR-DSK-1, AC-DSK-8): read from the hotel configuration
    // surface (`FR-ADM-1`) once signed in, never hardcoded — the
    // design's hotel name is example content only. The catalogue
    // brand stays the fallback until the read lands or fails.
    const hotelName = ref('');

    async function loadHotelName(): Promise<void> {
      try {
        const config = await apiFetch<{ values?: Record<string, unknown> }>(
          '/v1/admin/GetHotelConfig',
          { method: 'POST', body: '{}' },
        );
        const name = config.values?.name;
        hotelName.value = typeof name === 'string' && name.trim() !== '' ? name : '';
      } catch {
        // Unreachable config keeps the catalogue brand: the header
        // never blanks, and the sign-in gate still owns 401s.
        hotelName.value = '';
      }
    }

    async function onRetry(): Promise<void> {
      retryMessage.value = t('desk.shell.retrying', {}, 'Retrying…');
      try {
        const result = await retryLastRequest();
        retryMessage.value =
          result === false
            ? t('desk.shell.retry_empty', {}, 'Nothing to retry.')
            : t('desk.shell.retry_ok', {}, 'Retry succeeded.');
      } catch (err) {
        retryMessage.value =
          err instanceof Error ? err.message : t('desk.shell.retry_failed', {}, 'Retry failed.');
      }
    }

    async function onSignIn(): Promise<void> {
      if (signingIn.value) {
        return;
      }
      signingIn.value = true;
      signInError.value = '';
      session.clearNotice();
      try {
        const payload = await apiFetch<{ token: string; displayName: string; role: string }>(
          '/v1/admin/SignIn',
          {
            method: 'POST',
            body: JSON.stringify({ signinIdentity: identity.value, secret: secret.value }),
          },
        );
        session.signIn(payload.token, payload.displayName, payload.role);
        secret.value = '';
        await loadHotelName();
      } catch (err) {
        // A locked identity keeps the server's locked wording so
        // staff see the locked cause distinctly (Refs #319); every
        // other failure reads as one plain sentence (FR-DSP-2,
        // FR-DSP-3) — technical codes never surface.
        signInError.value = errorCode(err) === 'IDENTITY_LOCKED' && err instanceof Error
          ? err.message
          : t(
            'desk.shell.signin_failed',
            {},
            'That sign-in did not work. Check the name and password and try again.',
          );
      } finally {
        signingIn.value = false;
      }
    }

    async function onSignOut(): Promise<void> {
      try {
        await apiFetch<unknown>('/v1/admin/SignOut', { method: 'POST', body: '{}' });
      } catch {
        // A dead token signs out locally all the same (legacy parity).
      }
      hotelName.value = '';
      session.signOut();
    }

    // Locale switch (Refs #339): persists the locale only — auth and
    // session data stay in sessionStorage per the session store.
    function onLocale(tag: string): void {
      setLocale(tag);
    }

    onMounted(() => {
      // A reload restores the token from sessionStorage: pick up
      // the configured hotel name without another sign-in.
      if (session.isSignedIn) {
        void loadHotelName();
      }
    });

    return {
      t,
      localeTag,
      session,
      route,
      navItems: NAV_ITEMS,
      displayName,
      hotelName,
      retryMessage,
      onRetry,
      onLocale,
      identity,
      secret,
      signingIn,
      signInError,
      onSignIn,
      onSignOut,
      connectivity,
    };
  },
});
</script>

<style>
/* Desk shell stylesheet (Refs #338, #420; contract sections 1–2,
   rollout tokens `docs/product/desk-ui-design-rollout.md`
   section 3, LLD section 12.1).
   Token values duplicated from `src/theme/tokens.ts` (CSS cannot
   import the TS constants; keep both in sync). The ENTIRE block
   lives inside `@media screen` so screen styling can never leak
   into print (FR-DSP-4, M4): the `@media print` rules owned by
   the print views stay the only print styling. */
@media screen {
  #shell {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    color: #1B2B2A;
    background: #F4F6F5;
    min-height: 100vh;
  }

  /* Keyboard focus is always visible (NFR-DSP-2): 2px teal
     outline on every interactive element. */
  #shell :focus-visible {
    outline: 2px solid #0F766E;
    outline-offset: 2px;
  }

  /* Teal header (rollout section 3, Refs #420): the hotel name,
     the top nav, and sign-out share one #0F4C47 bar so staff
     always know which property they are working. */
  #shell .shell-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    background: #0F4C47;
    color: #FFFFFF;
    border-bottom: 1px solid #0F4C47;
    padding: 12px 24px;
  }

  #shell .shell-brand {
    font-weight: 700;
    font-size: 20px;
    margin-right: 8px;
    color: #FFFFFF;
  }

  #shell .shell-nav-item {
    color: #FFFFFF;
    text-decoration: none;
    padding: 4px 2px;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }

  #shell .shell-nav-item.shell-nav-active {
    font-weight: 700;
    border-bottom: 2px solid #FFFFFF;
  }

  #shell .shell-user {
    margin-left: auto;
    color: #D7E8E6;
  }

  #shell .shell-user strong {
    color: #FFFFFF;
  }

  /* Content area: single centred column (contract section 2). */
  #shell .shell-column {
    max-width: 1100px;
    margin: 0 auto;
    padding: 16px 24px 48px;
  }

  #shell .shell-column h1 {
    font-size: 30px;
  }

  #shell .shell-column h2 {
    font-size: 24px;
  }

  #shell .shell-column h3 {
    font-size: 20px;
  }

  /* NFR-DSK-3 (D9): every interactive element on the desk
     screens presents at least a 44px target (Refs #420). */
  #shell .p-button {
    min-height: 44px;
  }

  #shell .shell-nav .p-button {
    min-height: 44px;
  }

  #shell .shell-locale .p-button {
    min-height: 44px;
  }

  /* Main board design cards (Refs #420): 12px radius, one idea
     per card in a responsive grid. Views carry no style blocks
     (M4), so the shared card presentation lives here. */
  #shell .desk-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin: 16px 0;
  }

  #shell .desk-cards .p-card {
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    background: #FFFFFF;
  }

  #shell .desk-cards .p-card-title h2 {
    font-size: 24px;
    margin: 0 0 8px;
  }

  #shell .desk-cards ul {
    list-style: none;
    padding: 0;
    margin: 8px 0 16px;
  }

  #shell .desk-cards li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 0;
    border-bottom: 1px solid #E5E7EB;
    min-height: 44px;
  }

  #shell .desk-cards li:last-child {
    border-bottom: none;
  }

  /* Book two-column design cards (Refs #421): the guest card
     above the quote card on the left, the dates/room/discount
     card on the right. Same 12px radius and tokens as the Main
     board cards above. */
  #shell .book-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin: 16px 0;
    align-items: start;
  }

  #shell .book-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  #shell .book-layout .p-card {
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    background: #FFFFFF;
  }

  #shell .book-layout .p-card-title h2 {
    font-size: 24px;
    margin: 0 0 8px;
  }

  /* Folio two-card design layout (Refs #423): the charges card
     (lines table plus the post-charge form) on the left, the
     payments card (balance due plus the post-payment form) on
     the right. Same 12px radius and tokens as the cards above.
     The balance-due figure echoes the design's large amber
     amount in the shared warning token (the design's #8A4B08
     carries no token). */
  #shell .folio-layout {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin: 16px 0;
    align-items: start;
  }

  #shell .folio-left {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  #shell .folio-layout .p-card {
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    background: #FFFFFF;
  }

  #shell .folio-layout .p-card-title h2 {
    font-size: 24px;
    margin: 0 0 8px;
  }

  #shell .folio-balance-due {
    font-size: 30px;
    font-weight: 700;
    color: #B45309;
    margin: 0 0 8px;
  }

  /* Native controls stay native (date inputs and selects keep
     their YYYY-MM-DD payloads and setValue semantics; see the
     #338 implementation notes) but wear the tokens. PrimeVue
     components (which always carry their own classes) are
     excluded via :not([class]) so the preset theme owns them. */
  #shell input:not([class]),
  #shell select:not([class]) {
    font: inherit;
    color: #1B2B2A;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 4px 0;
    min-height: 44px;
  }

  #shell button:not([class]) {
    font: inherit;
    color: #FFFFFF;
    background: #0F766E;
    border: 1px solid #0F766E;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
    min-height: 44px;
  }

  #shell button:not([class]):disabled {
    opacity: 0.6;
    cursor: default;
  }

  #shell label {
    display: block;
    margin: 8px 0;
  }

  /* Read-only tables that stay native (row-level controls or
     row testids live here): token borders, tabular numerals
     for money and balances. */
  #shell table {
    border-collapse: collapse;
    margin: 8px 0 16px;
    font-variant-numeric: tabular-nums;
  }

  #shell th,
  #shell td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid #E5E7EB;
  }

  #shell th {
    border-bottom-width: 2px;
  }

  #shell .p-message {
    margin: 8px 0;
  }

  /* Locale switcher (Refs #339): compact EN/VI pair at the end
     of the header row, before sign-out. */
  #shell .shell-locale {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  #shell .shell-locale-label {
    color: #D7E8E6;
    margin-right: 2px;
  }

  /* Sign-in gate form: narrow, one field per line. */
  #shell .shell-form {
    max-width: 360px;
  }

  #shell .shell-form .p-inputtext,
  #shell .shell-form .p-password,
  #shell .shell-form .p-password-input {
    width: 100%;
  }

  #shell .shell-form .p-button {
    margin-top: 8px;
  }
}
</style>
