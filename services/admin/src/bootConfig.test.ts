import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  BOOT_SECRET_VARIABLE,
  BootConfigError,
  DEV_BOOT_SECRET,
  DEV_TOKEN_KEY,
  PUBLISHED_DEFAULTS,
  TOKEN_KEY_VARIABLE,
  bootDevWarning,
  bootRefusalLine,
  resolveBootConfig,
} from "./bootConfig.js";

// BOOT1-BOOT5 (#638, BR-70): the resolver unit half plus the bundle
// and code-reading assertions. The two child-process halves live in
// server.test.ts (in-memory) and pgstore.test.ts (scratch Postgres).

const REPO_ROOT = join(__dirname, "..", "..", "..");

function readRepo(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

// A usable provisioned pair for the positive controls.
const GOOD_ENV: NodeJS.ProcessEnv = {
  ADMIN_TOKEN_KEY: "unit-test-signing-key-3f8v",
  ADMIN_BOOT_SECRET: "unit-test-boot-secret-7q2x",
};

function expectRefusal(env: NodeJS.ProcessEnv, variable: string): BootConfigError {
  try {
    resolveBootConfig(env);
  } catch (err: unknown) {
    assert.ok(err instanceof BootConfigError, "the resolver throws BootConfigError");
    assert.equal(err.variable, variable);
    assert.equal(err.message, bootRefusalLine(variable));
    return err;
  }
  assert.fail(`resolver accepted an unusable ${variable}`);
}

describe("resolveBootConfig fail-closed boot (BOOT1, BOOT2)", () => {
  it("refuses an unset or empty ADMIN_TOKEN_KEY before the boot secret is read", () => {
    for (const tokenKey of [undefined, ""]) {
      const env: NodeJS.ProcessEnv = { ...GOOD_ENV };
      if (tokenKey === undefined) {
        delete env["ADMIN_TOKEN_KEY"];
      } else {
        env["ADMIN_TOKEN_KEY"] = tokenKey;
      }
      const err = expectRefusal(env, TOKEN_KEY_VARIABLE);
      assert.match(err.message, /ADMIN_TOKEN_KEY/);
      assert.match(err.message, /ADMIN_DEV_MODE=1/);
      assert.ok(!err.message.includes("unit-test-signing-key-3f8v"));
    }
  });

  it("refuses every published default as the signing key", () => {
    for (const value of PUBLISHED_DEFAULTS) {
      const err = expectRefusal({ ...GOOD_ENV, ADMIN_TOKEN_KEY: value }, TOKEN_KEY_VARIABLE);
      assert.ok(!err.message.includes(value), "the refusal line never echoes the value");
    }
  });

  it("refuses an unset or empty ADMIN_BOOT_SECRET", () => {
    for (const bootSecret of [undefined, ""]) {
      const env: NodeJS.ProcessEnv = { ...GOOD_ENV };
      if (bootSecret === undefined) {
        delete env["ADMIN_BOOT_SECRET"];
      } else {
        env["ADMIN_BOOT_SECRET"] = bootSecret;
      }
      const err = expectRefusal(env, BOOT_SECRET_VARIABLE);
      assert.ok(!err.message.includes("unit-test-boot-secret-7q2x"));
    }
  });

  it("refuses every published default as the boot secret and never echoes it", () => {
    for (const value of PUBLISHED_DEFAULTS) {
      const err = expectRefusal({ ...GOOD_ENV, ADMIN_BOOT_SECRET: value }, BOOT_SECRET_VARIABLE);
      assert.ok(!err.message.includes(value));
      assert.equal(err.message, bootRefusalLine(BOOT_SECRET_VARIABLE));
    }
  });

  it("checks the signing key first when both secrets are unusable", () => {
    expectRefusal({}, TOKEN_KEY_VARIABLE);
  });

  it("boots the provisioned pair and keeps ADMIN_BOOT_IDENTITY semantics", () => {
    const boot = resolveBootConfig(GOOD_ENV);
    assert.equal(boot.tokenKey, GOOD_ENV["ADMIN_TOKEN_KEY"]);
    assert.equal(boot.bootSecret, GOOD_ENV["ADMIN_BOOT_SECRET"]);
    assert.equal(boot.bootIdentity, "owner");
    assert.equal(boot.devMode, false);
    assert.deepEqual(boot.devFallbacks, { tokenKey: false, bootSecret: false });

    assert.equal(resolveBootConfig({ ...GOOD_ENV, ADMIN_BOOT_IDENTITY: "boss" }).bootIdentity, "boss");
    assert.equal(resolveBootConfig({ ...GOOD_ENV, ADMIN_BOOT_IDENTITY: "" }).bootIdentity, "");
  });
});

describe("the ADMIN_DEV_MODE switch is the only way back (BOOT3)", () => {
  it("uses both dev fallbacks under ADMIN_DEV_MODE=1 and warns about each", () => {
    const boot = resolveBootConfig({ ADMIN_DEV_MODE: "1" });
    assert.equal(boot.tokenKey, DEV_TOKEN_KEY);
    assert.equal(boot.bootSecret, DEV_BOOT_SECRET);
    assert.equal(boot.devMode, true);
    assert.deepEqual(boot.devFallbacks, { tokenKey: true, bootSecret: true });
    const warning = bootDevWarning(boot.devFallbacks);
    assert.match(warning, /ADMIN_DEV_MODE=1/);
    assert.match(warning, /dev session key/);
    assert.match(warning, /dev boot secret/);
  });

  it("lets a provided value win over the fallback under the switch", () => {
    const boot = resolveBootConfig({ ADMIN_DEV_MODE: "1", ...GOOD_ENV });
    assert.equal(boot.tokenKey, GOOD_ENV["ADMIN_TOKEN_KEY"]);
    assert.equal(boot.bootSecret, GOOD_ENV["ADMIN_BOOT_SECRET"]);
    assert.equal(boot.devMode, true);
    assert.deepEqual(boot.devFallbacks, { tokenKey: false, bootSecret: false });
    assert.match(bootDevWarning(boot.devFallbacks), /ADMIN_DEV_MODE=1/);
  });

  it("accepts only the exact string 1 as the switch", () => {
    for (const value of ["", "0", "01", "true", "yes", "2", " 1 "]) {
      assert.throws(
        () => resolveBootConfig({ ADMIN_DEV_MODE: value }),
        (err: unknown) => err instanceof BootConfigError && err.variable === TOKEN_KEY_VARIABLE,
      );
    }
  });

  it("decides nothing from NODE_ENV in either direction", () => {
    assert.throws(
      () => resolveBootConfig({ NODE_ENV: "production" }),
      (err: unknown) => err instanceof BootConfigError && err.variable === TOKEN_KEY_VARIABLE,
    );
    const boot = resolveBootConfig({ ADMIN_DEV_MODE: "1", NODE_ENV: "production" });
    assert.equal(boot.tokenKey, DEV_TOKEN_KEY);
    assert.equal(boot.bootSecret, DEV_BOOT_SECRET);
  });
});

describe("no keyless construction path survives (BOOT1 code-reading half)", () => {
  const sources = readdirSync(join(REPO_ROOT, "services/admin/src"))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, text: readFileSync(join(REPO_ROOT, "services/admin/src", name), "utf8") }));

  it("reads ADMIN_TOKEN_KEY and ADMIN_BOOT_SECRET only in the resolver", () => {
    for (const { name, text } of sources) {
      if (name === "bootConfig.ts") {
        continue;
      }
      assert.ok(!text.includes("ADMIN_TOKEN_KEY"), `${name} must not read ADMIN_TOKEN_KEY`);
      assert.ok(!text.includes("ADMIN_BOOT_SECRET"), `${name} must not read ADMIN_BOOT_SECRET`);
      assert.ok(!text.includes("dev-only-change-me"), `${name} must not carry the dev signing key`);
      assert.ok(!text.includes('"change-me"'), `${name} must not carry the dev boot secret`);
    }
  });

  it("keeps createServiceServer without a default store", () => {
    const server = readRepo("services/admin/src/server.ts");
    assert.match(server, /export function createServiceServer\(service: string, store: AdminStoreAPI\): Server/);
    assert.ok(!server.includes("new AdminStore()"));
  });
});

describe("the code denylist equals script/preflight.sh (BOOT5)", () => {
  it("holds the same five exact values as is_default_secret()", () => {
    const preflight = readRepo("script/preflight.sh");
    const block = /is_default_secret\(\)\s*\{[\s\S]*?case "\$1" in\s*\n\s*([^\n]+)/.exec(preflight);
    assert.ok(block?.[1], "script/preflight.sh carries the is_default_secret() case list");
    const shellValues = [...block[1].matchAll(/"([^"]*)"/g)]
      .map((match) => match[1])
      .filter((value) => value !== "");
    assert.deepEqual(shellValues, [...PUBLISHED_DEFAULTS]);
  });
});

describe("the release bundle carries the third secret and never the switch (BOOT5)", () => {
  it("passes both Admin secrets with no fallback and never sets ADMIN_DEV_MODE", () => {
    const compose = readRepo("deploy/compose.yaml");
    assert.match(compose, /ADMIN_TOKEN_KEY:\s*\$\{ADMIN_TOKEN_KEY:\?/);
    assert.match(compose, /ADMIN_BOOT_SECRET:\s*\$\{ADMIN_BOOT_SECRET:\?/);
    assert.ok(!compose.includes("${ADMIN_TOKEN_KEY:-"));
    assert.ok(!compose.includes("${ADMIN_BOOT_SECRET:-"));
    assert.ok(!/^\s+ADMIN_DEV_MODE:/m.test(compose), "compose never sets the dev switch");
  });

  it("makes pre-flight and the Ansible pre-check gate the key and refuse the switch", () => {
    const preflight = readRepo("script/preflight.sh");
    assert.match(preflight, /ADMIN_TOKEN_KEY/);
    assert.match(preflight, /ADMIN_DEV_MODE/);
    const playbook = readRepo("deploy/ansible/playbook.yaml");
    assert.match(playbook, /ADMIN_TOKEN_KEY/);
    assert.match(playbook, /ADMIN_DEV_MODE/);
  });

  it("sets an explicit non-default ADMIN_TOKEN_KEY in all three e2e jobs and no switch", () => {
    const ci = readRepo(".github/workflows/ci.yml");
    const keyLines = ci.match(/ADMIN_TOKEN_KEY:\s*e2e-ci-token-key-[A-Za-z0-9]+/g) ?? [];
    assert.equal(keyLines.length, 3, "e2e-single-host, browser-e2e, and dom-diff each carry the key");
    assert.ok(!ci.includes("ADMIN_DEV_MODE"));
  });
});
