// Boot secret resolution for AdminService (issue #638, audit finding
// A1, BR-70). The service used to fall back to two constants printed
// in this repository: the session signing key to
// "dev-only-change-me" and the boot owner secret to "change-me".
// resolveBootConfig reads the environment once, before main builds a
// store, connects to Postgres, applies a migration, seeds a user, or
// opens its port, and either returns the whole boot configuration or
// throws BootConfigError naming the unusable variable. One explicit
// switch, ADMIN_DEV_MODE=1, is the only path back to the dev
// fallbacks; NODE_ENV decides nothing in either direction
// (LLD section 39, docs/architecture/lld.md).

export const DEV_TOKEN_KEY = "dev-only-change-me";
export const DEV_BOOT_SECRET = "change-me";
export const DEV_MODE_VARIABLE = "ADMIN_DEV_MODE";
export const TOKEN_KEY_VARIABLE = "ADMIN_TOKEN_KEY";
export const BOOT_SECRET_VARIABLE = "ADMIN_BOOT_SECRET";

// PUBLISHED_DEFAULTS is the deployment denylist. It must equal the
// is_default_secret() list in script/preflight.sh exactly; the two
// live in separate build units (ADR-0001) with no import edge, so
// BOOT5 asserts equality rather than sharing the list (BR-70).
export const PUBLISHED_DEFAULTS: readonly string[] = [
  "change-me",
  "change-me-dev-only",
  "password",
  "hotel",
  "hotel-dev-only",
];

export interface DevFallbacks {
  tokenKey: boolean;
  bootSecret: boolean;
}

export interface BootConfig {
  tokenKey: string;
  bootIdentity: string;
  bootSecret: string;
  devMode: boolean;
  devFallbacks: DevFallbacks;
}

/** BootConfigError names the variable that refused the boot; it
 * never carries the value that was presented (BOOT1/BOOT2). */
export class BootConfigError extends Error {
  constructor(readonly variable: string) {
    super(bootRefusalLine(variable));
    this.name = "BootConfigError";
  }
}

/** The fixed operator line (LLD 39.2): one plain English line on
 * stderr, naming the variable and the two ways forward, never a
 * value or a failure class. */
export function bootRefusalLine(variable: string): string {
  return `admin: refusing to boot: ${variable} is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.`;
}

/** The one dev-path warning (LLD 39.3), naming the switch and each
 * fallback actually in use. */
export function bootDevWarning(fallbacks: DevFallbacks): string {
  const inUse: string[] = [];
  if (fallbacks.tokenKey) {
    inUse.push("the dev session key");
  }
  if (fallbacks.bootSecret) {
    inUse.push("the dev boot secret");
  }
  if (inUse.length === 0) {
    return "admin: warning: ADMIN_DEV_MODE=1 is set; both per-sale secrets are provisioned, so no dev fallback is in use.";
  }
  return `admin: warning: ADMIN_DEV_MODE=1 is set; using ${inUse.join(" and ")} where a per-sale secret is not provisioned.`;
}

// isUsableSecret mirrors the deployment check: unset and empty ("")
// are the same failure, and nothing is trimmed. There is no length or
// strength policy in the tree (requirements section 40.6).
function isUsableSecret(value: string | undefined): value is string {
  return typeof value === "string" && value !== "";
}

function isPublishedDefault(value: string): boolean {
  return PUBLISHED_DEFAULTS.includes(value);
}

/** resolveBootConfig is a pure function over the passed environment,
 * so the guards can call it directly while the boot-order guards
 * still spawn the real entry point. Refusal order is fixed:
 * ADMIN_TOKEN_KEY first, then ADMIN_BOOT_SECRET. */
export function resolveBootConfig(env: NodeJS.ProcessEnv = process.env): BootConfig {
  const bootIdentity = env["ADMIN_BOOT_IDENTITY"] ?? "owner";
  const tokenKey = env[TOKEN_KEY_VARIABLE];
  const bootSecret = env[BOOT_SECRET_VARIABLE];

  if (env[DEV_MODE_VARIABLE] === "1") {
    return {
      tokenKey: isUsableSecret(tokenKey) ? tokenKey : DEV_TOKEN_KEY,
      bootIdentity,
      bootSecret: isUsableSecret(bootSecret) ? bootSecret : DEV_BOOT_SECRET,
      devMode: true,
      devFallbacks: {
        tokenKey: !isUsableSecret(tokenKey),
        bootSecret: !isUsableSecret(bootSecret),
      },
    };
  }

  if (!isUsableSecret(tokenKey) || isPublishedDefault(tokenKey)) {
    throw new BootConfigError(TOKEN_KEY_VARIABLE);
  }
  if (!isUsableSecret(bootSecret) || isPublishedDefault(bootSecret)) {
    throw new BootConfigError(BOOT_SECRET_VARIABLE);
  }
  return {
    tokenKey,
    bootIdentity,
    bootSecret,
    devMode: false,
    devFallbacks: { tokenKey: false, bootSecret: false },
  };
}
