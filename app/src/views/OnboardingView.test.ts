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

  it('persists the hotel name and advances to step 2 on continue', async () => {
    const fetchMock = vi.fn();
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
      // Step 1 persists and advances: completion (the desk route
      // plus setup-complete) waits for step 4 (Refs #438).
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-2"]').exists()).toBe(true);
      });
      const updateCall = fetchMock.mock.calls.find((call) => call[0] === '/v1/admin/UpdateHotelConfig');
      expect(updateCall).toBeDefined();
      expect(JSON.parse(updateCall?.[1]?.body as string)).toEqual({
        values: { name: 'Sunrise Hotel' },
        updatedBy: 'Ada Owner',
      });
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 2 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(50);
      expect(wrapper.emitted('setup-complete')).toBeUndefined();
      expect(router.currentRoute.value.path).toBe('/onboarding');
      expect(wrapper.html()).not.toContain('message-missing:');
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

  it('reads an unexpected save failure as the plain retry sentence and stays on step 1', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementation((url: string) =>
      url === '/v1/admin/GetHotelConfig'
        ? Promise.resolve(jsonResponse({ schemaVersion: 1, values: {} }))
        : Promise.resolve(
          errorResponse('INTERNAL', 'Request failed: database exploded', 500),
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
      // FR-DSP-3: the raw server text never surfaces; staff see the
      // catalogued plain-word sentence instead.
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain(
        'That did not work.',
      );
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).not.toContain(
        'database exploded',
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

// Guards for wizard steps 2–4 (Refs #438, AC-DSK-9..11 over
// FR-DSK-8..10, LLD section 13.4 nodes J1–J12): D10 step-2
// config details, D11 step-3 rooms seed, D12 step-4 owner setup.
function stubFullFlow(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockImplementation((url: string) => {
    if (url === '/v1/admin/GetHotelConfig') {
      return Promise.resolve(jsonResponse({ schemaVersion: 1, values: {} }));
    }
    if (url === '/v1/admin/UpdateHotelConfig') {
      return Promise.resolve(jsonResponse({ schemaVersion: 2, values: {} }));
    }
    if (url === '/v1/rooms/UpsertRoomType') {
      return Promise.resolve(jsonResponse({ id: 'type-1', name: 'Standard' }));
    }
    if (url === '/v1/rooms/UpsertRoom') {
      return Promise.resolve(jsonResponse({ id: 'room-1', number: '101' }));
    }
    if (url === '/v1/admin/CreateUser') {
      return Promise.resolve(jsonResponse({ userId: 'user-1' }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

function configUpdateCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter((call) => call[0] === '/v1/admin/UpdateHotelConfig');
}

async function completeStep1(wrapper: ReturnType<typeof mount>): Promise<void> {
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
  });
  await wrapper.find('[data-testid="onboarding-hotel-name"]').setValue('Sunrise Hotel');
  await wrapper.find('[data-testid="onboarding-step1-form"]').trigger('submit');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="onboarding-step-2"]').exists()).toBe(true);
  });
}

async function completeStep2(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.find('[data-testid="onboarding-timezone"]').setValue('Asia/Ho_Chi_Minh');
  await wrapper.find('[data-testid="onboarding-step2-form"]').trigger('submit');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
  });
}

async function completeStep3(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.find('[data-testid="onboarding-type-name-0"]').setValue('Standard');
  await wrapper.find('[data-testid="onboarding-room-number-0"]').setValue('101');
  await wrapper.vm.$nextTick();
  await wrapper.find('[data-testid="onboarding-room-type-0"]').setValue('Standard');
  await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="onboarding-step-4"]').exists()).toBe(true);
  });
}

describe('onboarding wizard step 2', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    setLocale('en');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows step 2 at 50 percent with working back navigation', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      expect(wrapper.find('[data-testid="onboarding-step-2"] h2').text()).toBe('Hotel details');
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 2 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(50);
      expect(wrapper.find('[data-testid="onboarding-step2-note"]').text()).toContain('optional');
      expect(wrapper.find('[data-testid="onboarding-retention-floor-helper"]').text()).toContain('365-day');
      // Back has a previous step now, so it stays enabled.
      expect(wrapper.find('[data-testid="onboarding-back"]').attributes('disabled')).toBeUndefined();
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps staff on step 2 when the timezone is blank', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await completeStep1(wrapper);
      const callsBefore = configUpdateCalls(fetchMock).length;
      await wrapper.find('[data-testid="onboarding-address"]').setValue('12 Lake Road');
      await wrapper.find('[data-testid="onboarding-step2-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('timezone');
      // Nothing persisted for the failing step: only the step-1
      // UpdateHotelConfig call exists.
      expect(configUpdateCalls(fetchMock)).toHaveLength(callsBefore);
      expect(wrapper.find('[data-testid="onboarding-step-2"]').exists()).toBe(true);
      expect(router.currentRoute.value.path).toBe('/onboarding');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a bad retention floor and persists nothing for the step', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      const callsBefore = configUpdateCalls(fetchMock).length;
      await wrapper.find('[data-testid="onboarding-timezone"]').setValue('Asia/Ho_Chi_Minh');
      await wrapper.find('[data-testid="onboarding-retention-floor"]').setValue('soon');
      await wrapper.find('[data-testid="onboarding-step2-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('whole number');
      expect(configUpdateCalls(fetchMock)).toHaveLength(callsBefore);
      expect(wrapper.find('[data-testid="onboarding-step-2"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('persists contacts plus timezone and advances to step 3', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await wrapper.find('[data-testid="onboarding-address"]').setValue('12 Lake Road');
      await wrapper.find('[data-testid="onboarding-phone"]').setValue('+84 24 0000');
      await wrapper.find('[data-testid="onboarding-email"]').setValue('stay@sunrise.example');
      await wrapper.find('[data-testid="onboarding-timezone"]').setValue('Asia/Ho_Chi_Minh');
      await wrapper.find('[data-testid="onboarding-step2-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
      });
      const lastCall = configUpdateCalls(fetchMock).at(-1);
      // Blank floor keeps the 365-day default: the key is omitted.
      expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({
        values: {
          timezone: 'Asia/Ho_Chi_Minh',
          address: '12 Lake Road',
          phone: '+84 24 0000',
          email: 'stay@sunrise.example',
        },
        updatedBy: 'Ada Owner',
      });
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 3 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(75);
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('saves an entered retention floor and keeps values on back', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await wrapper.find('[data-testid="onboarding-timezone"]').setValue('Asia/Ho_Chi_Minh');
      await wrapper.find('[data-testid="onboarding-retention-floor"]').setValue('90');
      await wrapper.find('[data-testid="onboarding-step2-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
      });
      const lastCall = configUpdateCalls(fetchMock).at(-1);
      expect(JSON.parse(lastCall?.[1]?.body as string)).toEqual({
        values: { timezone: 'Asia/Ho_Chi_Minh', retentionFloorDays: 90 },
        updatedBy: 'Ada Owner',
      });
      // Back returns to step 2 with entered values kept.
      await wrapper.find('[data-testid="onboarding-back"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-2"]').exists()).toBe(true);
      });
      expect(
        (wrapper.find('[data-testid="onboarding-timezone"]').element as HTMLInputElement).value,
      ).toBe('Asia/Ho_Chi_Minh');
      expect(
        (wrapper.find('[data-testid="onboarding-retention-floor"]').element as HTMLInputElement).value,
      ).toBe('90');
      // Back again returns to step 1 with the hotel name kept.
      await wrapper.find('[data-testid="onboarding-back"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-1"]').exists()).toBe(true);
      });
      expect(
        (wrapper.find('[data-testid="onboarding-hotel-name"]').element as HTMLInputElement).value,
      ).toBe('Sunrise Hotel');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('onboarding wizard step 3', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    setLocale('en');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows step 3 at 75 percent after step 2', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      expect(wrapper.find('[data-testid="onboarding-step-3"] h2').text()).toBe('Rooms and room types');
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 3 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(75);
      expect(wrapper.find('[data-testid="onboarding-add-type"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="onboarding-add-room"]').exists()).toBe(true);
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a blank room-type name and persists nothing', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await wrapper.find('[data-testid="onboarding-room-number-0"]').setValue('101');
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('room type name');
      expect(
        fetchMock.mock.calls.some(
          (call) => call[0] === '/v1/rooms/UpsertRoomType' || call[0] === '/v1/rooms/UpsertRoom',
        ),
      ).toBe(false);
      expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a blank room number and persists nothing', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await wrapper.find('[data-testid="onboarding-type-name-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('room number');
      expect(
        fetchMock.mock.calls.some(
          (call) => call[0] === '/v1/rooms/UpsertRoomType' || call[0] === '/v1/rooms/UpsertRoom',
        ),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a repeated number in the batch naming the number', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await wrapper.find('[data-testid="onboarding-type-name-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-add-room"]').trigger('click');
      await wrapper.find('[data-testid="onboarding-room-number-0"]').setValue('101');
      await wrapper.find('[data-testid="onboarding-room-number-1"]').setValue('101');
      await wrapper.vm.$nextTick();
      await wrapper.find('[data-testid="onboarding-room-type-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-room-type-1"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('101');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('already listed');
      expect(
        fetchMock.mock.calls.some(
          (call) => call[0] === '/v1/rooms/UpsertRoomType' || call[0] === '/v1/rooms/UpsertRoom',
        ),
      ).toBe(false);
      expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses a room with no linked type and persists nothing', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await wrapper.find('[data-testid="onboarding-type-name-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-room-number-0"]').setValue('101');
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('Link every room');
      expect(
        fetchMock.mock.calls.some(
          (call) => call[0] === '/v1/rooms/UpsertRoomType' || call[0] === '/v1/rooms/UpsertRoom',
        ),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('persists types then rooms and advances to step 4', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await wrapper.find('[data-testid="onboarding-type-name-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-type-capacity-0"]').setValue('2');
      await wrapper.find('[data-testid="onboarding-type-bed-0"]').setValue('Queen');
      await wrapper.find('[data-testid="onboarding-room-number-0"]').setValue('101');
      await wrapper.find('[data-testid="onboarding-room-floor-0"]').setValue('1');
      await wrapper.vm.$nextTick();
      await wrapper.find('[data-testid="onboarding-room-type-0"]').setValue('Standard');
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-4"]').exists()).toBe(true);
      });
      const calls = fetchMock.mock.calls;
      const typeIndex = calls.findIndex((call) => call[0] === '/v1/rooms/UpsertRoomType');
      const roomIndex = calls.findIndex((call) => call[0] === '/v1/rooms/UpsertRoom');
      expect(typeIndex).toBeGreaterThanOrEqual(0);
      expect(roomIndex).toBeGreaterThanOrEqual(0);
      const typeCall = calls[typeIndex];
      const roomCall = calls[roomIndex];
      expect(JSON.parse(typeCall?.[1]?.body as string)).toEqual({
        name: 'Standard',
        capacity: 2,
        bedType: 'Queen',
        actor: 'Ada Owner',
      });
      expect(JSON.parse(roomCall?.[1]?.body as string)).toEqual({
        number: '101',
        roomType: 'Standard',
        floor: '1',
        actor: 'Ada Owner',
      });
      // Types persist before rooms so every room links to a type
      // saved in this step.
      expect(typeIndex).toBeLessThan(roomIndex);
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 4 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(100);
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('onboarding wizard step 4', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    setLocale('en');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows step 4 at 100 percent with the owner role fixed', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await completeStep3(wrapper);
      expect(wrapper.find('[data-testid="onboarding-step-4"] h2').text()).toBe(
        'Create the owner account',
      );
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Step 4 of 4');
      expect(wrapper.findComponent(ProgressBar).props('value')).toBe(100);
      expect(wrapper.find('[data-testid="onboarding-role-note"]').text()).toContain('owner');
      expect(wrapper.find('[data-testid="onboarding-continue"]').text()).toBe('Finish');
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses blank name, identity, and secret naming each field', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await completeStep3(wrapper);
      await wrapper.find('[data-testid="onboarding-step4-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('your name');
      await wrapper.find('[data-testid="onboarding-display-name"]').setValue('Ada Owner');
      await wrapper.find('[data-testid="onboarding-step4-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('sign-in name');
      await wrapper.find('[data-testid="onboarding-signin-identity"]').setValue('ada');
      await wrapper.find('[data-testid="onboarding-step4-form"]').trigger('submit');
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('password');
      expect(
        fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/CreateUser'),
      ).toBe(false);
      expect(wrapper.find('[data-testid="onboarding-step-4"]').exists()).toBe(true);
      expect(router.currentRoute.value.path).toBe('/onboarding');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a taken identity as the taken-identity sentence and creates no account', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/GetHotelConfig') {
        return Promise.resolve(jsonResponse({ schemaVersion: 1, values: {} }));
      }
      if (url === '/v1/admin/CreateUser') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'VALIDATION_FAILED',
              message: 'Sign-in identity ada is already taken.',
              details: { signinIdentity: 'ada' },
              traceId: 'test',
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await completeStep3(wrapper);
      await wrapper.find('[data-testid="onboarding-display-name"]').setValue('Ada Owner');
      await wrapper.find('[data-testid="onboarding-signin-identity"]').setValue('ada');
      await wrapper.find('[data-testid="onboarding-secret"]').setValue('s3cret');
      await wrapper.find('[data-testid="onboarding-step4-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-error"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="onboarding-error"]').text()).toContain('already in use');
      expect(wrapper.find('[data-testid="onboarding-step-4"]').exists()).toBe(true);
      expect(wrapper.emitted('setup-complete')).toBeUndefined();
      expect(router.currentRoute.value.path).toBe('/onboarding');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('creates the owner account and completes setup on finish', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper, router } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await completeStep3(wrapper);
      await wrapper.find('[data-testid="onboarding-display-name"]').setValue('Ada Owner');
      await wrapper.find('[data-testid="onboarding-signin-identity"]').setValue('ada');
      await wrapper.find('[data-testid="onboarding-secret"]').setValue('s3cret');
      await wrapper.find('[data-testid="onboarding-step4-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(router.currentRoute.value.path).toBe('/');
      });
      const createCall = fetchMock.mock.calls.find((call) => call[0] === '/v1/admin/CreateUser');
      expect(createCall).toBeDefined();
      expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
        displayName: 'Ada Owner',
        signinIdentity: 'ada',
        secret: 's3cret',
        role: 'owner',
      });
      expect(wrapper.emitted('setup-complete')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns to step 3 from step 4 with entered values kept', async () => {
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      await completeStep2(wrapper);
      await completeStep3(wrapper);
      await wrapper.find('[data-testid="onboarding-display-name"]').setValue('Ada Owner');
      await wrapper.find('[data-testid="onboarding-back"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-3"]').exists()).toBe(true);
      });
      // Step 3 values survive the round trip to step 4 and back.
      expect(
        (wrapper.find('[data-testid="onboarding-type-name-0"]').element as HTMLInputElement).value,
      ).toBe('Standard');
      expect(
        (wrapper.find('[data-testid="onboarding-room-number-0"]').element as HTMLInputElement).value,
      ).toBe('101');
      // Step 4 values survive too: continuing returns to step 4
      // with the display name kept.
      await wrapper.find('[data-testid="onboarding-step3-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="onboarding-step-4"]').exists()).toBe(true);
      });
      expect(
        (wrapper.find('[data-testid="onboarding-display-name"]').element as HTMLInputElement).value,
      ).toBe('Ada Owner');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders steps 2–4 in Vietnamese with no missing-key fallback', async () => {
    setLocale('vi');
    const fetchMock = vi.fn();
    stubFullFlow(fetchMock);
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { wrapper } = await mountWizard();
      await completeStep1(wrapper);
      expect(wrapper.find('[data-testid="onboarding-step-2"] h2').text()).toBe('Thông tin khách sạn');
      await completeStep2(wrapper);
      expect(wrapper.find('[data-testid="onboarding-step-3"] h2').text()).toBe('Phòng và hạng phòng');
      await completeStep3(wrapper);
      expect(wrapper.find('h1').text()).toBe('Thiết lập lần đầu');
      expect(wrapper.find('[data-testid="onboarding-progress"]').text()).toBe('Bước 4 trên 4');
      expect(wrapper.find('[data-testid="onboarding-step-4"] h2').text()).toBe(
        'Tạo tài khoản chủ khách sạn',
      );
      expect(wrapper.find('[data-testid="onboarding-role-note"]').text()).toContain('chủ khách sạn');
      expect(wrapper.html()).not.toContain('message-missing:');
    } finally {
      setLocale('en');
      vi.unstubAllGlobals();
    }
  });
});
