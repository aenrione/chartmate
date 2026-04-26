const _ua = navigator.userAgent;

// iPadOS 13+ disguises itself as a Mac in the UA string.
// maxTouchPoints > 1 distinguishes it from a real Mac (which reports 0).
const _isIpadOS = /Macintosh/i.test(_ua) && navigator.maxTouchPoints > 1;

/**
 * True when running on an actual mobile device (iOS / Android / iPadOS).
 * Uses the webview UA string — reliable in Tauri mobile builds.
 * Never use window.innerWidth / CSS breakpoints for capability gates.
 */
export const isMobileDevice: boolean = /iPhone|iPad|iPod|Android/i.test(_ua) || _isIpadOS;

export const isDesktop: boolean = !isMobileDevice;
