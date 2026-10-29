// Characterization for the VI desk locale (Refs #339): switching
// the shell locale re-renders the key screens in Vietnamese with no
// missing-key fallback, switching back restores English, and the
// choice survives a reload via localStorage (locale only).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ShellApp from '../App.vue';
import router from '../router';
import { LOCALE_STORAGE_KEY, setLocale, t } from './index';
import { useSessionStore } from '../stores/session';
import { resetConnectivityForTests } from '../api/client';

// D1 canvas-manifest-relative order (Refs #419, #424, #425):
// Desk, Stay, Onboarding, Rooms, Book, Folio, Print, Admin —
// Onboarding sits in its canvas-relative spot between Stay and
// Rooms.
const EN_NAV = ['Desk', 'Stay', 'Onboarding', 'Rooms', 'Book', 'Folio', 'Print', 'Admin'];
const VI_NAV = ['Lễ tân', 'Lưu trú', 'Thiết lập', 'Sơ đồ phòng', 'Đặt phòng', 'Bảng kê', 'In ấn', 'Quản trị'];

describe('shell locale switch (EN/VI)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setLocale('en');
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  function quietFetch() {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  async function mountShell(path: string) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await router.replace(path);
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
    });
    await router.isReady();
    return wrapper;
  }

  it('shows both locales in the header switcher with EN active by default', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const wrapper = await mountShell('/');
      const switcher = wrapper.find('[data-testid="locale-switcher"]');
      expect(switcher.exists()).toBe(true);
      expect(switcher.attributes('role')).toBe('group');
      expect(wrapper.find('[data-testid="locale-en"]').text()).toBe('English');
      expect(wrapper.find('[data-testid="locale-vi"]').text()).toBe('Tiếng Việt');
      expect(wrapper.find('[data-testid="locale-en"]').attributes('aria-pressed')).toBe('true');
      expect(wrapper.findAll('[data-testid^="shell-nav-"]').map((item) => item.text())).toEqual(
        EN_NAV,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('re-renders the shell chrome in Vietnamese with no missing-key fallback', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const wrapper = await mountShell('/');
      await wrapper.find('[data-testid="locale-vi"]').trigger('click');
      expect(wrapper.findAll('[data-testid^="shell-nav-"]').map((item) => item.text())).toEqual(
        VI_NAV,
      );
      expect(wrapper.find('[data-testid="shell-brand"]').text()).toBe('Quản lý khách sạn');
      expect(wrapper.find('[data-testid="shell-signout"]').text()).toBe('Đăng xuất');
      expect(wrapper.find('[data-testid="locale-vi"]').attributes('aria-pressed')).toBe('true');
      // No missing-key marker anywhere in the rendered shell.
      expect(wrapper.html()).not.toContain('message-missing:');
      // The choice persists as locale only.
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('vi');
      expect(localStorage.getItem('hotel-mgmt.session.token')).toBeNull();
      // Switching back restores English the same way.
      await wrapper.find('[data-testid="locale-en"]').trigger('click');
      expect(wrapper.findAll('[data-testid^="shell-nav-"]').map((item) => item.text())).toEqual(
        EN_NAV,
      );
      expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the sign-in gate in Vietnamese when switched before signing in', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    await router.replace('/book');
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
    });
    await router.isReady();
    expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
    await wrapper.find('[data-testid="locale-vi"]').trigger('click');
    expect(wrapper.find('[data-testid="shell-signin-submit"]').text()).toBe('Đăng nhập');
    expect(wrapper.text()).toContain('Đăng nhập để làm việc tại quầy lễ tân.');
    expect(wrapper.html()).not.toContain('message-missing:');
  });

  it('renders a key desk screen in Vietnamese with no missing-key fallback', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const wrapper = await mountShell('/book');
      await wrapper.find('[data-testid="locale-vi"]').trigger('click');
      expect(wrapper.text()).toContain('Đặt phòng mới');
      expect(wrapper.text()).toContain('Lấy báo giá');
      expect(wrapper.text()).not.toContain('New booking');
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('restores the stored locale on a fresh module load (reload)', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'vi');
    vi.resetModules();
    try {
      const fresh = await import('./index');
      expect(fresh.catalogueLocale()).toBe('vi');
      expect(fresh.t('desk.shell.nav_desk')).toBe('Lễ tân');
      expect(t('desk.shell.nav_desk')).toBe('Desk');
    } finally {
      vi.resetModules();
    }
  });
});
