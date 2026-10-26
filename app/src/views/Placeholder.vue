<template>
  <main data-testid="app-placeholder">
    <h1>Desk migration shell — placeholder</h1>
    <p>
      The Vue 3 desk shell is served under <code>/app/</code>. Screen
      routes land in follow-up issues; this slice renders only this
      placeholder (Refs #291).
    </p>

    <section
      v-if="!session.isSignedIn"
      data-testid="signin-panel"
    >
      <h2>Sign in</h2>
      <p>Enter a session token to attach it to the shared API client.</p>
      <form @submit.prevent="onSignIn">
        <label for="signin-token">Session token</label>
        <input
          id="signin-token"
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          data-testid="signin-token"
        >
        <button
          type="submit"
          data-testid="signin-submit"
        >
          Sign in
        </button>
      </form>
      <p
        v-if="signInError"
        data-testid="signin-error"
      >
        {{ signInError }}
      </p>
    </section>

    <section
      v-else
      data-testid="session-panel"
    >
      <h2>Session</h2>
      <p data-testid="session-state">
        Signed in. API calls carry the shared Bearer token.
      </p>
      <button
        type="button"
        data-testid="check-connection"
        @click="onCheckConnection"
      >
        Check connection
      </button>
      <button
        type="button"
        data-testid="signout"
        @click="onSignOut"
      >
        Sign out
      </button>
      <p
        v-if="connectionResult"
        data-testid="connection-result"
      >
        {{ connectionResult }}
      </p>
    </section>
  </main>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { useSessionStore } from '../stores/session';
import { apiFetch } from '../api/client';

export default defineComponent({
  name: 'PlaceholderView',
  setup() {
    const session = useSessionStore();
    const tokenInput = ref('');
    const signInError = ref('');
    const connectionResult = ref('');

    function onSignIn(): void {
      const token = tokenInput.value.trim();
      if (token === '') {
        signInError.value = 'Enter a session token.';
        return;
      }
      signInError.value = '';
      session.signIn(token);
      tokenInput.value = '';
    }

    function onSignOut(): void {
      session.signOut();
      connectionResult.value = '';
    }

    async function onCheckConnection(): Promise<void> {
      connectionResult.value = 'Checking…';
      try {
        await apiFetch<unknown>('/v1/admin/healthz', { method: 'GET' });
        connectionResult.value = 'API reachable through the shared client.';
      } catch (err) {
        connectionResult.value =
          err instanceof Error ? err.message : 'Connection check failed.';
      }
    }

    return {
      session,
      tokenInput,
      signInError,
      connectionResult,
      onSignIn,
      onSignOut,
      onCheckConnection,
    };
  },
});
</script>
