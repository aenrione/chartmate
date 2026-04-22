const _ua = navigator.userAgent;

/**
 * True when running on an actual mobile device (iOS / Android).
 * Uses the webview UA string — reliable in Tauri mobile builds.
 * Never use window.innerWidth / CSS breakpoints for capability gates.
 */
export const isMobileDevice: boolean = /iPhone|iPad|iPod|Android/i.test(_ua);

export const isDesktop: boolean = !isMobileDevice;
