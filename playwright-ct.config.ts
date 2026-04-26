import {defineConfig, devices} from '@playwright/experimental-ct-react';
import {fileURLToPath} from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.ct.{ts,tsx}',
  fullyParallel: true,
  retries: 0,
  use: {
    ctPort: 3101,
    ctViteConfig: {
      resolve: {
        alias: {'@': path.resolve(__dirname, './src')},
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
    {
      name: 'webkit',
      use: {...devices['Desktop Safari']},
    },
  ],
});
