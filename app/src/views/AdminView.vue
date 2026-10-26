<template>
  <main data-testid="admin-view">
    <h1>{{ t('desk.admin.title', {}, 'Admin: staff, hotel setup, and audit') }}</h1>
    <p>{{ t('desk.admin.intro', {}, 'Manage staff accounts and roles, review the hotel setup, and read the audit log.') }}</p>
    <noscript><p>This page needs JavaScript to manage users, roles, and config.</p></noscript>

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
      <h2>{{ t('desk.admin.users_heading', {}, 'Users and roles') }}</h2>
      <Message
        v-if="usersError"
        severity="error"
        role="alert"
        data-testid="admin-users-error"
      >
        {{ usersError }}
      </Message>
      <table
        id="admin-users-table"
        data-testid="admin-users-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.admin.th_name', {}, 'Name') }}</th>
            <th>{{ t('desk.admin.th_identity', {}, 'Sign-in identity') }}</th>
            <th>{{ t('desk.admin.th_role', {}, 'Role') }}</th>
            <th>{{ t('desk.admin.th_locked', {}, 'Locked') }}</th>
            <th>{{ t('desk.admin.th_actions', {}, 'Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.signinIdentity"
            data-testid="admin-user-row"
          >
            <td>{{ user.displayName }}</td>
            <td>{{ user.signinIdentity }}</td>
            <td>
              <select
                v-model="user.draftRole"
                :data-testid="`admin-role-select-${user.signinIdentity}`"
              >
                <option
                  v-for="candidate in roleOptions"
                  :key="candidate"
                  :value="candidate"
                >
                  {{ candidate }}
                </option>
              </select>
            </td>
            <td>{{ user.locked ? t('desk.admin.yes', {}, 'yes') : t('desk.admin.no', {}, 'no') }}</td>
            <td>
              <Button
                type="button"
                :label="t('desk.admin.save_role', {}, 'Save role')"
                :data-testid="`admin-role-save-${user.signinIdentity}`"
                @click="onSaveRole(user.signinIdentity)"
              />
              <Button
                v-if="user.locked"
                type="button"
                :label="t('desk.admin.unlock', {}, 'Unlock')"
                :data-testid="`admin-unlock-${user.signinIdentity}`"
                @click="onUnlock(user.signinIdentity)"
              />
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="5">
              {{ t('desk.admin.empty_users', {}, 'No staff accounts yet.') }}
            </td>
          </tr>
        </tbody>
      </table>

      <h3>{{ t('desk.admin.create_heading', {}, 'Create account') }}</h3>
      <form
        data-testid="admin-create-form"
        @submit.prevent="onCreate"
      >
        <label for="admin-create-name">
          {{ t('desk.admin.name_label', {}, 'Name: ') }}
          <InputText
            id="admin-create-name"
            v-model="createName"
            name="create-name"
            data-testid="admin-create-name"
          />
        </label>
        <label for="admin-create-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <InputText
            id="admin-create-identity"
            v-model="createIdentity"
            name="create-identity"
            data-testid="admin-create-identity"
          />
        </label>
        <label for="admin-create-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <Password
            v-model="createSecret"
            :feedback="false"
            input-id="admin-create-secret"
            data-testid="admin-create-secret"
          />
        </label>
        <label for="admin-create-role">
          {{ t('desk.admin.role_label', {}, 'Role: ') }}
          <select
            id="admin-create-role"
            v-model="createRole"
            name="create-role"
            data-testid="admin-create-role"
          >
            <option
              v-for="candidate in roleOptions"
              :key="candidate"
              :value="candidate"
            >
              {{ candidate }}
            </option>
          </select>
        </label>
        <Button
          type="submit"
          :label="t('desk.admin.create_button', {}, 'Create')"
          data-testid="admin-create-submit"
        />
      </form>

      <h2>{{ t('desk.admin.config_heading', {}, 'Hotel configuration') }}</h2>
      <p>{{ t('desk.admin.config_note', {}, 'Read-only: the current per-hotel config set.') }}</p>
      <Message
        v-if="configError"
        severity="error"
        role="alert"
        data-testid="admin-config-error"
      >
        {{ configError }}
      </Message>
      <div v-else>
        <p data-testid="admin-config-version">
          {{ t('desk.admin.config_version', { schemaVersion: configSchemaVersion }, `Config schema version ${configSchemaVersion}.`) }}
        </p>
        <dl data-testid="admin-config-list">
          <template
            v-for="entry in configEntries"
            :key="entry.key"
          >
            <dt>{{ entry.key }}</dt>
            <dd>{{ entry.text }}</dd>
          </template>
        </dl>
        <p v-if="configEntries.length === 0">
          {{ t('desk.admin.empty_config', {}, 'No hotel settings to show.') }}
        </p>
      </div>

      <h2>{{ t('desk.admin.audit_heading', {}, 'Audit view') }}</h2>
      <p>{{ t('desk.admin.audit_note', {}, 'Read-only: account creations and updates, config writes, and backup reports, newest first.') }}</p>
      <p>
        <Button
          id="admin-audit-refresh"
          type="button"
          :label="t('desk.admin.refresh', {}, 'Refresh')"
          data-testid="admin-audit-refresh"
          @click="onAuditRefresh"
        />
      </p>
      <Message
        v-if="auditError"
        severity="error"
        role="alert"
        data-testid="admin-audit-error"
      >
        {{ auditError }}
      </Message>
      <table
        id="admin-audit-table"
        data-testid="admin-audit-table"
      >
        <thead>
          <tr>
            <th>{{ t('desk.admin.th_time', {}, 'Time') }}</th>
            <th>{{ t('desk.admin.th_actor', {}, 'Actor') }}</th>
            <th>{{ t('desk.admin.th_action', {}, 'Action') }}</th>
            <th>{{ t('desk.admin.th_entity', {}, 'Entity') }}</th>
            <th>{{ t('desk.admin.th_detail', {}, 'Detail') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in auditEntries"
            :key="`${entry.at}-${entry.actor}-${entry.action}-${entry.entity}`"
            data-testid="admin-audit-row"
          >
            <td>{{ entry.at }}</td>
            <td>{{ entry.actor }}</td>
            <td>{{ entry.action }}</td>
            <td>{{ entry.entity }}</td>
            <td>{{ entry.detail ?? '' }}</td>
          </tr>
          <tr v-if="auditEntries.length === 0">
            <td colspan="5">
              {{ t('desk.admin.empty_audit', {}, 'No audit entries yet. Account and config activity appears here.') }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import Button from 'primevue/button';
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
// Shared-migration contracts, same as the desk, book, stay, folio,
// and print migrations:
// - Bearer auth comes only from the Pinia session store via the
//   shared `apiFetch` client; a 401/UNAUTHENTICATED clears the
//   store and returns to sign-in (the single 401 path).
// - Every string goes through the catalogue `t()` wrapper with the
//   same fallbacks as `DeskMessages.msg` in the legacy page,
//   including the Save role / Unlock labels (Refs #275).
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

const ROLE_OPTIONS: AdminRole[] = ['owner', 'manager', 'front-desk'];

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
  components: { Button, InputText, Message, Password },
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
      roleOptions: ROLE_OPTIONS,
      users,
      usersError,
      createName,
      createIdentity,
      createSecret,
      createRole,
      configSchemaVersion,
      configEntries,
      configError,
      auditEntries,
      auditError,
      onCreate,
      onSaveRole,
      onUnlock,
      onAuditRefresh,
    };
  },
});
</script>
