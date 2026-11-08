<template>
  <main data-testid="admin-view">
    <!-- Admin screen (Refs #546, epic #537; `docs/design/Admin.dc.html`):
      the v2 board carries no screen title or intro — the shell
      header owns the hotel name plus the seven design tabs with
      the `Quản trị` pill active — so the view opens directly on
      the two design grids: users plus create-account above,
      hotel config plus audit log below. Hooks and copy otherwise
      unchanged. -->
    <noscript><p>{{ t('desk.entry.noscript_admin', {}, 'This page needs JavaScript to manage users, roles, and config.') }}</p></noscript>

    <Message
      v-if="!canManage"
      severity="info"
      data-testid="admin-restricted-notice"
    >
      {{ t('desk.admin.restricted_notice', {}, 'Staff accounts, hotel setup, and the audit log are managed by the owner or manager. Ask the manager if something needs changing.') }}
    </Message>
    <section
      v-if="canManage"
      data-testid="admin-console"
    >
      <!-- Design top grid (Refs #546,
        `docs/design/Admin.dc.html:3`): `1.2fr 1fr` with
        `gap:16px` — the users-and-roles card left, the
        create-account card right. -->
      <div
        class="admin-grid-top"
        data-testid="admin-grid-top"
      >
        <Card data-testid="admin-users-card">
          <template #title>
            <h3>{{ t('desk.admin.users_heading', {}, 'Users and roles') }}</h3>
          </template>
          <template #content>
            <Message
              v-if="usersError"
              severity="error"
              role="alert"
              data-testid="admin-users-error"
            >
              {{ usersError }}
            </Message>
            <!-- Board user rows (Refs #546,
              `docs/design/Admin.dc.html:3`): one
              `15px` space-between row per account —
              `<strong>name</strong> · role` plus the locked
              note for locked identities — with the role select
              and the single row action. Locked rows carry only
              the secondary Unlock action (the board draws no
              Save for the locked row); unlocked rows carry
              Save. The selects stay native and offer every
              system role: `UpdateUserRole` requires a target
              role the board illustration cannot drive (same
              flow-state precedent as the Folio kind/method
              selects, Refs #545). -->
            <div
              data-testid="admin-user-rows"
              class="admin-rows"
            >
              <div
                v-for="user in users"
                :key="user.signinIdentity"
                data-testid="admin-user-row"
                class="admin-row"
              >
                <span><strong>{{ user.displayName }}</strong> · {{ roleLabel(user.role) }}<span v-if="user.locked"> · <span class="admin-locked">{{ t('desk.admin.locked_note', {}, 'currently locked') }}</span></span></span>
                <!-- Board selects are bare (Refs #546): no visible
                  label line, so the select carries the catalogue
                  users-heading string as its accessible name
                  instead (same precedent as the Onboarding
                  hotel-name input, Refs #542) — the design-facts
                  extractor falls back to the preceding card
                  heading for these selects, and the app resolves
                  the same string here. -->
                <select
                  v-model="user.draftRole"
                  :aria-label="t('desk.admin.users_heading', {}, 'Users and roles')"
                  :data-testid="`admin-role-select-${user.signinIdentity}`"
                >
                  <option
                    v-for="candidate in roleOptions"
                    :key="candidate.value"
                    :value="candidate.value"
                  >
                    {{ candidate.label }}
                  </option>
                </select>
                <Button
                  v-if="!user.locked"
                  type="button"
                  class="admin-action"
                  :label="t('desk.admin.save_role', {}, 'Save')"
                  :data-testid="`admin-role-save-${user.signinIdentity}`"
                  @click="onSaveRole(user.signinIdentity)"
                />
                <Button
                  v-else
                  type="button"
                  class="admin-action-secondary"
                  :label="t('desk.admin.unlock', {}, 'Unlock')"
                  :data-testid="`admin-unlock-${user.signinIdentity}`"
                  @click="onUnlock(user.signinIdentity)"
                />
              </div>
              <p
                v-if="users.length === 0"
                class="admin-empty"
              >
                {{ t('desk.admin.empty_users', {}, 'No staff accounts yet.') }}
              </p>
            </div>
          </template>
        </Card>

        <Card data-testid="admin-create-card">
          <template #title>
            <h3>{{ t('desk.admin.create_heading', {}, 'Create a new account') }}</h3>
          </template>
          <template #content>
            <!-- Board create form (Refs #546,
              `docs/design/Admin.dc.html:3`): the `1fr 1fr`
              label grid (name, sign-in identity, initial
              secret, role) with full-width `44px` controls
              plus the full-width primary create action. -->
            <form
              data-testid="admin-create-form"
              class="admin-create-form"
              @submit.prevent="onCreate"
            >
              <div class="admin-form-grid">
                <label for="admin-create-name">
                  {{ t('desk.admin.name_label', {}, 'Name') }}
                  <InputText
                    id="admin-create-name"
                    v-model="createName"
                    name="create-name"
                    data-testid="admin-create-name"
                  />
                </label>
                <label for="admin-create-identity">
                  {{ t('desk.admin.create_identity_label', {}, 'Username') }}
                  <InputText
                    id="admin-create-identity"
                    v-model="createIdentity"
                    name="create-identity"
                    data-testid="admin-create-identity"
                  />
                </label>
                <div>
                  <!-- The secret control sits outside its visible
                    label (associated via for/id): the PrimeVue
                    Password live region carries its own
                    screen-reader prompt text, which would pollute
                    the wrapping-label text the design-facts gate
                    collects — so the input carries the catalogue
                    secret string as its accessible name instead
                    (same precedent as the Onboarding hotel-name
                    input, Refs #542). -->
                  <label for="admin-create-secret">
                    {{ t('desk.admin.create_secret_label', {}, 'Initial password') }}
                  </label>
                  <Password
                    v-model="createSecret"
                    :feedback="false"
                    :aria-label="t('desk.admin.create_secret_label', {}, 'Initial password')"
                    input-id="admin-create-secret"
                    data-testid="admin-create-secret"
                  />
                </div>
                <label for="admin-create-role">
                  {{ t('desk.admin.role_label', {}, 'Role') }}
                  <select
                    id="admin-create-role"
                    v-model="createRole"
                    name="create-role"
                    data-testid="admin-create-role"
                  >
                    <option
                      v-for="candidate in roleOptions"
                      :key="candidate.value"
                      :value="candidate.value"
                    >
                      {{ candidate.label }}
                    </option>
                  </select>
                </label>
              </div>
              <Button
                type="submit"
                class="admin-action"
                :label="t('desk.admin.create_button', {}, 'Create account')"
                data-testid="admin-create-submit"
              />
            </form>
          </template>
        </Card>
      </div>

      <!-- Design bottom grid (Refs #546,
        `docs/design/Admin.dc.html:3`): `1fr 1fr` with
        `gap:16px` — the hotel-config card left, the audit-log
        card right. -->
      <div
        class="admin-grid-bottom"
        data-testid="admin-grid-bottom"
      >
        <Card data-testid="admin-config-card">
          <template #title>
            <h3>{{ t('desk.admin.config_heading', {}, 'Hotel configuration') }}</h3>
          </template>
          <template #content>
            <Message
              v-if="configError"
              severity="error"
              role="alert"
              data-testid="admin-config-error"
            >
              {{ configError }}
            </Message>
            <!-- Board config rows (Refs #546,
              `docs/design/Admin.dc.html:3`): the version row
              first, then the check-in/check-out rows, then
              every remaining live entry — one `15px`
              space-between label-plus-value row each. The
              board's three example rows are illustration only;
              the live config set renders in the board shape. -->
            <div
              v-else
              data-testid="admin-config-list"
              class="admin-rows"
            >
              <div
                data-testid="admin-config-version"
                class="admin-row"
              >
                <span>{{ t('desk.admin.config_version_label', {}, 'Config version') }}</span><strong>{{ configSchemaVersion }}</strong>
              </div>
              <div
                v-if="checkinEntry !== null"
                class="admin-row"
              >
                <span>{{ t('desk.admin.config_checkin_label', {}, 'Check-in time') }}</span><strong>{{ checkinEntry.text }}</strong>
              </div>
              <div
                v-if="checkoutEntry !== null"
                class="admin-row"
              >
                <span>{{ t('desk.admin.config_checkout_label', {}, 'Check-out time') }}</span><strong>{{ checkoutEntry.text }}</strong>
              </div>
              <div
                v-for="entry in otherConfigEntries"
                :key="entry.key"
                class="admin-row"
              >
                <span>{{ entry.key }}</span><strong>{{ entry.text }}</strong>
              </div>
              <p
                v-if="configEntries.length === 0"
                class="admin-empty"
              >
                {{ t('desk.admin.empty_config', {}, 'No hotel settings to show.') }}
              </p>
            </div>
          </template>
        </Card>

        <Card data-testid="admin-audit-card">
          <template #title>
            <h3>{{ t('desk.admin.audit_heading', {}, 'Activity log') }}</h3>
          </template>
          <template #content>
            <Message
              v-if="auditError"
              severity="error"
              role="alert"
              data-testid="admin-audit-error"
            >
              {{ auditError }}
            </Message>
            <!-- Board audit rows (Refs #546,
              `docs/design/Admin.dc.html:3`): one `15px`
              space-between row per entry — the
              actor-plus-action summary left, the entry time
              right, newest first — plus the secondary refresh
              action below. -->
            <div
              data-testid="admin-audit-rows"
              class="admin-rows"
            >
              <div
                v-for="entry in auditEntries"
                :key="`${entry.at}-${entry.actor}-${entry.action}-${entry.entity}`"
                data-testid="admin-audit-row"
                class="admin-row"
              >
                <span>{{ auditSummary(entry) }}</span><span>{{ entry.at }}</span>
              </div>
              <p
                v-if="auditEntries.length === 0"
                class="admin-empty"
              >
                {{ t('desk.admin.empty_audit', {}, 'No audit entries yet. Account and config activity appears here.') }}
              </p>
            </div>
            <Button
              id="admin-audit-refresh"
              type="button"
              class="admin-action-secondary"
              :label="t('desk.admin.refresh', {}, 'Refresh')"
              data-testid="admin-audit-refresh"
              @click="onAuditRefresh"
            />
          </template>
        </Card>
      </div>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Password from 'primevue/password';
import { apiFetch } from '../api/client';
import type { ApiError } from '../api/client';
import { t } from '../i18n';
import { useSessionStore } from '../stores/session';

// Admin console as a Vue SFC (Refs #298, ADR-0003).
// Behavioural port of the inline script in `frontend/admin.html`
// (sign-in plus users/roles management and the read-only audit
// view), extended with the read-only hotel-config display the issue
// scope names (users, roles, config, sessions) over the existing
// `GetHotelConfig` contract op. The legacy page is untouched and
// stays served in parallel; this view runs under `/app/admin`.
// Mutating ops stay exactly the legacy set (SignIn/SignOut,
// CreateUser, UpdateUserRole, UnlockIdentity): no backend or
// contract change.
//
// v2 board rebuild (Refs #546, epic #537): pixel-faithful to the
// new `docs/design/Admin.dc.html` board — no screen title or intro
// (the shell header owns the board tabs); the four cards carry the
// board h3s (users and roles, create account, hotel config,
// activity log) with plain `15px` label-plus-value rows, the
// board-literal create-account inputs plus the primary create
// action, and the secondary unlock/refresh actions. Removed as zero
// extras vs the board: the screen title/intro, the config/audit
// notes, and both data tables (the locked column folds into the
// locked row note, the audit columns fold into one summary line).
// The role selects, the per-row save/unlock actions, the empty
// states, and the error/readout lines stay as flow state with no
// board counterpart (same precedent as the Folio kind/method
// selects, Refs #545).
//
// Shared-migration contracts, same as the desk, book, stay, folio,
// and print migrations:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string resolves via the message catalogue `t()` with the
//   same fallbacks as `DeskMessages.msg` in the legacy page,
//   including the Save / Unlock labels (Refs #275).
// - Errors switch on envelope codes, never on resolved wording.
// - Role rules stay server-side (ListUsers and friends answer
//   FORBIDDEN to front-desk callers): the view additionally hides
//   every management section from front-desk callers as a cosmetic
//   gate on top of that enforcement (Refs #340). Per BR-35 least
//   privilege the front-desk role has no need for the staff roster,
//   the audit log, or hotel setup, so front-desk sees only a
//   read-only notice and the view makes no admin calls at all —
//   hiding (rather than disabling) avoids both leaking staff
//   identities and suggesting access that does not exist. Owner
//   and manager see the full console, unchanged.
// - Rows render through Vue interpolation, never raw HTML: the
//   legacy string-built `esc()` path (Refs #276) cannot regress.

type AdminRole = 'owner' | 'manager' | 'front-desk';

interface AdminUser {
  userId: string;
  displayName: string;
  signinIdentity: string;
  role: AdminRole;
  locked: boolean;
  draftRole: AdminRole;
}

interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  entity: string;
  detail?: string;
}

interface ConfigEntry {
  key: string;
  text: string;
}

interface RoleOption {
  value: AdminRole;
  label: string;
}

// Live config keys with friendly board labels (Refs #546): the
// board draws its check-in/check-out rows from these entries; every
// other live entry renders under its raw key.
const CHECKIN_KEY = 'standardCheckinTime';
const CHECKOUT_KEY = 'standardCheckoutTime';

function isSignedOut(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ApiError).code === 'UNAUTHENTICATED'
  );
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

function formatConfigValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export default defineComponent({
  name: 'AdminView',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button/Dialog under these canonical names (Refs #338 component mapping).
  components: { Button, Card, InputText, Message, Password },
  setup() {
    const session = useSessionStore();
    const users = ref<AdminUser[]>([]);
    const usersError = ref('');
    const createName = ref('');
    const createIdentity = ref('');
    const createSecret = ref('');
    const createRole = ref<AdminRole>('front-desk');
    const configSchemaVersion = ref(0);
    const configEntries = ref<ConfigEntry[]>([]);
    const configError = ref('');
    const auditEntries = ref<AuditEntry[]>([]);
    const auditError = ref('');

    // Cosmetic role gate (Refs #340, BR-35 least privilege): only
    // owner and manager reach the management sections. Server
    // enforcement is untouched — this only decides what renders.
    const canManage = computed(() => session.role === 'owner' || session.role === 'manager');

    // Catalogue role labels for the row and create-form selects
    // plus the user-row role text (Refs #546): the board draws
    // illustrative role wording per row while `UpdateUserRole`
    // requires one of the three system roles, so every select
    // offers the full system set (same flow-state precedent as
    // the Folio kind/method selects, Refs #545).
    const roleOptions = computed<RoleOption[]>(() => [
      { value: 'owner', label: t('desk.admin.role_owner', {}, 'Owner') },
      { value: 'manager', label: t('desk.admin.role_manager', {}, 'Manager') },
      { value: 'front-desk', label: t('desk.admin.role_front_desk', {}, 'Front desk') },
    ]);

    function roleLabel(role: AdminRole): string {
      return roleOptions.value.find((candidate) => candidate.value === role)?.label ?? role;
    }

    // Board config rows (Refs #546): the version row first, then
    // the check-in/check-out rows, then every remaining live
    // entry under its raw key.
    const checkinEntry = computed<ConfigEntry | null>(
      () => configEntries.value.find((entry) => entry.key === CHECKIN_KEY) ?? null,
    );
    const checkoutEntry = computed<ConfigEntry | null>(
      () => configEntries.value.find((entry) => entry.key === CHECKOUT_KEY) ?? null,
    );
    const otherConfigEntries = computed<ConfigEntry[]>(() =>
      configEntries.value.filter((entry) => entry.key !== CHECKIN_KEY && entry.key !== CHECKOUT_KEY),
    );

    // Board audit rows (Refs #546): one actor-plus-action summary
    // per entry — the detail suffix stays when present — with the
    // entry time in its own column.
    function auditSummary(entry: AuditEntry): string {
      const action = `${entry.action} ${entry.entity}`.trim();
      const detail = entry.detail !== undefined && entry.detail !== '' ? ` ${entry.detail}` : '';
      return `${entry.actor} · ${action}${detail}`;
    }

    // The shell owns the one sign-in gate (Refs #338): a
    // 401/UNAUTHENTICATED expires the shared session and the gate
    // takes over with the session-expired notice.
    function expireToGate(): void {
      session.expireSession();
    }

    async function refreshUsers(): Promise<void> {
      try {
        const data = await apiFetch<{ users: Omit<AdminUser, 'draftRole'>[] }>(
          '/v1/admin/ListUsers',
          { method: 'POST', body: '{}' },
        );
        users.value = (data.users ?? []).map((user) => ({ ...user, draftRole: user.role }));
        usersError.value = '';
      } catch (err) {
        // The shared client already expired the session and routed
        // to the gate on 401: leave the session-expired notice for
        // the gate to show.
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        usersError.value = errorMessage();
      }
    }

    async function refreshConfig(): Promise<void> {
      try {
        const data = await apiFetch<{ schemaVersion: number; values: Record<string, unknown> }>(
          '/v1/admin/GetHotelConfig',
          { method: 'POST', body: '{}' },
        );
        configSchemaVersion.value = data.schemaVersion ?? 0;
        configEntries.value = Object.entries(data.values ?? {}).map(([key, value]) => ({
          key,
          text: formatConfigValue(value),
        }));
        configError.value = '';
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        configError.value = errorMessage();
      }
    }

    async function refreshAudit(): Promise<void> {
      try {
        const data = await apiFetch<{ entries: AuditEntry[] }>(
          '/v1/admin/QueryAuditLog',
          { method: 'POST', body: JSON.stringify({ limit: 50 }) },
        );
        auditEntries.value = data.entries ?? [];
        auditError.value = '';
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        auditError.value = errorMessage();
      }
    }

    async function refreshAll(): Promise<void> {
      // Front-desk callers never reach the console, so no admin
      // call is ever issued for them (Refs #340).
      if (!canManage.value) {
        return;
      }
      await refreshUsers();
      if (!session.isSignedIn) {
        return;
      }
      await refreshConfig();
      if (!session.isSignedIn) {
        return;
      }
      await refreshAudit();
    }

    async function onCreate(): Promise<void> {
      // Unreachable for front-desk (no management action renders),
      // guarded so a stray call can never issue a refused op.
      if (!canManage.value) {
        return;
      }
      try {
        await apiFetch<unknown>('/v1/admin/CreateUser', {
          method: 'POST',
          body: JSON.stringify({
            displayName: createName.value,
            signinIdentity: createIdentity.value,
            secret: createSecret.value,
            role: createRole.value,
          }),
        });
        createName.value = '';
        createIdentity.value = '';
        createSecret.value = '';
        createRole.value = 'front-desk';
        await refreshUsers();
        if (!session.isSignedIn) {
          return;
        }
        await refreshAudit();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        usersError.value = errorMessage();
      }
    }

    async function onSaveRole(signinIdentity: string): Promise<void> {
      if (!canManage.value) {
        return;
      }
      const user = users.value.find((candidate) => candidate.signinIdentity === signinIdentity);
      if (user === undefined) {
        return;
      }
      try {
        await apiFetch<unknown>('/v1/admin/UpdateUserRole', {
          method: 'POST',
          body: JSON.stringify({ signinIdentity, role: user.draftRole }),
        });
        await refreshUsers();
        if (!session.isSignedIn) {
          return;
        }
        await refreshAudit();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        usersError.value = errorMessage();
      }
    }

    async function onUnlock(signinIdentity: string): Promise<void> {
      if (!canManage.value) {
        return;
      }
      try {
        await apiFetch<unknown>('/v1/admin/UnlockIdentity', {
          method: 'POST',
          body: JSON.stringify({ signinIdentity }),
        });
        await refreshUsers();
        if (!session.isSignedIn) {
          return;
        }
        await refreshAudit();
      } catch (err) {
        if (isSignedOut(err) || !session.isSignedIn) {
          expireToGate();
          return;
        }
        usersError.value = errorMessage();
      }
    }

    async function onAuditRefresh(): Promise<void> {
      if (!canManage.value) {
        return;
      }
      await refreshAudit();
    }

    onMounted(() => {
      // A reload restores the Bearer token from sessionStorage: go
      // straight back to the console instead of stranding it.
      // Front-desk callers keep only the read-only notice, so no
      // admin call is issued for them (Refs #340).
      if (session.isSignedIn && canManage.value) {
        void refreshAll();
      }
    });

    return {
      t,
      session,
      canManage,
      roleOptions,
      roleLabel,
      users,
      usersError,
      createName,
      createIdentity,
      createSecret,
      createRole,
      configSchemaVersion,
      configEntries,
      checkinEntry,
      checkoutEntry,
      otherConfigEntries,
      configError,
      auditEntries,
      auditError,
      auditSummary,
      onCreate,
      onSaveRole,
      onUnlock,
      onAuditRefresh,
    };
  },
});
</script>
