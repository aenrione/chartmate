import {defineConfig, devices} from '@playwright/experimental-ct-react';
import {fileURLToPath} from 'url';
import path from 'path';
import {alphaTab} from '@coderline/alphatab-vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.ct.{ts,tsx}',
  fullyParallel: true,
  retries: 0,
  use: {
    ctPort: 3103,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    ctViteConfig: {
      // alphaTab() copies the worker/worklet files so AlphaTab's player can initialize.
      // Without this, alphaTab.worker.mjs is missing and playerReady never fires.
      plugins: [alphaTab()],
      resolve: {
        alias: {'@': path.resolve(__dirname, './src')},
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Allow Web Audio API in headless Chromium without a real user gesture.
          // Without this flag api.play() never resumes the AudioContext and
          // playerStateChanged(1) is never fired.
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
    {
      name: 'webkit',
      use: {...devices['Desktop Safari']},
    },
  ],
});
