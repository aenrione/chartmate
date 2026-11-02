import {existsSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, resolve as resolvePath} from 'node:path';

const SRC = resolvePath(fileURLToPath(import.meta.url), '../../../src');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function firstExisting(basePath) {
  if (existsSync(basePath) && !existsSync(`${basePath}.ts`)) return basePath;
  for (const extension of EXTENSIONS) {
    const candidate = `${basePath}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const found = firstExisting(resolvePath(SRC, specifier.slice(2)));
    if (found) return {url: pathToFileURL(found).href, shortCircuit: true};
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const found = firstExisting(resolvePath(parentDir, specifier));
    if (found) return {url: pathToFileURL(found).href, shortCircuit: true};
  }

  return nextResolve(specifier, context);
}
