import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

// Register deep-link handler at startup
onOpenUrl((urls) => {
  const url = urls[0];
  if (url?.startsWith('chartmate://auth/callback')) {
    window.dispatchEvent(new CustomEvent('spotify-callback', { detail: url }));
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
