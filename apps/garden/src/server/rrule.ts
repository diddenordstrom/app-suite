import { createRequire } from 'node:module';

/**
 * rrule ships its ESM build only through the bundler-only "module" field, so Node (and tsx) load its UMD
 * build, which has no named exports. Requiring it gives the same object everywhere: Node, tsx, vitest and
 * the esbuild server bundle (where rrule stays an external dependency).
 */
const rrule = createRequire(import.meta.url)('rrule') as typeof import('rrule');

export const { RRule } = rrule;
