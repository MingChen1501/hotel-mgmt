// Shell document-title behaviour (Refs #495 S2): the served
// document title follows the design board per screen through the
// route title meta, resolving via the catalogue so it tracks the
// staff locale; routes outside the design batch fall back to the
// default title.
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ShellApp from './App.vue';
import router from './router';
import { setLocale } from './i18n';

describe('shell document titles', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    setLocale('en');
    await router.replace('/');
  });

  it('serves the desk board title on the desk route', async () => {
    mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    await router.isReady();
    await nextTick();
    expect(document.title).toBe('Desk board');
  });

  it('follows the design board per screen on navigation', async () => {
    mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    await router.push('/book');
    await nextTick();
    expect(document.title).toBe('Book a room');
    await router.push('/stay');
    await nextTick();
    expect(document.title).toBe('Check-in / check-out');
    await router.push('/rooms');
    await nextTick();
    expect(document.title).toBe('Room map');
    await router.push('/folio');
    await nextTick();
    expect(document.title).toBe('Folio');
    await router.push('/onboarding');
    await nextTick();
    expect(document.title).toBe('First-time setup');
  });

  it('falls back to the default title outside the design batch', async () => {
    mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    await router.push('/print');
    await nextTick();
    expect(document.title).toBe('Hotel Management — Desk');
    await router.push('/admin');
    await nextTick();
    expect(document.title).toBe('Hotel Management — Desk');
  });

  it('falls back to the default title on unknown deep-link paths', async () => {
    mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    await router.push('/no-such-screen');
    await nextTick();
    // The catch-all placeholder carries no title meta, so the served
    // title falls back to the static default (Refs #495 S2).
    expect(document.title).toBe('Hotel Management — Desk');
  });

  it('tracks the staff locale into Vietnamese board titles', async () => {
    mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    setLocale('vi');
    await nextTick();
    // The desk route is active: the served title matches the Main
    // design-board <title> (docs/design/Main.dc.html).
    expect(document.title).toBe('Bảng lễ tân');
    await router.push('/rooms');
    await nextTick();
    expect(document.title).toBe('Sơ đồ phòng');
  });
});
