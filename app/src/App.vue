<template>
  <div id="shell">
    <div
      v-if="!connectivity.online"
      role="alert"
      data-testid="offline-banner"
    >
      <p data-testid="offline-text">
        Connection lost{{ connectivity.lastError ? ` — ${connectivity.lastError}` : '' }}.
        Desk actions are blocked until the connection returns; nothing is queued.
      </p>
      <button
        type="button"
        data-testid="offline-retry"
        @click="onRetry"
      >
        Retry now
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
        aria-label="Desk screens"
      >
        <span
          data-testid="shell-brand"
          class="shell-brand"
        >{{ t('desk.shell.brand', {}, 'Hotel Management') }}</span>
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
import { computed, defineComponent, ref } from 'vue';
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

    async function onRetry(): Promise<void> {
      retryMessage.value = 'Retrying…';
      try {
        const result = await retryLastRequest();
        retryMessage.value =
          result === false ? 'Nothing to retry.' : 'Retry succeeded.';
      } catch (err) {
        retryMessage.value = err instanceof Error ? err.message : 'Retry failed.';
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
      session.signOut();
    }

    // Locale switch (Refs #339): persists the locale only — auth and
    // session data stay in sessionStorage per the session store.
    function onLocale(tag: string): void {
      setLocale(tag);
    }

    return {
      t,
      localeTag,
      session,
      route,
      navItems: NAV_ITEMS,
      displayName,
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
/* Desk shell stylesheet (Refs #338, contract sections 1–2, LLD section 12.1).
   Token values duplicated from `src/theme/tokens.ts` (CSS cannot
   import the TS constants; keep both in sync). The ENTIRE block
   lives inside `@media screen` so screen styling can never leak
   into print (FR-DSP-4, M4): the `@media print` rules owned by
   the print views stay the only print styling. */
@media screen {
  #shell {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    color: #1F2933;
    background: #F4F2ED;
    min-height: 100vh;
  }

  /* Keyboard focus is always visible (NFR-DSP-2): 2px desk-blue
     outline on every interactive element. */
  #shell :focus-visible {
    outline: 2px solid #1D4ED8;
    outline-offset: 2px;
  }

  /* Top nav (FR-DSP-1): six destinations in contract section 2 order,
     then the user name, then sign-out. */
  #shell .shell-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    background: #FFFFFF;
    border-bottom: 1px solid #E5E7EB;
    padding: 12px 24px;
  }

  #shell .shell-brand {
    font-weight: 700;
    font-size: 20px;
    margin-right: 8px;
  }

  #shell .shell-nav-item {
    color: #1F2933;
    text-decoration: none;
    padding: 4px 2px;
  }

  #shell .shell-nav-item.shell-nav-active {
    font-weight: 700;
    border-bottom: 2px solid #1D4ED8;
  }

  #shell .shell-user {
    margin-left: auto;
    color: #6B7280;
  }

  #shell .shell-user strong {
    color: #1F2933;
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

  /* Native controls stay native (date inputs and selects keep
     their YYYY-MM-DD payloads and setValue semantics; see the
     #338 implementation notes) but wear the tokens. PrimeVue
     components (which always carry their own classes) are
     excluded via :not([class]) so the preset theme owns them. */
  #shell input:not([class]),
  #shell select:not([class]) {
    font: inherit;
    color: #1F2933;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 4px 0;
  }

  #shell button:not([class]) {
    font: inherit;
    color: #FFFFFF;
    background: #1D4ED8;
    border: 1px solid #1D4ED8;
    border-radius: 4px;
    padding: 8px 16px;
    cursor: pointer;
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
    color: #6B7280;
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
