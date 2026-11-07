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
      the active route shows the design's white pill (Refs #458). -->
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
        <RouterView @setup-complete="loadHotelName" />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { apiFetch, connectivity, retryLastRequest } from './api/client';
import type { ApiError } from './api/client';
import { localeTag, setLocale, t } from './i18n';
import { configuredHotelName } from './onboardingGate';
import { DEFAULT_DOC_TITLE, type DocTitleMeta } from './router';
import { useSessionStore } from './stores/session';

interface NavItem {
  name: string;
  to: string;
  labelKey: string;
  fallback: string;
}

// Design-header order (Refs #472, FR-DSK-1, D1): Desk · Book · Stay ·
// Folio · Print · Admin — the six tabs of the `.dc.html` headers.
// Onboarding and Rooms have no design-header tab: /onboarding stays
// reachable through the empty-database auto-launch plus its deep
// route, /rooms through its deep route (both routes stay registered
// in `router.ts`; this list is the visible set only).
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
    const router = useRouter();
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
        // The gate predicate (Refs #456) treats the boot-seed
        // placeholder as unconfigured: on a fresh database the
        // header keeps the catalogue brand and the wizard launches.
        hotelName.value = configuredHotelName(config.values);
        await maybeLaunchWizard();
      } catch {
        // Unreachable config keeps the catalogue brand: the header
        // never blanks, and the sign-in gate still owns 401s. No
        // wizard launch either — setup cannot persist while the
        // backend is unreachable.
        hotelName.value = '';
      }
    }

    async function maybeLaunchWizard(): Promise<void> {
      // Empty-database first run (Refs #425, LLD section 13.4):
      // an owner/manager session with no configured hotel name
      // belongs in the wizard. Seeded desks keep the existing
      // shell path, and front-desk sessions never move — setup
      // stays owner/manager only (the server still refuses them
      // with FORBIDDEN).
      if (!session.isSignedIn) {
        return;
      }
      if (hotelName.value !== '') {
        return;
      }
      if (session.role !== 'owner' && session.role !== 'manager') {
        return;
      }
      if (route.name === 'onboarding') {
        return;
      }
      await router.replace('/onboarding');
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

    // Per-route document titles (Refs #495 S2): the served document
    // title follows the design board per screen through the route
    // title meta (`router.ts`), resolving via the catalogue so the
    // title tracks the staff locale; routes outside the design batch
    // fall back to the default title.
    function applyDocumentTitle(): void {
      const meta = route.meta as DocTitleMeta;
      // globalThis (not bare `document`): the flat eslint config
      // carries no browser env, so the bare global trips no-undef
      // in SFC script blocks; TS still types it via the DOM lib.
      globalThis.document.title = t(
        typeof meta.docTitleKey === 'string' ? meta.docTitleKey : DEFAULT_DOC_TITLE.key,
        {},
        typeof meta.docTitleFallback === 'string'
          ? meta.docTitleFallback
          : DEFAULT_DOC_TITLE.fallback,
      );
    }

    onMounted(() => {
      // A reload restores the token from sessionStorage: pick up
      // the configured hotel name without another sign-in.
      applyDocumentTitle();
      if (session.isSignedIn) {
        void loadHotelName();
      }
    });

    watch([() => route.name, localeTag], () => {
      applyDocumentTitle();
    });

    return {
      t,
      localeTag,
      session,
      route,
      navItems: NAV_ITEMS,
      displayName,
      hotelName,
      loadHotelName,
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

  /* Teal header (restyle spec section 4, Refs #518): exact
     design bar from the header block on line 2 of every board
     (`docs/design/Main.dc.html:2` — `display:flex;align-items:
     center;gap:8px;padding:0 24px;height:60px;background:#0F4C47;
     color:#fff`; all five tabbed boards agree, `Onboarding.dc.html:2`
     carries the slimmer setup header). Token values live in
     `src/theme/tokens.ts` (`shell`); this rule duplicates them
     because CSS cannot import the TS constants. */
  #shell .shell-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    background: #0F4C47;
    color: #FFFFFF;
    border-bottom: 1px solid #0F4C47;
    padding: 0 24px;
    min-height: 60px;
    box-sizing: border-box;
  }

  /* Brand (every tabbed board line 2: `font-size:18px;
     margin-right:24px`). */
  #shell .shell-brand {
    font-weight: 700;
    font-size: 18px;
    margin-right: 24px;
    color: #FFFFFF;
  }

  /* Nav tabs (every tabbed board line 2: `padding:10px 16px;
     border-radius:8px` on every tab; the base rule carries the
     design box so inactive tabs match the boards, not the old
     underline treatment). min-height:44px keeps the NFR-DSK-3
     target on every tab. */
  #shell .shell-nav-item {
    color: #FFFFFF;
    text-decoration: none;
    padding: 10px 16px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    box-sizing: border-box;
  }

  /* Active tab (Refs #458): the owner design marks the current
     screen with a white pill — white background, teal text,
     semibold, 8px radius — so the active state copies that
     treatment instead of an underline. The pill keeps the 44px
     target from the base item above, and the teal focus outline
     below stays visible on the white background. */
  #shell .shell-nav-item.shell-nav-active {
    font-weight: 600;
    color: #0F4C47;
    background: #FFFFFF;
    border-radius: 8px;
    padding: 10px 16px;
  }

  /* The trailing group (user, locale pill, sign-out) sits right
     via the pill's design `margin-left:auto` (Refs #518) — a second
     auto margin here would split the free space and drift the group
     off the right edge, so this span carries none. */
  #shell .shell-user {
    color: #D7E8E6;
  }

  #shell .shell-user strong {
    color: #FFFFFF;
  }

  /* Content area: single centred column (restyle spec
     section 3: content width 1200px; `tokens.spacing.contentMaxPx`). */
  #shell .shell-column {
    max-width: 1200px;
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

  /* Rooms visual-map design cards (Refs #424, FR-DSK-6): the
     status-chip summary row plus one floor-grouped responsive grid
     of per-room cards. Same 12px radius and tokens as the cards
     above. Views carry no style blocks (M4), so the shared
     presentation lives here. */
  #shell .rooms-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
    margin: 16px 0;
  }

  #shell .rooms-grid .p-card {
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    background: #FFFFFF;
  }

  #shell .rooms-grid .p-card-title h3 {
    font-size: 20px;
    margin: 0 0 8px;
  }

  #shell [data-testid="rooms-summary"] ul {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    list-style: none;
    padding: 0;
    margin: 8px 0 16px;
  }

  #shell [data-testid="rooms-summary"] li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
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

  /* Locale switcher (Refs #339, #518): the design locale pill
     from every tabbed board line 2 (`margin-left:auto;border:1px
     solid #9CC9C4;border-radius:8px;padding:6px 12px`;
     `tokens.shell.pill*`). Behaviour is unchanged (EN/VI persisted
     to localStorage, whole-screen switch, default EN) — only the
     container wears the design pill instead of bare buttons. */
  #shell .shell-locale {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    border: 1px solid #9CC9C4;
    border-radius: 8px;
    padding: 6px 12px;
    box-sizing: border-box;
  }

  /* Inside the pill the PrimeVue button defaults are abandoned
     (restyle spec section 2: PrimeVue stays as logic carrier only
     where it diverges — filled teal/grey rounded buttons would
     fight the `VI | EN` pill text on the design bar). The buttons
     keep their behaviour, testids, aria-pressed, and 44px targets;
     only the fill, border, and radius are dropped so the pill
     container owns the visuals. The active locale reads semibold,
     mirroring the design's active-tab emphasis. */
  #shell .shell-locale .p-button {
    min-height: 44px;
    background: transparent;
    border-color: transparent;
    border-radius: 8px;
    color: #FFFFFF;
    padding: 6px 8px;
  }

  #shell .shell-locale .p-button[aria-pressed="true"] {
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* Focus stays visible on the teal bar (NFR-DSP-2): the shell
     default teal ring would vanish on #0F4C47, so every header
     interactive element — nav tabs, locale pill buttons, and the
     header sign-out button — takes the white ring instead, except
     the inverted active tab, where the teal ring reads on the
     white pill (Refs #458, Refs #518). */
  #shell .shell-nav .shell-nav-item:not(.shell-nav-active):focus-visible,
  #shell .shell-locale .p-button:focus-visible,
  #shell .shell-nav [data-testid="shell-signout"]:focus-visible {
    outline-color: #FFFFFF;
  }

  #shell .shell-locale-label {
    color: #1B2B2A;
    margin-right: 2px;
  }

  /* The same label inside the teal header keeps the light mint:
     it is readable on #0F4C47 (7.7:1) but invisible on the page
     background (1.2:1, Refs #455), so the header scope re-applies
     it explicitly instead of inheriting the gate-safe ink above. */
  #shell .shell-nav .shell-locale-label {
    color: #D7E8E6;
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
