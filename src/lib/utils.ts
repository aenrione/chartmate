import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sanitize a string for use as a filename. Keeps [A-Za-z0-9_-]; replaces everything else with `_`. */
export function sanitizeFilename(name: string, ext: string): string {
  return (name.trim() || 'tab').replace(/[^a-zA-Z0-9_-]/g, '_') + '.' + ext;
}
