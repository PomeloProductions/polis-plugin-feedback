/**
 * Minimal ambient declaration for the `@polis/react` plugin surface this plugin
 * authors against. The real package is a private peer dependency supplied by the
 * host app (and externalized at build time), so we declare only the slice we use.
 *
 * Mirrors polis-react #99 (`definePlugin` / `PluginDefinition`).
 */
declare module '@polis/react' {
  import type { ComponentType } from 'react';

  export interface PluginDefinition {
    key: string;
    name?: string;
    version?: string;
    components?: Record<string, ComponentType<Record<string, unknown>>>;
    [extra: string]: unknown;
  }

  export function definePlugin(def: PluginDefinition): PluginDefinition;
  export function registerPlugin(def: PluginDefinition): void;
}
