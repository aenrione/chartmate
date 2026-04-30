import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { getInsets } from 'tauri-plugin-safe-area-insets';

// env(safe-area-inset-*) returns 0 on Android WebView; inject real values via plugin.
function applyInsets() {
  getInsets().then(({top, right, bottom, left}) => {
    const el = document.documentElement;
    el.style.setProperty('--sat', `${top}px`);
    el.style.setProperty('--sar', `${right}px`);
    el.style.setProperty('--sab', `${bottom}px`);
    el.style.setProperty('--sal', `${left}px`);
  }).catch(() => {});
}
applyInsets();
window.addEventListener('resize', applyInsets);

function dispatchSpotifyCallback(url: string) {
  if (url.startsWith('chartmate://auth/callback')) {
    console.log('[deep-link] dispatching spotify-callback', url);
    window.dispatchEvent(new CustomEvent('spotify-callback', { detail: url }));
  }
}

// Check if the app was started via a deep link
getCurrent().then((urls) => {
  if (urls && urls.length > 0) {
    console.log('[deep-link] app started with URLs:', urls);
    for (const url of urls) {
      dispatchSpotifyCallback(url);
    }
  }
}).catch((err) => {
  console.error('[deep-link] getCurrent failed:', err);
});

// Listen for deep links while the app is running
onOpenUrl((urls) => {
  console.log('[deep-link] onOpenUrl fired:', urls);
  for (const url of urls) {
    dispatchSpotifyCallback(url);
  }
}).catch((err) => {
  console.error('[deep-link] onOpenUrl registration failed:', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
