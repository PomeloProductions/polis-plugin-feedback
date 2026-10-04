/**
 * Test-only stub of `@polis/react`'s plugin surface.
 *
 * The real package is private and provided by the host app at build time (it is
 * externalized in vite.config.ts). Tests alias `@polis/react` to this stub so
 * `plugin.ts` can be imported in isolation without the live package. `definePlugin`
 * is an identity helper in the real contract (polis-react #99), so this matches.
 */
export function definePlugin<T>(def: T): T {
  return def;
}
