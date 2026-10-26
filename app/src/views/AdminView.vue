<template>
  <main data-testid="admin-view">
    <h1>{{ t('desk.admin.title', {}, 'Hotel Management — Admin Console') }}</h1>
    <p>
      <a
        href="/app/"
        data-testid="admin-back"
      >{{ t('desk.admin.back', {}, 'Back to the desk entry') }}</a>
    </p>
    <noscript><p>This page needs JavaScript to sign in and manage users, roles, and config.</p></noscript>

    <section
      v-if="!session.isSignedIn"
      data-testid="admin-signin"
    >
      <h2>{{ t('desk.admin.sign_in', {}, 'Sign in') }}</h2>
      <form
        data-testid="admin-signin-form"
        @submit.prevent="onSignIn"
      >
        <label for="admin-signin-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="admin-signin-identity"
            v-model="identity"
            name="signin-identity"
            autocomplete="username"
            data-testid="admin-signin-identity"
          >
        </label>
        <label for="admin-signin-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="admin-signin-secret"
            v-model="secret"
            name="signin-secret"
            type="password"
            autocomplete="current-password"
            data-testid="admin-signin-secret"
          >
        </label>
        <button
          type="submit"
          data-testid="admin-signin-submit"
        >
          {{ t('desk.admin.sign_in', {}, 'Sign in') }}
        </button>
      </form>
      <p
        v-if="signInError"
        role="alert"
        data-testid="admin-signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="admin-console"
    >
      <p>
        <span>{{ t('desk.admin.signed_in_as', {}, 'Signed in as ') }}</span><strong data-testid="admin-whoami">{{ displayName }}</strong>
        (<span data-testid="admin-myrole">{{ role }}</span>).
        <button
          id="admin-signout-button"
          type="button"
          data-testid="admin-signout"
          @click="onSignOut"
        >
          {{ t('desk.admin.signout', {}, 'Sign out') }}
        </button>
      </p>

      <h2>{{ t('desk.admin.users_heading', {}, 'Users and roles') }}</h2>
      <p
        v-if="usersError"
        role="alert"
        data-testid="admin-users-error"
      >
        {{ usersError }}
      </p>
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
              <button
                type="button"
                :data-testid="`admin-role-save-${user.signinIdentity}`"
                @click="onSaveRole(user.signinIdentity)"
              >
                {{ t('desk.admin.save_role', {}, 'Save role') }}
              </button>
              <button
                v-if="user.locked"
                type="button"
                :data-testid="`admin-unlock-${user.signinIdentity}`"
                @click="onUnlock(user.signinIdentity)"
              >
                {{ t('desk.admin.unlock', {}, 'Unlock') }}
              </button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="5">
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
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
          <input
            id="admin-create-name"
            v-model="createName"
            name="create-name"
            data-testid="admin-create-name"
          >
        </label>
        <label for="admin-create-identity">
          {{ t('desk.admin.signin_identity', {}, 'Sign-in identity: ') }}
          <input
            id="admin-create-identity"
            v-model="createIdentity"
            name="create-identity"
            data-testid="admin-create-identity"
          >
        </label>
        <label for="admin-create-secret">
          {{ t('desk.admin.secret', {}, 'Secret: ') }}
          <input
            id="admin-create-secret"
            v-model="createSecret"
            name="create-secret"
            type="password"
            data-testid="admin-create-secret"
          >
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
        <button
          type="submit"
          data-testid="admin-create-submit"
        >
          {{ t('desk.admin.create_button', {}, 'Create') }}
        </button>
      </form>

      <h2>{{ t('desk.admin.config_heading', {}, 'Hotel configuration') }}</h2>
      <p>{{ t('desk.admin.config_note', {}, 'Read-only: the current per-hotel config set.') }}</p>
      <p
        v-if="configError"
        role="alert"
        data-testid="admin-config-error"
      >
        {{ configError }}
      </p>
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
          {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
        </p>
      </div>

      <h2>{{ t('desk.admin.audit_heading', {}, 'Audit view') }}</h2>
      <p>{{ t('desk.admin.audit_note', {}, 'Read-only: account creations and updates, config writes, and backup reports, newest first.') }}</p>
      <p>
        <button
          id="admin-audit-refresh"
          type="button"
          data-testid="admin-audit-refresh"
          @click="onAuditRefresh"
        >
          {{ t('desk.admin.refresh', {}, 'Refresh') }}
        </button>
      </p>
      <p
        v-if="auditError"
        role="alert"
        data-testid="admin-audit-error"
      >
        {{ auditError }}
      </p>
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
              {{ t('desk.admin.no_entries', {}, 'No entries yet.') }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
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
//   FORBIDDEN to front-desk callers): this view surfaces the code,
//   it never gates client-side.
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
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
  setup() {
    const session = useSessionStore();
    const identity = ref('');
    const secret = ref('');
    const signInError = ref('');
    const displayName = ref('');
    const role = ref('');
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

    function signOutLocal(): void {
      session.signOut();
      secret.value = '';
      displayName.value = '';
      role.value = '';
    }

    function noteSignedOut(): void {
      signOutLocal();
      signInError.value = t(
        'desk.today.session_expired',
        {},
        'Session expired. Sign in again.',
      );
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
        // The shared client already cleared the session and routed
        // to sign-in on 401: mirror the desk SFC by surfacing the
        // session-expired catalogue string there.
        if (isSignedOut(err) || !session.isSignedIn) {
          noteSignedOut();
          return;
        }
        usersError.value = errorMessage(err);
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
          noteSignedOut();
          return;
        }
        configError.value = errorMessage(err);
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
          noteSignedOut();
          return;
        }
        auditError.value = errorMessage(err);
      }
    }

    async function refreshAll(): Promise<void> {
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

    async function onSignIn(): Promise<void> {
      signInError.value = '';
      try {
        const payload = await apiFetch<{ token: string; displayName: string; role: string }>(
          '/v1/admin/SignIn',
          {
            method: 'POST',
            body: JSON.stringify({ signinIdentity: identity.value, secret: secret.value }),
          },
        );
        session.signIn(payload.token);
        displayName.value = payload.displayName;
        role.value = payload.role;
        await refreshAll();
      } catch (err) {
        // Sign-in holds no session yet, so only a signed-out (401)
        // failure routes to the session-expired notice — validation
        // and other failures surface their real message (Refs #312).
        if (isSignedOut(err)) {
          noteSignedOut();
          return;
        }
        signInError.value = errorMessage(err);
      }
    }

    async function onCreate(): Promise<void> {
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
          noteSignedOut();
          return;
        }
        usersError.value = errorMessage(err);
      }
    }

    async function onSaveRole(signinIdentity: string): Promise<void> {
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
          noteSignedOut();
          return;
        }
        usersError.value = errorMessage(err);
      }
    }

    async function onUnlock(signinIdentity: string): Promise<void> {
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
          noteSignedOut();
          return;
        }
        usersError.value = errorMessage(err);
      }
    }

    async function onAuditRefresh(): Promise<void> {
      await refreshAudit();
    }

    async function onSignOut(): Promise<void> {
      try {
        await apiFetch<unknown>('/v1/admin/SignOut', { method: 'POST', body: '{}' });
      } catch {
        // A dead token signs out locally all the same (legacy parity).
      }
      signOutLocal();
    }

    onMounted(() => {
      // A reload restores the Bearer token from sessionStorage: go
      // straight back to the console instead of stranding it.
      if (session.isSignedIn) {
        void refreshAll();
      }
    });

    return {
      t,
      session,
      roleOptions: ROLE_OPTIONS,
      identity,
      secret,
      signInError,
      displayName,
      role,
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
      onSignIn,
      onCreate,
      onSaveRole,
      onUnlock,
      onAuditRefresh,
      onSignOut,
    };
  },
});
</script>
