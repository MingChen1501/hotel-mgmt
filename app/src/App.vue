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
        <!-- Locale pill (Refs #339, #518, #564): the design's compact
          `VI | EN` control (every tabbed board line 2) instead of two
          full-word buttons, so the pill, the seven tabs, and the brand
          share the single 60px design row at 1200px. EN/VI persist in
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
            :label="t('desk.shell.locale_short_vi', {}, 'VI')"
            :severity="localeTag === 'vi' ? undefined : 'secondary'"
            size="small"
            :aria-pressed="localeTag === 'vi'"
            data-testid="locale-vi"
            @click="onLocale('vi')"
          />
          <span
            class="shell-locale-sep"
            aria-hidden="true"
          >|</span>
          <Button
            type="button"
            :label="t('desk.shell.locale_short_en', {}, 'EN')"
            :severity="localeTag === 'en' ? undefined : 'secondary'"
            size="small"
            :aria-pressed="localeTag === 'en'"
            data-testid="locale-en"
            @click="onLocale('en')"
          />
        </div>
        <!-- Session menu (Refs #338, #339, #564): the signed-in
          identity and Sign out are app-only controls, so they live in
          a compact disclosure rather than inline on the bar — that is
          what pushed the trailing group onto a second row. A native
          disclosure (bound `aria-expanded`, Escape closes) keeps
          sign-out keyboard reachable without a popup library, and the
          panel stays in the DOM so the shell guards can assert it. -->
        <div
          class="shell-session"
          @keydown.escape="closeSessionMenu"
        >
          <Button
            ref="sessionTrigger"
            type="button"
            class="shell-session-trigger"
            :label="t('desk.shell.session_menu', {}, 'Account')"
            severity="secondary"
            size="small"
            aria-controls="shell-session-menu"
            :aria-expanded="sessionMenuOpen"
            data-testid="shell-session-trigger"
            @click="toggleSessionMenu"
          />
          <div
            v-show="sessionMenuOpen"
            id="shell-session-menu"
            class="shell-session-menu"
            data-testid="shell-session-menu"
            role="group"
            :aria-label="t('desk.shell.session_menu', {}, 'Account')"
          >
            <p class="shell-session-user">
              <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="shell-user">{{ displayName }}</strong>
            </p>
            <Button
              type="button"
              :label="t('desk.admin.signout', {}, 'Sign out')"
              severity="secondary"
              data-testid="shell-signout"
              @click="onSignOut"
            />
          </div>
        </div>
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

// Design-header order (Refs #539, #472, FR-DSK-1, D1): Desk ·
// Rooms · Manage · Book · Stay · Folio · Print · Admin — the seven
// v2 `.dc.html` header tabs plus the app-only `manage` tab (#590,
// owner decision O-1) and the app-only `bookings` tab (#648), both
// with allowance entries in
// `docs/technical/desk-ui-fact-schema.md` section 8. `bookings` sits
// immediately after `Book`, grouping booking creation with booking
// browsing. Onboarding has no design-header tab: /onboarding stays
// reachable through the empty-database auto-launch plus its deep
// route (the route stays registered in `router.ts`; this list is the
// visible set only).
const NAV_ITEMS: NavItem[] = [
  { name: 'desk', to: '/', labelKey: 'desk.shell.nav_desk', fallback: 'Desk' },
  { name: 'rooms', to: '/rooms', labelKey: 'desk.shell.nav_rooms', fallback: 'Rooms' },
  { name: 'manage', to: '/manage', labelKey: 'desk.shell.nav_manage', fallback: 'Manage' },
  { name: 'book', to: '/book', labelKey: 'desk.shell.nav_book', fallback: 'Book' },
  { name: 'bookings', to: '/bookings', labelKey: 'desk.shell.nav_bookings', fallback: 'Bookings' },
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
    // Session menu (Refs #564): the compact header disclosure that
    // carries the signed-in identity and Sign out off the single
    // design row. Open state is local UI state, never persisted.
    const sessionMenuOpen = ref(false);
    // Minimal structural type: the flat eslint config carries no
    // browser env, so the shell never names the DOM globals directly.
    const sessionTrigger = ref<{ $el?: { focus?: () => void } } | null>(null);
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
      sessionMenuOpen.value = false;
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

    // Session menu disclosure (Refs #564): toggle from the trigger,
    // and Escape closes it and returns focus to the trigger so the
    // keyboard path never loses its place (NFR-DSP-2).
    function toggleSessionMenu(): void {
      sessionMenuOpen.value = !sessionMenuOpen.value;
    }

    function closeSessionMenu(): void {
      if (!sessionMenuOpen.value) {
        return;
      }
      sessionMenuOpen.value = false;
      const trigger = sessionTrigger.value?.$el;
      trigger?.focus?.();
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
      // A screen or locale change leaves the menu behind (Refs #564).
      sessionMenuOpen.value = false;
    });

    return {
      t,
      localeTag,
      session,
      route,
      navItems: NAV_ITEMS,
      displayName,
      sessionMenuOpen,
      sessionTrigger,
      toggleSessionMenu,
      closeSessionMenu,
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

  /* Teal header (restyle spec section 4, Refs #518, Refs #564):
     exact design bar from the header block on line 2 of every board
     (`docs/design/Main.dc.html:2` — `display:flex;align-items:
     center;gap:8px;padding:0 24px;height:60px;background:#0F4C47;
     color:#fff`; all five tabbed boards agree, `Onboarding.dc.html:2`
     carries the slimmer setup header). The bar is a fixed 60px
     single row: `flex-wrap:nowrap` plus `height:60px` stop the
     trailing controls from spilling onto a second row (Refs #564,
     the 111px regression). Token values live in
     `src/theme/tokens.ts` (`shell`); this rule duplicates them
     because CSS cannot import the TS constants. */
  #shell .shell-nav {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    background: #0F4C47;
    color: #FFFFFF;
    border-bottom: 1px solid #0F4C47;
    padding: 0 24px;
    height: 60px;
    min-height: 60px;
    box-sizing: border-box;
  }

  /* Brand (every tabbed board line 2: `font-size:18px;
     margin-right:24px`). The brand is the only shrinkable item on
     the bar: a configured hotel name longer than the free space
     truncates instead of wrapping the header (Refs #564). */
  #shell .shell-brand {
    font-weight: 700;
    font-size: 18px;
    margin-right: 24px;
    color: #FFFFFF;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Nav tabs (every tabbed board line 2: `padding:10px 16px;
     border-radius:8px` on every tab; the base rule carries the
     design box so inactive tabs match the boards, not the old
     underline treatment). min-height:44px keeps the NFR-DSK-3
     target on every tab. Tabs never shrink: the design padding and
     label stay intact and the brand truncates first (Refs #564). */
  #shell .shell-nav-item {
    color: #FFFFFF;
    text-decoration: none;
    padding: 10px 16px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    box-sizing: border-box;
    flex: 0 0 auto;
    white-space: nowrap;
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

  /* Session menu (Refs #564): the signed-in identity and Sign out
     are app-only controls, so they collapse into one compact
     disclosure that sits in the trailing group after the locale
     pill. The panel is absolutely positioned below the bar, so it
     never adds a second header row. The trigger and the panel's
     Sign out keep the 44px target (NFR-DSK-3). */
  #shell .shell-session {
    position: relative;
    flex: 0 0 auto;
  }

  #shell .shell-session-trigger {
    background: transparent;
    border: 1px solid #9CC9C4;
    border-radius: 8px;
    color: #FFFFFF;
    padding: 0 12px;
    white-space: nowrap;
  }

  #shell .shell-session-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 200px;
    padding: 12px;
    background: #FFFFFF;
    color: #1B2B2A;
    border: 1px solid #D9E0DE;
    border-radius: 8px;
    box-sizing: border-box;
    text-align: left;
  }

  #shell .shell-session-user {
    margin: 0;
    color: #4B5D5B;
  }

  #shell .shell-session-user strong {
    color: #1B2B2A;
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

  /* Main desk board (Refs #519; restyle spec section 5.1,
     AC-RST-2): pixel-faithful to `docs/design/Main.dc.html:2` —
     business-date row (muted 14px label, 26px/700 value, primary
     refresh button) above the `repeat(3,1fr)` card grids
     (`gap:16px`); cards (`background:#fff;border:1px solid
     #D9E0DE;border-radius:12px;padding:18px`, 16px titles);
     15px rows with `1px solid #EEF1F0` top dividers; muted 15px
     empty states; primary action buttons (`min-height:44px;
     padding:0 18px;border-radius:8px;border:0;background:#0F766E;
     color:#fff;font-weight:600`). PrimeVue stays as logic
     carrier only: Card/DataTable/Button defaults are overridden
     here wherever they diverge from the design (restyle spec
     section 2). Token values live in `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/rowDivider`); this rule
     duplicates them because CSS cannot import the TS constants.
     Views carry no style blocks (M4), so the presentation lives
     here. The five-lane board and room-map sections below keep
     their current presentation (decided extras; accents owned by
     #523, alignment by #491). */
  #shell .desk-date-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 16px 0;
  }

  #shell .desk-date-label {
    display: block;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="desk-business-date"] {
    font-size: 26px;
    font-weight: 700;
    color: #1B2B2A;
  }

  #shell .desk-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin: 16px 0;
  }

  #shell .desk-cards .p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
  }

  #shell .desk-cards .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell .desk-cards .p-card-caption,
  #shell .desk-cards .p-card-content {
    padding: 0;
  }

  #shell .desk-cards .p-card-title h2 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  /* Stay-table rows render the design two-cell rows (Refs #490):
     guest-first 15px cells with `#EEF1F0` top dividers. The header
     row carries no design counterpart (the board shows rows
     only), so it renders quiet 14px muted labels while the
     decided header sequences stay exact (design-facts gate). */
  #shell .desk-cards .p-datatable .p-datatable-table {
    width: 100%;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell .desk-cards .p-datatable th {
    font-size: 14px;
    font-weight: 400;
    color: #4B5D5B;
    text-align: left;
    padding: 10px 0;
    border: 0;
    background: transparent;
  }

  #shell .desk-cards .p-datatable td {
    font-size: 15px;
    text-align: left;
    padding: 10px 0;
    border: 0;
    border-top: 1px solid #EEF1F0;
    background: transparent;
  }

  #shell .desk-cards .p-datatable tbody tr {
    background: transparent;
  }

  #shell .desk-cards .p-datatable .p-datatable-emptymessage td {
    padding: 18px 0;
    color: #4B5D5B;
    font-size: 15px;
    border-top: 1px solid #EEF1F0;
  }

  #shell .desk-cards ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  #shell .desk-cards li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    min-height: 44px;
    box-sizing: border-box;
  }

  #shell .desk-cards li:last-child {
    border-bottom: none;
  }

  /* Design action buttons: the refresh button plus the two
     housekeeping buttons (`docs/design/Main.dc.html:2`). */
  #shell [data-testid="desk-view"] .desk-refresh.p-button,
  #shell [data-testid="desk-view"] .desk-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Book screen (Refs #544; v2 board): pixel-faithful to
     `docs/design/Book.dc.html:3` — no screen title and no section
     heading (the shell header owns the hotel name plus the seven
     design tabs); numbered board h3 card titles (`1. Khách`,
     `Báo giá`, `2. Ngày và phòng`, `margin:0;font-size:16px`); the
     `1.3fr 1fr` top grid (guest card left, quote card right,
     `gap:16px`) with the stay card full-width below; stay fields in
     a `repeat(4,1fr)` grid (`gap:12px`); `14px` labels, full-width
     `44px` controls with `margin-top:6px`, `15px` quote rows with
     `1px solid #EEF1F0` top dividers, muted `14px` helpers, primary
     action buttons
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`). PrimeVue
     stays as logic carrier only: Card/Button/InputText defaults
     are overridden here wherever they diverge from the design
     (restyle spec section 2). Token values live in
     `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/rowDivider`); this rule
     duplicates them because CSS cannot import the TS constants.
     Views carry no style blocks (M4), so the presentation lives
     here. Quote flow state (nightly lines, empty/confirming/
     errors), result/confirmation sections below the form keep their
     current presentation (post-booking states with no design
     counterpart; copy and hooks unchanged). */
  #shell [data-testid="book-booking"] {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  #shell [data-testid="book-booking"] form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
  }

  #shell .book-layout {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 16px;
    margin: 0;
    align-items: start;
  }

  #shell .book-layout .p-card,
  #shell [data-testid="book-stay-card"].p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  #shell .book-layout .p-card-body,
  #shell [data-testid="book-stay-card"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell .book-layout .p-card-caption,
  #shell .book-layout .p-card-content,
  #shell [data-testid="book-stay-card"] .p-card-caption,
  #shell [data-testid="book-stay-card"] .p-card-content {
    padding: 0;
  }

  #shell .book-layout .p-card-title h3,
  #shell [data-testid="book-stay-card"] .p-card-title h3 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="book-view"] .book-helper {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  #shell [data-testid="book-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="book-view"] label input,
  #shell [data-testid="book-view"] label select,
  #shell [data-testid="book-view"] label .p-inputtext {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 6px;
    box-sizing: border-box;
    font: inherit;
  }

  #shell [data-testid="book-view"] .book-guest-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  #shell [data-testid="book-view"] .book-stay-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  #shell [data-testid="book-view"] [data-testid="book-quote-nights-count"],
  #shell [data-testid="book-view"] [data-testid="book-quote-total"] {
    font-size: 15px;
    margin: 0;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    color: #1B2B2A;
  }

  #shell [data-testid="book-view"] [data-testid="book-quote-nights"] {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  #shell [data-testid="book-view"] [data-testid="book-quote-nights"] li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    color: #1B2B2A;
    box-sizing: border-box;
  }

  #shell [data-testid="book-view"] [data-testid="book-quote-empty"] {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  /* Design action buttons: guest search/register, confirm, and
     get-price (`docs/design/Book.dc.html:3`). */
  #shell [data-testid="book-view"] .book-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Full-width board actions: the design draws the quote and
     confirm buttons as full-width column children
     (`docs/design/Book.dc.html:3`); each is the only primary
     action in its card/section scope, while the guest actions
     stay auto-width in their flex row above. */
  #shell [data-testid="book-stay-card"] .book-action.p-button,
  #shell [data-testid="book-quote-section"] .book-action.p-button {
    width: 100%;
  }

  /* Stay check-in/out screen (Refs #541; v2 board
     `docs/design/Stay.dc.html:3`): pixel-faithful to the two-panel
     v2 board — the `1fr 1fr` grid (`gap:16px`) with the check-in
     card left and the check-out card right; cards
     (`background:#fff;border:1px solid #D9E0DE;border-radius:12px;
     padding:18px`, flex column `gap:10px`, h3 `margin:0;
     font-size:16px`); `14px` labels with full-width `44px`
     selects and inputs (`margin-top:6px`); the amber `14px`
     room-picker note (`color:#8A4B08`) and the muted `14px`
     folio gate note (`color:#4B5D5B`); primary action buttons
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`). The v2 board
     carries no screen title, no lists, and no move/times sections
     (zero extras). PrimeVue stays as logic carrier only:
     Card/Button/InputText/Dialog defaults are overridden here
     wherever they diverge from the design. Token values live in
     `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/balanceDue` — the board
     amber `#8A4B08` is the shared balance-due accent, never a
     per-surface fork); this rule duplicates them because CSS
     cannot import the TS constants. Views carry no style blocks
     (M4), so the presentation lives here. The
     review/approval/dialog flow-state blocks keep their
     current presentation (post-review states with no design
     counterpart; copy and hooks unchanged). */
  #shell [data-testid="stay-view"] .stay-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 0;
    align-items: start;
  }

  #shell [data-testid="stay-checkin-card"].p-card,
  #shell [data-testid="stay-checkout-card"].p-card,
  #shell [data-testid="stay-move-card"].p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  /* Move card (Refs #647, rollout 6.17): the one additive card sits
     as a third row of the same grid, spanning both columns below the
     check-in and check-out cards. It reuses the same card, title,
     spacing, and 44px target tokens; no new colour, radius, spacing,
     or target size. */
  #shell [data-testid="stay-move-card"] {
    grid-column: 1 / -1;
  }

  #shell [data-testid="stay-checkin-card"] .p-card-body,
  #shell [data-testid="stay-checkout-card"] .p-card-body,
  #shell [data-testid="stay-move-card"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="stay-checkin-card"] .p-card-caption,
  #shell [data-testid="stay-checkin-card"] .p-card-content,
  #shell [data-testid="stay-checkout-card"] .p-card-caption,
  #shell [data-testid="stay-checkout-card"] .p-card-content,
  #shell [data-testid="stay-move-card"] .p-card-caption,
  #shell [data-testid="stay-move-card"] .p-card-content {
    padding: 0;
  }

  /* The card content is the board column: labels, hints, and
     buttons stretch as its direct flex items, exactly like the
     design panels (`docs/design/Stay.dc.html:3`). */
  #shell [data-testid="stay-checkin-card"] .p-card-content,
  #shell [data-testid="stay-checkout-card"] .p-card-content,
  #shell [data-testid="stay-move-card"] .p-card-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="stay-checkin-card"] .p-card-title h3,
  #shell [data-testid="stay-checkout-card"] .p-card-title h3,
  #shell [data-testid="stay-move-card"] .p-card-title h3 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] .stay-card-title {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] label select,
  #shell [data-testid="stay-view"] label .p-inputtext {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 6px;
    box-sizing: border-box;
    font: inherit;
  }

  #shell [data-testid="stay-view"] .stay-hint {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  /* Board-amber room-picker note
     (`docs/design/Stay.dc.html:3`: `color:#8A4B08;
     font-size:14px`): a second hint treatment beside the muted
     folio gate note above. */
  #shell [data-testid="stay-view"] .stay-hint-amber {
    font-size: 14px;
    color: #8A4B08;
    margin: 0;
  }

  /* Design action buttons: check-in, folio review, approval,
     check-out, the dialog confirm, and the #647 move action
     (`docs/design/Stay.dc.html:3`; the move card is the decided
     additive card). The dialog cancel keeps its secondary
     logic-carrier styling. */
  #shell [data-testid="stay-view"] .stay-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Folio invoice screen (Refs #545; epic #537): pixel-faithful
     to `docs/design/Folio.dc.html:3` — no screen title or intro
     (the v2 board carries neither; the shell header owns the
     board tabs); `folio-main` stacks the stay-ID open step (F3
     flow state, orchestrator decision on #545) above the design
     grid in one column (`gap:16px`); the grid is exactly
     `1fr 1fr` with `gap:16px` (charges card left, payments card
     right); every folio card renders `background:#fff;
     border:1px solid #D9E0DE;border-radius:12px;padding:18px` as
     a flex column with `gap:10px`, card titles (h3 elements) at
     `margin:0;font-size:16px`; the board rows render `15px`
     name-plus-amount lines with `padding:10px 0` and `1px solid
     #EEF1F0` top dividers in a space-between flex row; labels
     are `14px` with full-width controls (`min-height:44px;
     margin-top:6px`); the payments card heads its due block with
     the muted `14px` due label above the `30px/700` due figure in
     the balance-due accent (the running-balance sentence below
     stays as flow state); the open, post-charge, and
     record-payment buttons take the primary action treatment
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`).
     PrimeVue stays as logic carrier only: Card/Button/InputText/
     Message defaults are overridden here wherever they diverge
     from the design. Token values live in `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/rowDivider/balanceDue`);
     this rule duplicates them because CSS cannot import the TS
     constants. Views carry no style blocks (M4), so the
     presentation lives here. The open step (stay-ID entry, the F3
     flow state), the charge-kind and payment-method selects, and
     the folio/invoice print output are unchanged — behaviour,
     flow, and hooks hold exactly as today. */
  #shell [data-testid="folio-main"] {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  #shell .folio-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }

  #shell [data-testid="folio-open-card"].p-card,
  #shell [data-testid="folio-charges-card"].p-card,
  #shell [data-testid="folio-payments-card"].p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  #shell [data-testid="folio-open-card"] .p-card-body,
  #shell [data-testid="folio-charges-card"] .p-card-body,
  #shell [data-testid="folio-payments-card"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="folio-open-card"] .p-card-caption,
  #shell [data-testid="folio-open-card"] .p-card-content,
  #shell [data-testid="folio-charges-card"] .p-card-caption,
  #shell [data-testid="folio-charges-card"] .p-card-content,
  #shell [data-testid="folio-payments-card"] .p-card-caption,
  #shell [data-testid="folio-payments-card"] .p-card-content {
    padding: 0;
  }

  /* Card titles are h3 elements rendering the design h3
     `16px` values (`docs/design/Folio.dc.html:3`). */
  #shell [data-testid="folio-open-card"] .p-card-title h3,
  #shell [data-testid="folio-charges-card"] .p-card-title h3,
  #shell [data-testid="folio-payments-card"] .p-card-title h3 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  /* Folio lines render the design `15px` example-line rows
     (`docs/design/Folio.dc.html:3`): one name-plus-amount row per
     line (`display:flex;justify-content:space-between`),
     `padding:10px 0` with `1px solid #EEF1F0` top dividers. The
     empty message stays as flow state in the muted `14px`
     treatment. */
  #shell [data-testid="folio-view"] .folio-lines {
    display: flex;
    flex-direction: column;
  }

  #shell [data-testid="folio-view"] .folio-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="folio-view"] .folio-line strong {
    font-weight: 700;
  }

  #shell [data-testid="folio-view"] .folio-empty {
    padding: 18px 0;
    margin: 0;
    color: #4B5D5B;
    font-size: 15px;
  }

  #shell [data-testid="folio-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="folio-view"] label input,
  #shell [data-testid="folio-view"] label select,
  #shell [data-testid="folio-view"] label .p-inputtext {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 6px;
    box-sizing: border-box;
    font: inherit;
  }

  /* Due block (`docs/design/Folio.dc.html:3`): the muted
     `14px` `Còn phải trả` label above the `font-size:30px;
     font-weight:700` due figure in the balance-due accent (the
     accent resolves through the shared `balanceDue` token, never
     a per-surface fork). The running-balance sentence below the
     figure stays as flow state in the muted `14px` treatment. */
  #shell [data-testid="folio-view"] .folio-due-label {
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="folio-view"] .folio-status-line {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }
  #shell .folio-balance-due {
    font-size: 30px;
    font-weight: 700;
    color: #8A4B08;
    margin: 0;
  }

  /* Design action buttons: open folio, post charge, and record
     payment (`docs/design/Folio.dc.html:3`:
     `min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`). */
  #shell [data-testid="folio-view"] .folio-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Admin console screen (Refs #546; epic #537): pixel-faithful
     to `docs/design/Admin.dc.html:3` — no screen title or intro
     (the v2 board carries neither; the shell header owns the
     board tabs); `admin-console` stacks the top grid above the
     bottom grid in one column (`gap:20px`); the top grid is
     exactly `1.2fr 1fr` (users card left, create-account card
     right) and the bottom grid exactly `1fr 1fr` (config card
     left, audit card right), both with `gap:16px`; every admin
     card renders `background:#fff;border:1px solid #D9E0DE;
     border-radius:12px;padding:18px` as a flex column with
     `gap:10px`, card titles (h3 elements) at `margin:0;
     font-size:16px`; the board rows render `15px`
     label-plus-value lines with `padding:10px 0` and `1px solid
     #EEF1F0` top dividers in a space-between flex row; the
     locked note renders in the balance-due accent; the create
     form grid is exactly `1fr 1fr` with `gap:12px`, labels `14px`
     with full-width controls (`min-height:44px;margin-top:6px`);
     row and grid actions take the primary treatment
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`) while the
     unlock and refresh actions take the secondary treatment
     (`1px solid #0F766E` border, white fill, teal ink).
     PrimeVue stays as logic carrier only: Card/Button/InputText/
     Password/Message defaults are overridden here wherever they
     diverge from the design. Token values live in
     `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/rowDivider/balanceDue`);
     this rule duplicates them because CSS cannot import the TS
     constants. Views carry no style blocks (M4), so the
     presentation lives here. Behaviour, reads, mutations, and
     hooks hold exactly as today. */
  #shell [data-testid="admin-console"] {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  #shell .admin-grid-top {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 16px;
    align-items: start;
  }

  #shell .admin-grid-bottom {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }

  #shell [data-testid="admin-users-card"].p-card,
  #shell [data-testid="admin-create-card"].p-card,
  #shell [data-testid="admin-config-card"].p-card,
  #shell [data-testid="admin-audit-card"].p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  #shell [data-testid="admin-users-card"] .p-card-body,
  #shell [data-testid="admin-create-card"] .p-card-body,
  #shell [data-testid="admin-config-card"] .p-card-body,
  #shell [data-testid="admin-audit-card"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="admin-users-card"] .p-card-caption,
  #shell [data-testid="admin-users-card"] .p-card-content,
  #shell [data-testid="admin-create-card"] .p-card-caption,
  #shell [data-testid="admin-create-card"] .p-card-content,
  #shell [data-testid="admin-config-card"] .p-card-caption,
  #shell [data-testid="admin-config-card"] .p-card-content,
  #shell [data-testid="admin-audit-card"] .p-card-caption,
  #shell [data-testid="admin-audit-card"] .p-card-content {
    padding: 0;
  }

  /* Card titles are h3 elements rendering the design h3
     `16px` values (`docs/design/Admin.dc.html:3`). */
  #shell [data-testid="admin-users-card"] .p-card-title h3,
  #shell [data-testid="admin-create-card"] .p-card-title h3,
  #shell [data-testid="admin-config-card"] .p-card-title h3,
  #shell [data-testid="admin-audit-card"] .p-card-title h3 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  /* Admin rows render the design `15px` label-plus-value lines
     (`docs/design/Admin.dc.html:3`): one space-between flex row
     per line (`display:flex;align-items:center;
     justify-content:space-between`), `padding:10px 0` with
     `1px solid #EEF1F0` top dividers. The locked note renders in
     the balance-due accent; the empty message stays as flow
     state in the muted `15px` treatment. */
  #shell [data-testid="admin-view"] .admin-rows {
    display: flex;
    flex-direction: column;
  }

  #shell [data-testid="admin-view"] .admin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="admin-view"] .admin-row strong {
    font-weight: 700;
  }

  #shell [data-testid="admin-view"] .admin-row select {
    min-height: 44px;
    font: inherit;
  }

  #shell [data-testid="admin-view"] .admin-locked {
    color: #8A4B08;
  }

  #shell [data-testid="admin-view"] .admin-empty {
    padding: 18px 0;
    margin: 0;
    color: #4B5D5B;
    font-size: 15px;
  }

  /* Create-account form (`docs/design/Admin.dc.html:3`): the
     `1fr 1fr` label grid with `gap:12px`; labels are `14px`
     with full-width controls (`min-height:44px;
     margin-top:6px`); the form stacks the grid above the
     full-width primary create action. */
  #shell [data-testid="admin-view"] .admin-create-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="admin-view"] .admin-form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  #shell [data-testid="admin-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="admin-view"] label input,
  #shell [data-testid="admin-view"] label select,
  #shell [data-testid="admin-view"] label .p-inputtext {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 6px;
    box-sizing: border-box;
    font: inherit;
  }

  /* The secret field pairs a standalone label with the
     password control (the control sits outside the label so the
     Password live-region text stays out of the label the
     design-facts gate collects, Refs #542); the control takes
     the same full-width `44px` treatment below its label. */
  #shell [data-testid="admin-view"] .admin-form-grid .p-password {
    display: block;
    width: 100%;
    margin-top: 6px;
  }

  #shell [data-testid="admin-view"] .admin-form-grid .p-password input {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    font: inherit;
  }

  /* Design action buttons: save role and create account take the
     primary action treatment (`docs/design/Admin.dc.html:3`:
     `min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`); unlock and
     refresh take the secondary treatment (`1px solid #0F766E`
     border, white fill, teal ink). */
  #shell [data-testid="admin-view"] .admin-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  #shell [data-testid="admin-view"] .admin-action-secondary.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid #0F766E;
    background: #FFFFFF;
    color: #0F766E;
    font-weight: 600;
  }

  /* Rooms map screen (Refs #523, #543; restyle spec section 5.5,
     AC-RST-6): pixel-faithful to `docs/design/Rooms.dc.html:2` —
     the title row is a flex row with `justify-content:space-between`
     carrying the muted `14px` eyebrow (`{title} · {date}`) above
     the `26px/700` counts headline left and the primary reload
     button right (the eyebrow date keeps the weekday-long form,
     AC-DSK-12 #513; intro, standalone date row, and section
     heading are gone — zero extras vs the v2 board); floor h2
     elements render `margin:0 0 8px;font-size:18px`; the status-chip row is a
     wrapped flex row (`gap:10px`) of white `999px` pills
     (`8px 14px`, `14px`) with `12px` status dots at radius `3px`
     (app chip wording stays — the R3 REPORTED item #499 stays
     reported); floor grids are exactly `repeat(6,1fr)` with
     `gap:12px`; room cards render their status tint with
     `border-radius:12px;padding:14px;gap:6px;min-height:104px`,
     the head row carries the `22px` number left and the
     `12px/600` badge (`radius:6px;padding:4px 8px`, white on the
     status accent) right, the type line renders `13px #3B4A48`,
     the live note `14px`, and the housekeeping buttons take the
     primary action treatment (`min-height:44px;padding:0 18px;
     border-radius:8px;border:0;background:#0F766E;color:#fff;
     font-weight:600`).
     PrimeVue stays as logic carrier only: Card/Tag/Button defaults
     are overridden here wherever they diverge from the design
     (restyle spec section 2). Token values live in
     `src/theme/tokens.ts` (`colors.primary/muted/roomReady/
     roomOccupied/roomNeedsClean/roomAwaitingInspection/
     roomOutOfService`, the `roomTint...` tints, `roomNoteInk`,
     `cardBorder`); this rule
     duplicates them because CSS cannot import the TS constants.
     Views carry no style blocks (M4), so the presentation lives
     here. Recorded divergence: the fixed `repeat(6,1fr)` grid
     matches the board verbatim and squeezes on narrow viewports
     (same accepted divergence as the Folio `1fr 1fr` grid, Refs
     #522). Behaviour, reads, transitions, grouping, copy, and
     hooks hold exactly as today. */
  #shell [data-testid="rooms-view"] {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  #shell [data-testid="rooms-view"] .rooms-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 24px;
  }

  #shell [data-testid="rooms-view"] .rooms-title-block {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  #shell [data-testid="rooms-view"] .rooms-eyebrow {
    font-size: 14px;
    font-weight: 400;
    margin: 0;
    color: #4B5D5B;
  }

  #shell [data-testid="rooms-view"] .rooms-eyebrow strong {
    font-weight: inherit;
  }

  #shell [data-testid="rooms-view"] .rooms-headline {
    font-size: 26px;
    font-weight: 700;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="rooms-view"] .rooms-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  #shell [data-testid="rooms-view"] .rooms-empty {
    font-size: 15px;
    color: #4B5D5B;
    padding: 0 24px;
    margin: 0;
  }

  #shell [data-testid="rooms-summary"] {
    padding: 0 24px;
  }

  #shell [data-testid="rooms-view"] .rooms-section-title {
    font-size: 18px;
    margin: 0 0 8px;
    color: #1B2B2A;
  }

  #shell [data-testid="rooms-summary"] .rooms-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #FFFFFF;
    border: 1px solid #D9E0DE;
    border-radius: 999px;
    padding: 8px 14px;
    font-size: 14px;
    color: #1B2B2A;
    min-height: 44px;
    box-sizing: border-box;
  }

  /* Summary-chip Tags keep their hooks and wording (the R3
     REPORTED item #499 stays reported) and render as the
     design pill labels: no PrimeVue fill, ink `14px` text. */
  #shell [data-testid="rooms-summary"] .rooms-chip-tag.p-tag {
    background: transparent;
    border: 0;
    color: #1B2B2A;
    font-size: 14px;
    font-weight: 400;
    padding: 0;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-tag.p-tag .p-tag-value {
    padding: 0;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex: none;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-ready .rooms-chip-dot {
    background: #0F766E;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-occupied .rooms-chip-dot {
    background: #1D4E89;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-needs-cleaning .rooms-chip-dot {
    background: #8A4B08;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-awaiting-inspection .rooms-chip-dot {
    background: #5B3F9A;
  }

  #shell [data-testid="rooms-summary"] .rooms-chip-out-of-service .rooms-chip-dot {
    background: #4B5563;
  }

  #shell [data-testid="rooms-view"] .rooms-floor {
    padding: 0 24px;
  }

  #shell [data-testid="rooms-view"] .rooms-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
  }

  /* Room cards keep their PrimeVue Card hooks (logic carrier
     only): the tint carries the status, the stock fill, border,
     shadow, and padding are gone, and the body is the design
     `14px` column with `gap:6px`. */
  #shell [data-testid="rooms-view"] .room-card.p-card {
    border: 0;
    border-radius: 12px;
    box-shadow: none;
    margin: 0;
  }

  #shell [data-testid="rooms-view"] .room-card-ready.p-card {
    background: #E3F3EC;
  }

  #shell [data-testid="rooms-view"] .room-card-occupied.p-card {
    background: #E1ECF9;
  }

  #shell [data-testid="rooms-view"] .room-card-needs-cleaning.p-card {
    background: #FCEBD2;
  }

  #shell [data-testid="rooms-view"] .room-card-awaiting-inspection.p-card {
    background: #ECE6F7;
  }

  #shell [data-testid="rooms-view"] .room-card-out-of-service.p-card {
    background: #E6E8E7;
  }

  #shell [data-testid="rooms-view"] .room-card .p-card-body {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 104px;
    box-sizing: border-box;
  }

  #shell [data-testid="rooms-view"] .room-card .p-card-caption,
  #shell [data-testid="rooms-view"] .room-card .p-card-content {
    padding: 0;
  }

  #shell [data-testid="rooms-view"] .room-card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  #shell [data-testid="rooms-view"] .room-card-number {
    font-size: 22px;
    margin: 0;
    color: #1B2B2A;
    font-weight: 700;
  }

  /* Card badges keep their Tag hooks and the shared chip wording
     and render the design `12px/600` white-on-accent pills. */
  #shell [data-testid="rooms-view"] .room-card-badge.p-tag {
    border: 0;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    color: #FFFFFF;
  }

  #shell [data-testid="rooms-view"] .room-card-badge.p-tag .p-tag-value {
    padding: 0;
  }

  #shell [data-testid="rooms-view"] .room-card-ready .room-card-badge.p-tag {
    background: #0F766E;
  }

  #shell [data-testid="rooms-view"] .room-card-occupied .room-card-badge.p-tag {
    background: #1D4E89;
  }

  #shell [data-testid="rooms-view"] .room-card-needs-cleaning .room-card-badge.p-tag {
    background: #8A4B08;
  }

  #shell [data-testid="rooms-view"] .room-card-awaiting-inspection .room-card-badge.p-tag {
    background: #5B3F9A;
  }

  #shell [data-testid="rooms-view"] .room-card-out-of-service .room-card-badge.p-tag {
    background: #4B5563;
  }

  #shell [data-testid="rooms-view"] .room-card-type {
    font-size: 13px;
    color: #3B4A48;
    margin: 0;
  }

  #shell [data-testid="rooms-view"] .room-card-note {
    font-size: 14px;
    color: #1B2B2A;
    margin: 0;
  }

  /* Onboarding wizard (Refs #542): pixel-faithful to the v2
     board `docs/design/Onboarding.dc.html:3` — the view opens
     directly on the centred `560px` column (`margin:0 auto`,
     flex column `gap:16px`) under the shell nav (the board's
     slim setup header maps to the shell teal bar, R1; the header
     stays shell-owned). The board carries no screen title or
     intro, so neither renders (zero extras, Stay #541
     precedent). The muted `14px` progress line reads the board
     phase format (`{current} / {total} · {step}`); the `8px`
     track (`#D9E0DE`, radius `4px`) carries the primary bar at
     25/50/75/100 percent; every step card renders
     `background:#fff;border:1px solid #D9E0DE;border-radius:12px;
     padding:18px` as a flex column with `gap:10px`, step heads
     as h3 elements at the board card-h3 `margin:0;
     font-size:16px`; the step-1 hotel-name input renders bare
     under its h3 with no label line (accessible name via
     aria-label), while steps 2–4 labels are `14px` and their
     controls full-width `44px` with `margin-top:6px`; helpers
     muted `14px`; the primary advance action is full-width
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`) while Back
     (steps 2–4 only) keeps its secondary logic-carrier styling
     with a 44px target (Stay #521 dialog-cancel precedent).
     Steps 2–4 fieldsets, row add/remove controls, and flow
     states carry no board counterpart: fieldsets render
     borderless in the card rhythm with quiet `14px/600` group
     titles, rows stack with the card gap, and the fixed `560px`
     column squeezes on narrow viewports (same accepted
     divergence as the Folio `1fr 1fr` grid, Refs #522). PrimeVue
     stays as logic carrier only: InputText/Button/Message/
     ProgressBar defaults are overridden here wherever they
     diverge from the design (restyle spec section 2). Token
     values live in `src/theme/tokens.ts`
     (`colors.surface/page/ink/muted/header/primary/cardBorder`);
     this rule duplicates them because CSS cannot import the TS
     constants. Views carry no style blocks (M4), so the
     presentation lives here. Behaviour, flow, and hooks hold
     exactly as today. */
  #shell [data-testid="onboarding-view"] {
    width: 560px;
    max-width: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
  }

  #shell [data-testid="onboarding-view"] .onboarding-progress {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  #shell [data-testid="onboarding-view"] .onboarding-progress-bar.p-progressbar {
    height: 8px;
    background: #D9E0DE;
    border: 0;
    border-radius: 4px;
  }

  #shell [data-testid="onboarding-view"] .onboarding-progress-bar.p-progressbar .p-progressbar-value {
    background: #0F766E;
    border-radius: 4px;
  }

  #shell [data-testid="onboarding-view"] .onboarding-step-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 0;
  }

  #shell [data-testid="onboarding-view"] .onboarding-card {
    background: #FFFFFF;
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    box-sizing: border-box;
  }

  /* Step heads are h3 elements per the board card-h3
     (`docs/design/Onboarding.dc.html:3`) and render its `16px`
     values. */
  #shell [data-testid="onboarding-view"] .onboarding-card-title {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="onboarding-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="onboarding-view"] label input,
  #shell [data-testid="onboarding-view"] label select,
  #shell [data-testid="onboarding-view"] label .p-inputtext {
    display: block;
    width: 100%;
    min-height: 44px;
    margin-top: 6px;
    box-sizing: border-box;
    font: inherit;
  }

  #shell [data-testid="onboarding-view"] .onboarding-helper {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  #shell [data-testid="onboarding-view"] .onboarding-group {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="onboarding-view"] .onboarding-group-title {
    font-size: 14px;
    font-weight: 600;
    color: #1B2B2A;
    padding: 0;
    margin: 0;
  }

  #shell [data-testid="onboarding-view"] .onboarding-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="onboarding-view"] .onboarding-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* Design advance action: Continue/Finish, row add/remove, and
     retry (`docs/design/Onboarding.dc.html:2`:
     `min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`), full-width
     per the board button. */
  #shell [data-testid="onboarding-view"] .onboarding-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
    width: 100%;
  }

  /* Back keeps its secondary logic-carrier styling (Stay #521
     dialog-cancel precedent); only the 44px target is pinned so
     the wizard navigation meets NFR-DSK-3. */
  #shell [data-testid="onboarding-view"] .onboarding-back.p-button {
    min-height: 44px;
    width: 100%;
  }

  #shell [data-testid="rooms-view"] .room-card-action {
    margin: 4px 0 0;
  }

  #shell [data-testid="rooms-view"] .room-card-action .rooms-action.p-button {
    width: 100%;
  }

  /* Native controls stay native (the selects keep their payloads
     and setValue semantics; see the #338 implementation notes) but
     wear the tokens. PrimeVue components (which always carry their
     own classes) are excluded via :not([class]) so the preset theme
     owns them. Refs #566: the Book date fields are text InputTexts
     now (the native date picker rendered in the browser locale), so
     no `input[type=date]` rule is needed here. */
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
    flex: 0 0 auto;
  }

  /* Design `VI | EN` separator (every tabbed board line 2). It is a
     decorative glyph, so the span is aria-hidden in the template and
     inherits the scope ink of the pill container. */
  #shell .shell-locale-sep {
    color: inherit;
    opacity: 0.7;
  }

  /* Inside the pill the PrimeVue button defaults are abandoned
     (restyle spec section 2: PrimeVue stays as logic carrier only
     where it diverges — filled teal/grey rounded buttons would
     fight the `VI | EN` pill text on the design bar). The buttons
     keep their behaviour, testids, aria-pressed, and 44px targets;
     only the fill, border, and radius are dropped so the pill
     container owns the visuals. The active locale reads semibold,
     mirroring the design's active-tab emphasis.

     The ink is the gate-safe page ink (Refs #571 — the #455 label
     fix shape): the sign-in gate reuses this block on the pale
     `#F4F6F5` page, where the header white reads 1.1:1 and is
     effectively invisible. The value resolves through
     `src/theme/tokens.ts` (`shell.pillInk`); this rule duplicates
     it because CSS cannot import the TS constants. The header
     scope re-applies the light ink below. */
  #shell .shell-locale .p-button {
    min-height: 44px;
    background: transparent;
    border-color: transparent;
    border-radius: 8px;
    color: #1B2B2A;
    padding: 6px 8px;
  }

  /* The same pill buttons inside the teal header keep the light
     ink: white is readable on `#0F4C47` (9.8:1) but invisible on
     the page background (1.1:1, Refs #571, Refs #455), so the
     header scope re-applies it explicitly instead of inheriting
     the gate-safe ink above — resting and pressed buttons share
     this ink. The value resolves through `src/theme/tokens.ts`
     (`shell.pillInkOnTeal`); this rule duplicates it because CSS
     cannot import the TS constants. */
  #shell .shell-nav .shell-locale .p-button {
    color: #FFFFFF;
  }

  #shell .shell-locale .p-button[aria-pressed="true"] {
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* Focus stays visible on the teal bar (NFR-DSP-2): the shell
     default teal ring would vanish on #0F4C47, so every control
     that actually renders on the bar — nav tabs, locale pill
     buttons, and the account trigger — takes the white ring
     instead, except the inverted active tab, where the teal ring
     reads on the white pill (Refs #458, Refs #518).
     Sign out is deliberately NOT in this list (Refs #564): it
     renders inside the white account panel
     (`#shell .shell-session-menu`), where the white ring painted
     at ~1:1 and hid the keyboard indicator. Without this scope it
     inherits the shell default `#0F766E` ring from
     `#shell :focus-visible`, which reads on white at ~5.5:1. The
     rendered ring colour is pinned in Chromium by
     `app/e2e/signin.spec.ts` (computed style, keyboard path). */
  #shell .shell-nav .shell-nav-item:not(.shell-nav-active):focus-visible,
  #shell .shell-locale .p-button:focus-visible,
  #shell .shell-nav [data-testid="shell-session-trigger"]:focus-visible {
    outline-color: #FFFFFF;
  }

  #shell .shell-locale-label {
    color: #1B2B2A;
    margin-right: 2px;
  }

  /* The same label inside the teal header keeps the light mint:
     it is readable on #0F4C47 (7.7:1) but invisible on the page
     background (1.2:1, Refs #455), so the header scope re-applies
     it explicitly instead of inheriting the gate-safe ink above.
     The value resolves through `src/theme/tokens.ts`
     (`shell.localeLabelOnTeal`); this rule duplicates it because
     CSS cannot import the TS constants. */
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

  /* Rooms and rates management screen (Refs #590; the approved board
     `docs/design/RoomsRates.dc.md` sections 4-7): the screen carries
     the design h1 `22px/700` plus the muted `14px` intro, then three
     stacked card groups in setup order with `24px` between them.
     Section A is the `1.4fr 1fr` list-plus-form pair; section B is
     the add-room card above the floor-grouped list; section C is the
     control row, the seven-column nightly grid, and the range-entry
     form. Cards render `background:#FFFFFF;border:1px solid
     #D9E0DE;border-radius:12px;padding:18px`; rows are `15px` lines
     with `1px solid #EEF1F0` dividers; every control keeps the
     `44px` target and the label-above-input pattern; primary actions
     take the `#0F766E` fill and secondary actions the teal border on
     white. Token values live in `src/theme/tokens.ts`
     (`colors.ink/muted/cardBorder/rowDivider/primary/danger/
     success`); this rule duplicates them because CSS cannot import
     the TS constants. Views carry no style blocks (M4), so the
     presentation lives here. Zero new tokens: no value below is
     outside the shared palette. */
  #shell .manage-head {
    margin-bottom: 8px;
  }

  #shell .manage-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #1B2B2A;
  }

  #shell .manage-intro {
    margin: 4px 0 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 24px;
  }

  #shell [data-testid="manage-view"] .manage-grid-types {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 16px;
    align-items: start;
  }

  #shell [data-testid="manage-view"] .p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  #shell [data-testid="manage-view"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="manage-view"] .p-card-caption,
  #shell [data-testid="manage-view"] .p-card-content {
    padding: 0;
  }

  #shell [data-testid="manage-view"] .p-card-title h3 {
    margin: 0;
    font-size: 16px;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-rows {
    display: flex;
    flex-direction: column;
  }

  #shell [data-testid="manage-view"] .manage-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  #shell [data-testid="manage-view"] .manage-row-meta {
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-room-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) 120px minmax(160px, 1fr) auto;
    justify-content: initial;
  }

  #shell [data-testid="manage-view"] .manage-room-number {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  #shell [data-testid="manage-view"] .manage-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  #shell [data-testid="manage-view"] .manage-form label,
  #shell [data-testid="manage-view"] .manage-rate-controls label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-form-wide {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
    align-items: end;
  }

  #shell [data-testid="manage-view"] .manage-form-wide .manage-actions,
  #shell [data-testid="manage-view"] .manage-form-wide .manage-error,
  #shell [data-testid="manage-view"] .manage-form-wide .manage-success,
  #shell [data-testid="manage-view"] .manage-form-wide .manage-hint {
    grid-column: 1 / -1;
  }

  #shell [data-testid="manage-view"] .manage-form .p-inputtext,
  #shell [data-testid="manage-view"] .manage-form select,
  #shell [data-testid="manage-view"] .manage-rate-controls .p-inputtext,
  #shell [data-testid="manage-view"] .manage-rate-controls select,
  #shell [data-testid="manage-view"] .manage-rate-controls .p-datepicker,
  #shell [data-testid="manage-view"] .manage-rate-controls .p-datepicker-input,
  #shell [data-testid="manage-view"] .manage-room-row .p-inputtext,
  #shell [data-testid="manage-view"] .manage-room-row select {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    font: inherit;
  }

  #shell [data-testid="manage-view"] .manage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  #shell [data-testid="manage-view"] .manage-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  #shell [data-testid="manage-view"] .manage-action-secondary.p-button,
  #shell [data-testid="manage-view"] .manage-row-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid #0F766E;
    background: #FFFFFF;
    color: #0F766E;
    font-weight: 600;
  }

  #shell [data-testid="manage-view"] .manage-hint,
  #shell [data-testid="manage-view"] .manage-rate-summary {
    margin: 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-empty {
    margin: 0;
    padding: 10px 0;
    font-size: 15px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-error {
    margin: 0;
    font-size: 14px;
    color: #B91C1C;
  }

  #shell [data-testid="manage-view"] .manage-success {
    margin: 0;
    font-size: 14px;
    color: #15803D;
  }

  #shell [data-testid="manage-view"] .manage-floor {
    margin-top: 8px;
  }

  #shell [data-testid="manage-view"] .manage-floor-title {
    margin: 0 0 8px;
    font-size: 16px;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-rate-controls {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    align-items: end;
  }

  #shell [data-testid="manage-view"] .manage-rate-read {
    display: flex;
    align-items: end;
  }

  #shell [data-testid="manage-view"] .manage-rate-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }

  #shell [data-testid="manage-view"] .manage-rate-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
  }

  #shell [data-testid="manage-view"] .manage-rate-weekday,
  #shell [data-testid="manage-view"] .manage-rate-date {
    font-size: 13px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-rate-amount {
    font-size: 15px;
    font-weight: 600;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-rate-caption {
    font-size: 12px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-rate-empty {
    max-width: 560px;
    margin: 8px auto;
    padding: 24px 16px;
    text-align: center;
    background: #F4F6F5;
    border-radius: 12px;
  }

  #shell [data-testid="manage-view"] .manage-rate-empty-title {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 700;
    color: #1B2B2A;
  }

  #shell [data-testid="manage-view"] .manage-rate-empty-body {
    margin: 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="manage-view"] .manage-plan-missing {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  /* Read-only booking register (Refs #648): an app-only screen over
     five existing reads, so no owner board styles it. The screen borrows
     the desk shell, card, and row vocabulary: the h1 `22px/700` plus the
     muted `14px` intro, one filter card, one list card with a static
     header row and one row per booking, and a detail card under the
     list. Cards render `background:#FFFFFF;border:1px solid #D9E0DE;
     border-radius:12px;padding:18px`; rows are `15px` lines with `1px
     solid #EEF1F0` dividers; the row's guest name is a link-styled `44px`
     action with the reference in muted ink beneath it, and the selected
     row carries a `3px` inset left rule in the primary accent plus the
     ink weight. Token values live in `src/theme/tokens.ts`; this rule
     duplicates them because CSS cannot import the TS constants. Views
     carry no style blocks (M4), so the presentation lives here. Zero new
     tokens: no value below is outside the shared palette. */
  #shell .bookings-head {
    margin-bottom: 8px;
  }

  #shell .bookings-title {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    color: #1B2B2A;
  }

  #shell .bookings-intro {
    margin: 4px 0 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 16px 0 0;
  }

  #shell [data-testid="bookings-view"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="bookings-view"] .p-card-caption,
  #shell [data-testid="bookings-view"] .p-card-content {
    padding: 0;
  }

  #shell [data-testid="bookings-view"] .p-card-title h2 {
    margin: 0;
    font-size: 16px;
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .bookings-filter {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 16px;
  }

  #shell [data-testid="bookings-view"] .bookings-filter label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .bookings-filter .p-datepicker,
  #shell [data-testid="bookings-view"] .bookings-filter .p-datepicker-input {
    width: 180px;
    min-height: 44px;
    box-sizing: border-box;
    font: inherit;
  }

  #shell [data-testid="bookings-view"] .bookings-filter-action {
    display: flex;
    align-items: flex-end;
  }

  #shell [data-testid="bookings-view"] .bookings-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  #shell [data-testid="bookings-view"] .bookings-action-secondary.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid #0F766E;
    background: #FFFFFF;
    color: #0F766E;
    font-weight: 600;
  }

  #shell [data-testid="bookings-view"] .bookings-hint {
    margin: 8px 0 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-error {
    margin: 8px 0 0;
    font-size: 14px;
    color: #B91C1C;
  }

  #shell [data-testid="bookings-view"] .bookings-list-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  #shell [data-testid="bookings-view"] .bookings-notices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 16px;
  }

  #shell [data-testid="bookings-view"] .bookings-notice {
    margin: 0;
    font-size: 14px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-row {
    display: grid;
    grid-template-columns:
      minmax(180px, 1.6fr)
      minmax(110px, 1fr)
      80px
      110px
      110px
      70px
      minmax(110px, 1fr)
      120px;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid #EEF1F0;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .bookings-row-head {
    border-top: 0;
    padding-top: 0;
    font-size: 13px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-guest-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  #shell [data-testid="bookings-view"] .bookings-row-ref {
    font-size: 13px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-row-open {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0;
    margin: 0;
    border: 0;
    background: none;
    color: #0F766E;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  /* A cancelled or no-show row reads as inactive at a glance: its value
     text takes the muted ink (spec section 5). */
  #shell [data-testid="bookings-view"] .bookings-row-inactive {
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-row-selected {
    box-shadow: inset 3px 0 0 #0F766E;
    padding-left: 10px;
  }

  #shell [data-testid="bookings-view"] .bookings-row-selected .bookings-row-open {
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .p-tag {
    background: #F4F6F5;
    color: #1B2B2A;
    border: 1px solid #D9E0DE;
    white-space: nowrap;
  }

  #shell [data-testid="bookings-view"] .bookings-empty {
    margin: 0;
    padding: 10px 0;
    font-size: 15px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-detail-ref {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 600;
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .bookings-detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
  }

  #shell [data-testid="bookings-view"] .bookings-detail-line {
    display: flex;
    gap: 12px;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="bookings-view"] .bookings-detail-line dt {
    min-width: 160px;
    color: #4B5D5B;
  }

  #shell [data-testid="bookings-view"] .bookings-detail-line dd {
    margin: 0;
  }

  #shell [data-testid="bookings-view"] .bookings-detail-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
}

/* Narrow header row (Refs #648, R-12). The ninth tab is app-only, and
   below the design width the nine localized tabs plus the locale pill
   and the session control no longer fit beside a visible brand: with
   the brand already shrunk to zero, the VI row overflowed a 1200px
   viewport by ~20px (`signin.spec.ts` spill). The design keeps every
   tab, the pill, and the session control at their size and leaves the
   brand as the only shrinkable item, so this rule only tightens the
   inter-item gap in that narrow band (8px -> 4px, the design value
   stays at every wider width including the 1280px kiosk). The product
   spec reserves the alternative (a shorter tab label) to the owner;
   this is the shell-rule side of that decision, recorded for the
   owner-review. */
@media screen and (max-width: 1240px) {
  #shell .shell-nav {
    gap: 4px;
  }
}
</style>
