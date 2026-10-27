<template>
  <div data-testid="reference-details">
    <Button
      type="button"
      severity="secondary"
      :label="open ? t('desk.details.toggle_hide', {}, 'Hide reference details') : t('desk.details.toggle_show', {}, 'Show reference details')"
      :data-testid="`${testidPrefix}-toggle`"
      @click="open = !open"
    />
    <dl
      v-if="open"
      :data-testid="`${testidPrefix}-body`"
    >
      <template
        v-for="item in items"
        :key="item.label"
      >
        <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
      </template>
    </dl>
    <p v-if="open">
      <Button
        type="button"
        severity="secondary"
        :label="t('desk.details.copy', {}, 'Copy references')"
        :data-testid="`${testidPrefix}-copy`"
        @click="onCopy"
      />
    </p>
    <p
      v-if="open && copyStatus"
      role="status"
      :data-testid="`${testidPrefix}-copy-status`"
    >
      {{ copyStatus }}
    </p>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type PropType } from 'vue';
import Button from 'primevue/button';
import { t } from '../i18n';

export interface ReferenceItem {
  label: string;
  value: string;
}

// Reference details (issue #372 with the owner amendment): raw
// record IDs stay hidden by default everywhere and surface only
// inside this explicit disclosure, opened when verification is
// needed. A plain button plus `v-if` (not a show/hide toggle)
// keeps the exact IDs out of the DOM entirely until staff open
// it, so default views never leak them into text, copy, or print.
export default defineComponent({
  name: 'ReferenceDetails',
  // eslint-disable-next-line vue/no-reserved-component-names -- PrimeVue registers Button under its canonical name (Refs #338 component mapping).
  components: { Button },
  props: {
    items: {
      type: Array as PropType<ReferenceItem[]>,
      required: true,
    },
    testidPrefix: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const open = ref(false);
    const copyStatus = ref('');

    async function onCopy(): Promise<void> {
      const text = props.items.map((item) => `${item.label}: ${item.value}`).join('\n');
      const done = (): void => {
        copyStatus.value = t('desk.details.copied', {}, 'References copied.');
      };
      const failed = (): void => {
        copyStatus.value = t(
          'desk.details.copy_failed',
          {},
          'Copy failed. Select the reference text by hand.',
        );
      };
      try {
        const clipboard =
          typeof globalThis.navigator === 'undefined'
            ? undefined
            : globalThis.navigator.clipboard;
        if (clipboard?.writeText === undefined) {
          failed();
          return;
        }
        await clipboard.writeText(text);
        done();
      } catch {
        failed();
      }
    }

    return { t, open, copyStatus, onCopy };
  },
});
</script>
