/**
 * Lets plain `node` run the app's TypeScript modules: resolves the `@/` alias
 * to ./src and fills in the extension Vite and tsc let us leave off.
 *
 * Node runs the TypeScript itself (type stripping); this only teaches it how
 * the project's module specifiers are spelled.
 *
 *   node --import ./scripts/chart-export/loader.mjs scripts/chart-export/export-charts.ts
 */

import {register} from 'node:module';

register('./resolver.mjs', import.meta.url);
