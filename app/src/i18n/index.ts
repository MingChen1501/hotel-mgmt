// Catalogue layer for the /app/ migration shell (Refs #292, ADR-0003).
//
// The canonical `messages/en.json` catalogue is imported as a static
// module, so Vite bundles it into `dist/` at build time: the Vue app
// serves every string offline over the LAN with no CDN and no runtime
// fetch. There is deliberately no vendored copy inside `app/` — the
// single source of truth stays `messages/en.json`, and this module is
// a read-only consumer (it owns no keys and edits none).
//
// `t()` preserves the `DeskMessages.msg(key, params, fallback)`
// semantics from `frontend/messages.js` exactly:
// - A known key resolves to its pattern with `{param}` placeholders
//   substituted from `params`; placeholders with no matching param
//   are left intact.
// - An unknown key returns the explicit `fallback` when given, else
//   `"message-missing:<key>"`.
// Behaviour never branches on resolved wording: error paths switch
// on envelope codes, as before.
import catalogueDoc from '../../../messages/en.json';

interface CatalogueDocument {
  locale: string;
  messages: Record<string, string>;
}

const document = catalogueDoc as CatalogueDocument;
const catalogue: Record<string, string> = document.messages;

export type MessageParams = Record<string, unknown>;

const PLACEHOLDER_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

function substitute(pattern: string, params: MessageParams): string {
  return pattern.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

export function t(key: string, params: MessageParams = {}, fallback?: string): string {
  const pattern = catalogue[key];
  if (pattern === undefined) {
    return fallback === undefined ? `message-missing:${key}` : fallback;
  }
  return substitute(pattern, params);
}

export function catalogueLocale(): string {
  return document.locale;
}

export function hasMessage(key: string): boolean {
  return catalogue[key] !== undefined;
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $t: typeof t;
  }
}
