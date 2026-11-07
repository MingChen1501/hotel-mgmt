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

  /* Book screen (Refs #520; restyle spec section 5.2, AC-RST-3):
     pixel-faithful to `docs/design/Book.dc.html:2-:5` — h1 `22px`,
     section h2 `18px`, the `1.3fr 1fr` top grid (guest card left,
     quote card right, `gap:16px`) with the stay card full-width
     below, stay fields in a `repeat(4,1fr)` grid (`gap:12px`),
     `14px` labels, full-width `44px` controls with
     `margin-top:6px`, `15px` quote rows with `1px solid #EEF1F0`
     top dividers, muted `14px` helpers, primary action buttons
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`). PrimeVue
     stays as logic carrier only: Card/Button/InputText defaults
     are overridden here wherever they diverge from the design
     (restyle spec section 2). Token values live in
     `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder/rowDivider`); this rule
     duplicates them because CSS cannot import the TS constants.
     Views carry no style blocks (M4), so the presentation lives
     here. Result/confirmation sections below the form keep their
     current presentation (post-booking states with no design
     counterpart; copy and hooks unchanged). */
  #shell [data-testid="book-view"] .book-title {
    font-size: 22px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="book-booking"] {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  #shell [data-testid="book-booking"] .book-section-title {
    font-size: 18px;
    margin: 0;
    color: #1B2B2A;
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

  #shell .book-layout .p-card-title h2,
  #shell [data-testid="book-stay-card"] .p-card-title h2 {
    font-size: 18px;
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
     get-price (`docs/design/Book.dc.html:3-:5`). */
  #shell [data-testid="book-view"] .book-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Stay check-in/out screen (Refs #521; restyle spec section 5.3,
     AC-RST-4): pixel-faithful to `docs/design/Stay.dc.html:2-:7` —
     h1 `22px`; five stacked cards (`gap:16px`; card
     `background:#fff;border:1px solid #D9E0DE;border-radius:12px;
     padding:18px`, flex column `gap:10px`, h2 `margin:0;
     font-size:18px`); the lists card (`Stay.dc.html:3`) carries
     the `14px` business-date label, h3 `margin:0;font-size:16px`,
     and `14px` rows with no dividers (Stay uses the card border
     only, restyle spec section 3); the form cards
     (`Stay.dc.html:4-:7`) carry `14px` labels, full-width `44px`
     controls with `margin-top:6px`, muted `14px` hints, and
     primary action buttons (`min-height:44px;padding:0 18px;
     border-radius:8px;border:0;background:#0F766E;color:#fff;
     font-weight:600`); the checkout card carries the
     reconciliation hint (`font-size:14px;color:#4B5D5B`).
     PrimeVue stays as logic carrier only: Card/DataTable/Button/
     InputText defaults are overridden here wherever they diverge
     from the design (restyle spec section 2). Token values live
     in `src/theme/tokens.ts`
     (`colors.primary/muted/cardBorder`); this rule duplicates
     them because CSS cannot import the TS constants. Views carry
     no style blocks (M4), so the presentation lives here. The
     review/approval/dialog flow-state blocks keep their current
     presentation (post-review states with no design counterpart;
     copy and hooks unchanged). */
  #shell [data-testid="stay-view"] .stay-title {
    font-size: 22px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] .stay-intro {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  #shell [data-testid="stay-main"] {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  #shell [data-testid="stay-lists-card"].p-card,
  #shell [data-testid="stay-checkin-card"].p-card,
  #shell [data-testid="stay-move-card"].p-card,
  #shell [data-testid="stay-times-card"].p-card,
  #shell [data-testid="stay-checkout-card"].p-card {
    border: 1px solid #D9E0DE;
    border-radius: 12px;
    background: #FFFFFF;
    box-shadow: none;
    margin: 0;
  }

  #shell [data-testid="stay-lists-card"] .p-card-body,
  #shell [data-testid="stay-checkin-card"] .p-card-body,
  #shell [data-testid="stay-move-card"] .p-card-body,
  #shell [data-testid="stay-times-card"] .p-card-body,
  #shell [data-testid="stay-checkout-card"] .p-card-body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #shell [data-testid="stay-lists-card"] .p-card-caption,
  #shell [data-testid="stay-lists-card"] .p-card-content,
  #shell [data-testid="stay-checkin-card"] .p-card-caption,
  #shell [data-testid="stay-checkin-card"] .p-card-content,
  #shell [data-testid="stay-move-card"] .p-card-caption,
  #shell [data-testid="stay-move-card"] .p-card-content,
  #shell [data-testid="stay-times-card"] .p-card-caption,
  #shell [data-testid="stay-times-card"] .p-card-content,
  #shell [data-testid="stay-checkout-card"] .p-card-caption,
  #shell [data-testid="stay-checkout-card"] .p-card-content {
    padding: 0;
  }

  #shell [data-testid="stay-lists-card"] .p-card-title h2,
  #shell [data-testid="stay-checkin-card"] .p-card-title h2,
  #shell [data-testid="stay-move-card"] .p-card-title h2,
  #shell [data-testid="stay-times-card"] .p-card-title h2,
  #shell [data-testid="stay-checkout-card"] .p-card-title h2 {
    font-size: 18px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-lists-card"] h3 {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] .stay-business-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0;
  }

  #shell [data-testid="stay-view"] .stay-business-label {
    font-size: 14px;
    color: #1B2B2A;
  }

  /* Stay list rows render the design `14px` rows
     (`docs/design/Stay.dc.html:3`): no dividers — Stay uses the
     card border only (restyle spec section 3). The header row
     carries no design counterpart (the board shows rows only),
     so it renders quiet `14px` muted labels while the decided
     header sequences stay exact (design-facts gate). */
  #shell [data-testid="stay-lists-card"] .p-datatable .p-datatable-table {
    width: 100%;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-lists-card"] .p-datatable th {
    font-size: 14px;
    font-weight: 400;
    color: #4B5D5B;
    text-align: left;
    padding: 10px 0;
    border: 0;
    background: transparent;
  }

  #shell [data-testid="stay-lists-card"] .p-datatable td {
    font-size: 14px;
    text-align: left;
    padding: 10px 0;
    border: 0;
    background: transparent;
  }

  #shell [data-testid="stay-lists-card"] .p-datatable tbody tr {
    background: transparent;
  }

  #shell [data-testid="stay-lists-card"] .p-datatable .p-datatable-emptymessage td {
    padding: 18px 0;
    color: #4B5D5B;
    font-size: 14px;
  }

  #shell [data-testid="stay-view"] label {
    display: block;
    font-size: 14px;
    color: #1B2B2A;
  }

  #shell [data-testid="stay-view"] label input,
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

  /* Design action buttons: refresh, per-row picks, check-in,
     move, record-times, review, approval, check-out, and the
     dialog confirm (`docs/design/Stay.dc.html:3-:7`). The dialog
     cancel keeps its secondary logic-carrier styling. */
  #shell [data-testid="stay-view"] .stay-action.p-button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 8px;
    border: 0;
    background: #0F766E;
    color: #FFFFFF;
    font-weight: 600;
  }

  /* Folio invoice screen (Refs #522; restyle spec section 5.4,
     AC-RST-5): pixel-faithful to `docs/design/Folio.dc.html:2` —
     h1 `22px` with a muted `14px` intro (the board carries no h1
     of its own, so the app keeps its screen title and intro for
     context at the shared sibling treatment); `folio-main`
     stacks the open card above the design grid in one column
     (`gap:16px`); the grid is exactly `1fr 1fr` with `gap:16px`
     (charges card left, payments card right); every folio card
     renders `background:#fff;border:1px solid #D9E0DE;
     border-radius:12px;padding:18px` as a flex column with
     `gap:10px`, card titles (kept as h2 elements) and the
     charge-form h3 at `margin:0;font-size:16px`; the lines table
     renders `15px` rows with `padding:10px 0` and `1px solid
     #EEF1F0` top dividers (the header row carries no design
     counterpart, so it renders quiet `14px` muted labels while
     the decided header sequences stay exact); labels are `14px`
     with full-width controls (`min-height:44px;
     margin-top:6px`); the balance-due figure renders `30px/700`
     in the balance-due accent; the open, post-charge, and
     record-payment buttons take the primary action treatment
     (`min-height:44px;padding:0 18px;border-radius:8px;border:0;
     background:#0F766E;color:#fff;font-weight:600`).
     PrimeVue stays as logic carrier only: Card/DataTable/Button/
     InputText defaults are overridden here wherever they diverge
     from the design (restyle spec section 2). Token values live
     in `src/theme/tokens.ts` (`colors.primary/muted/cardBorder/
     rowDivider/balanceDue`); this rule duplicates them because
     CSS cannot import the TS constants. Views carry no style
     blocks (M4), so the presentation lives here. The open form
     (stay-ID entry, the F3 REPORTED item #498) and the folio/
     invoice print output are unchanged — behaviour, flow, copy,
     and hooks hold exactly as today. */
  #shell [data-testid="folio-view"] .folio-title {
    font-size: 22px;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="folio-view"] .folio-intro {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

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

  /* Card titles keep their h2 elements (heading hooks and the
     design-facts gate stay exact) and render the design h3
     `16px` values (`docs/design/Folio.dc.html:2`). */
  #shell [data-testid="folio-open-card"] .p-card-title h2,
  #shell [data-testid="folio-charges-card"] .p-card-title h2,
  #shell [data-testid="folio-payments-card"] .p-card-title h2,
  #shell [data-testid="folio-view"] .folio-section-title {
    font-size: 16px;
    margin: 0;
    color: #1B2B2A;
  }

  /* Folio lines render the design `15px` example-line rows
     (`docs/design/Folio.dc.html:2`): `padding:10px 0` with
     `1px solid #EEF1F0` top dividers. The header row carries no
     design counterpart (the board shows rows only), so it
     renders quiet `14px` muted labels while the decided header
     sequences stay exact (design-facts gate). */
  #shell [data-testid="folio-charges-card"] .p-datatable .p-datatable-table {
    width: 100%;
    font-size: 15px;
    color: #1B2B2A;
  }

  #shell [data-testid="folio-charges-card"] .p-datatable th {
    font-size: 14px;
    font-weight: 400;
    color: #4B5D5B;
    text-align: left;
    padding: 10px 0;
    border: 0;
    background: transparent;
  }

  #shell [data-testid="folio-charges-card"] .p-datatable td {
    font-size: 15px;
    text-align: left;
    padding: 10px 0;
    border: 0;
    border-top: 1px solid #EEF1F0;
    background: transparent;
  }

  #shell [data-testid="folio-charges-card"] .p-datatable tbody tr {
    background: transparent;
  }

  #shell [data-testid="folio-charges-card"] .p-datatable .p-datatable-emptymessage td {
    padding: 18px 0;
    border-top: 0;
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

  /* Balance due (`docs/design/Folio.dc.html:2`: the muted
     `Còn phải trả` label above `font-size:30px;font-weight:700;
     color:#8A4B08`). The app keeps its single combined status
     line (copy and catalogue keys unchanged) and renders the
     design size and accent on it; the accent resolves through
     the shared `balanceDue` token, never a per-surface fork. */
  #shell .folio-balance-due {
    font-size: 30px;
    font-weight: 700;
    color: #8A4B08;
    margin: 0;
  }

  /* Design action buttons: open folio, post charge, and record
     payment (`docs/design/Folio.dc.html:2`:
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

  /* Rooms map screen (Refs #523; restyle spec section 5.5,
     AC-RST-6): pixel-faithful to `docs/design/Rooms.dc.html:2` —
     the title row is a flex row with `justify-content:space-between`
     carrying the `26px/700` h1 with the muted `14px` intro left and
     the business-date readout with the primary reload button
     right (the app keeps its intro and the weekday-long
     business-date readout, AC-DSK-12 #513, at the muted `14px`
     treatment — the board summary line carries counts plus a date
     with no app counterpart); section h2 elements render
     `margin:0 0 8px;font-size:18px`; the status-chip row is a
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
    gap: 4px;
    min-width: 0;
  }

  #shell [data-testid="rooms-view"] .rooms-title {
    font-size: 26px;
    font-weight: 700;
    margin: 0;
    color: #1B2B2A;
  }

  #shell [data-testid="rooms-view"] .rooms-intro {
    font-size: 14px;
    color: #4B5D5B;
    margin: 0;
  }

  #shell [data-testid="rooms-view"] .rooms-business-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    color: #4B5D5B;
    white-space: nowrap;
  }

  #shell [data-testid="rooms-view"] .rooms-business-row strong {
    color: #1B2B2A;
    font-weight: 600;
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

  #shell [data-testid="rooms-view"] .room-card-action {
    margin: 4px 0 0;
  }

  #shell [data-testid="rooms-view"] .room-card-action .rooms-action.p-button {
    width: 100%;
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
