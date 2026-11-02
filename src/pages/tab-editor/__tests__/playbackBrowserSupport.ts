import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Page} from '@playwright/experimental-ct-react';

export async function serveAlphaTabAssets(page: Page) {
  for (const file of ['alphaTab.worker.mjs', 'alphaTab.core.mjs', 'alphaTab.worklet.mjs']) {
    await page.route(`**/${file}`, route => route.fulfill({
      contentType: 'text/javascript',
      body: readFileSync(resolve('node_modules/@coderline/alphatab/dist', file)),
    }));
  }
  await page.route('**/font/*', route => route.fulfill({
    body: readFileSync(resolve('public/font', new URL(route.request().url()).pathname.split('/').at(-1)!)),
  }));
  await page.route('**/*.sf2', route => route.fulfill({
    contentType: 'application/octet-stream', body: readFileSync(resolve('public/soundfont/sonivox.sf2')),
  }));
}

export async function observeAudio(page: Page) {
  await page.evaluate(() => {
    const meters: AnalyserNode[] = [];
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination: AudioNode | AudioParam, ...args: number[]) {
      if (destination instanceof AudioDestinationNode) {
        const meter = this.context.createAnalyser();
        meter.fftSize = 2048;
        meters.push(meter);
        connect.call(this, meter, args[0] ?? 0, 0);
        connect.call(meter, destination, 0, args[1] ?? 0);
        return destination;
      }
      return Reflect.apply(connect, this, [destination, ...args]);
    } as typeof connect;
    (window as any).__readAudio = () => meters.map(meter => {
      const data = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(data);
      return meter.context.state !== 'running' ? 0 : Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    });
  });
}

export async function audioLevel(page: Page) {
  return page.evaluate(() => Math.max(0, ...(window as any).__readAudio()));
}

/** Deterministic external-provider boundary. The app's real YouTube component and sync run. */
export async function serveYouTubeProvider(page: Page) {
  // Streaming/autoplay policy belongs to the external provider. Unlock this
  // deterministic provider's audio on the same real document gestures as the UI.
  await page.evaluate(() => {
    const context = new AudioContext();
    (window as any).__youtubeTestContext = context;
    const unlock = () => { void context.resume(); };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);
  });
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({
    contentType: 'text/javascript',
    body: `
      window.__youtubePlayers = [];
      window.YT = {Player: class {
        constructor(element, options) {
          this.options = options; this.state = -1; this.time = 0; this.muted = false;
          this.context = window.__youtubeTestContext; this.gain = this.context.createGain();
          this.gain.connect(this.context.destination); this.gain.gain.value = 0;
          this.oscillator = this.context.createOscillator(); this.oscillator.frequency.value = 660;
          this.oscillator.connect(this.gain); this.oscillator.start();
          this.frame = document.createElement('iframe'); this.frame.title = 'YouTube test player';
          element.replaceWith(this.frame); window.__youtubePlayers.push(this);
          this.timer = setInterval(() => {if (this.state === 1) this.time += .05;}, 50);
          setTimeout(() => options.events.onReady({target:this}), 0);
        }
        playVideo() { this.context.resume(); this.state = 1; this.gain.gain.value = this.muted ? 0 : .1; this.options.events.onStateChange({data:1}); }
        pauseVideo() { this.state = 2; this.gain.gain.value = 0; this.options.events.onStateChange({data:2}); }
        seekTo(time) { this.time = time; }
        setPlaybackRate(rate) { this.rate = rate; }
        getCurrentTime() { return this.time; }
        getPlayerState() { return this.state; }
        mute() { this.muted = true; this.gain.gain.value = 0; }
        unMute() { this.muted = false; this.gain.gain.value = this.state === 1 ? .1 : 0; }
        getIframe() { return this.frame; }
        destroy() { this.destroyed = true; clearInterval(this.timer); this.context.close(); this.frame.remove(); }
      }};
      window.onYouTubeIframeAPIReady();
    `,
  }));
}
