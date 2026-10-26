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
    <RouterView />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import { RouterView } from 'vue-router';
import { connectivity, retryLastRequest } from './api/client';

export default defineComponent({
  name: 'ShellApp',
  components: { RouterView },
  setup() {
    const retryMessage = ref('');

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

    return { connectivity, retryMessage, onRetry };
  },
});
</script>
