// Loopback-only network guard (issue #337, plan section 4.3).
//
// The lab runs on an offline LAN: at test time nothing may be fetched
// from a CDN. Every spec installs this guard in `beforeEach` and
// asserts it in `afterEach`; any request to a non-loopback host fails
// the run closed. Same-origin proxy traffic (`127.0.0.1`, `localhost`)
// is the only traffic the suite may emit — the SPA ships zero CDN
// dependencies (vendored Vite build) and the API client uses relative
// paths through the proxy.
import type { Page } from '@playwright/test';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export interface LoopbackGuard {
  violations: string[];
  assertClean: () => void;
}

export function installLoopbackGuard(page: Page): LoopbackGuard {
  const violations: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).hostname;
    if (!LOOPBACK.has(host)) {
      violations.push(`${request.method()} ${request.url()}`);
    }
  });
  return {
    violations,
    assertClean: () => {
      if (violations.length > 0) {
        throw new Error(
          `Non-loopback requests during browser E2E (offline LAN violated):\n${violations.join('\n')}`,
        );
      }
    },
  };
}
