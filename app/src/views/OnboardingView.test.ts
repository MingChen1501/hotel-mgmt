// Guards for the Onboarding setup wizard (Refs #425, AC-DSK-7,
// LLD section 13.4): step 1 matches the owner design (hotel-name
// input with example placeholder, invoice/receipt helper, 25
// percent progress, continue action), persists through the
// existing UpdateHotelConfig surface, and launches on an empty
// database only — a seeded database redirects to the shell.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ProgressBar from 'primevue/progressbar';
import OnboardingView from './OnboardingView.vue';
import { createAppRouter } from '../router';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';
import { useSessionStore } from '../stores/session';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ code, message, details: {}, traceId: 'test' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubConfig(fetchMock: ReturnType<typeof vi.fn>, values: Record<string, unknown>): void {
  fetchMock.mockImplementation((url: string) =>
    url === '/v1/admin/GetHotelConfig'
      ? Promise.resolve(jsonResponse({ schemaVersion: 1, values }))
      : Promise.resolve(jsonResponse({})),
  );
}

async function mountWizard(path = '/onboarding') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  const router = createAppRouter();
  await router.replace(path);
  const wrapper = mount(OnboardingView, {
    global: { plugins: [pinia, router] },
  });
  await router.isReady();
  return { wrapper, router };
}

describe('onboarding wizard step 1', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    setLocale('en');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows step 1 per the design on an empty database', async () => {
    const fetchMock = vi.fn();
    stubConfig(fetchMock, {});
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      expect(wrapper.find('h1').text()).toBe('First-time setup');
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 1 of 4');
      // The design shows step 1 at 25 percent progress.
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(25);
      expect(wrapper.find('[data-testid="onboarding-hotel-name"]').attributes('placeholder')).toBe(
        'Example: Sunrise Riverside Hotel',
      );
      expect(wrapper.find('[data-testid="onboarding-hotel-name-helper"]').text()).toContain(
        'appears on invoices and receipts',
      );
      expect(wrapper.find('[data-testid="onboarding-continue"]').text()).toBe('Continue');
      // Back has nowhere to go on the first step, so it stays
      // disabled rather than leaving the wizard.
      expect(wrapper.find('[data-testid="onboarding-back"]').attributes('disabled')).toBeDefined();
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('redirects to the shell when the hotel name is already configured', async () => {
    const fetchMock = vi.fn();
    stubConfig(fetchMock, { name: 'Seeded Hotel' });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { router } = await mountWizard();
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/');
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps staff on step 1 when the name is blank', async () => {
    const fetchMock = vi.fn();
    stubConfig(fetchMock, {});
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="onboarding-step1-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain(
        'Enter the hotel name to continue.',
      );
      expect(fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/UpdateHotelConfig')).toBe(
        false,
      );
      expect(router.currentRoute.value.path).toBe('/onboarding');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('persists the hotel name and completes setup on continue', async () => {
    const fetchMock = vi.fn();
    stubConfig(fetchMock, {});
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/GetHotelConfig') {
        return Promise.resolve(jsonResponse({ schemaVersion: 1, values: {} }));
      }
      if (url === '/v1/admin/UpdateHotelConfig') {
        return Promise.resolve(jsonResponse({ schemaVersion: 2, values: { name: 'Sunrise Hotel' } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="onboarding-hotel-name"]').setValue('Sunrise Hotel');
      await wrapper.find('[data-testid="onboarding-step1-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/');
      });
      const updateCall = fetchMock.mock.calls.find((call) => call[0] === '/v1/admin/UpdateHotelConfig');
      expect(updateCall).toBeDefined();
      expect(JSON.parse(updateCall?.[1]?.body as string)).toEqual({
        values: { name: 'Sunrise Hotel' },
        updatedBy: 'Ada Owner',
      });
      expect(wrapper.emitted('setup-complete')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a forbidden setup as the owner/manager sentence and stays on step 1', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation((url: string) =>
      url === '/v1/admin/GetHotelConfig'
        ? Promise.resolve(jsonResponse({ schemaVersion: 1, values: {} }))
        : Promise.resolve(
          errorResponse('FORBIDDEN', 'Front-desk accounts cannot change hotel config.', 403),
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="onboarding-hotel-name"]').setValue('Sunrise Hotel');
      await wrapper.find('[data-testid="onboarding-step1-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-error"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain(
        'Setup is for the owner or manager.',
      );
      expect(router.currentRoute.value.path).toBe('/onboarding');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the wizard in Vietnamese with no missing-key fallback', async () => {
    setLocale('vi');
    const fetchMock = vi.fn();
    stubConfig(fetchMock, {});
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      expect(wrapper.find('h1').text()).toBe('Thiết lập lần đầu');
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Bước 1 trên 4');
      expect(wrapper.find('[data-testid="onboarding-hotel-name-helper"]').text()).toContain(
        'hóa đơn và biên lai',
      );
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      setLocale('en');
      vi.unstubAllGlobals();
    }
  });
});
