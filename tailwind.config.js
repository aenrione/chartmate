import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        headline: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        label: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* Surface hierarchy */
        surface: {
          DEFAULT: 'var(--surface)',
          dim: 'var(--surface-dim)',
          bright: 'var(--surface-bright)',
          'container-lowest': 'var(--surface-container-lowest)',
          'container-low': 'var(--surface-container-low)',
          container: 'var(--surface-container)',
          'container-high': 'var(--surface-container-high)',
          'container-highest': 'var(--surface-container-highest)',
          variant: 'var(--surface-variant)',
          tint: 'var(--surface-tint)',
        },
        'on-surface': {
          DEFAULT: 'var(--on-surface)',
          variant: 'var(--on-surface-variant)',
        },
        background: 'var(--background)',
        'on-background': 'var(--on-background)',

        /* Primary – Indigo Violet */
        primary: {
          DEFAULT: 'var(--primary)',
          container: 'var(--primary-container)',
          fixed: 'var(--primary-fixed)',
          'fixed-dim': 'var(--primary-fixed-dim)',
        },
        'on-primary': {
          DEFAULT: 'var(--on-primary)',
          container: 'var(--on-primary-container)',
          fixed: 'var(--on-primary-fixed)',
          'fixed-variant': 'var(--on-primary-fixed-variant)',
        },
        'inverse-primary': 'var(--inverse-primary)',

        /* Secondary – Teal (Guitar) */
        secondary: {
          DEFAULT: 'var(--secondary)',
          container: 'var(--secondary-container)',
          fixed: 'var(--secondary-fixed)',
          'fixed-dim': 'var(--secondary-fixed-dim)',
        },
        'on-secondary': {
          DEFAULT: 'var(--on-secondary)',
          container: 'var(--on-secondary-container)',
          fixed: 'var(--on-secondary-fixed)',
          'fixed-variant': 'var(--on-secondary-fixed-variant)',
        },

        /* Tertiary – Warm Orange (Drums) */
        tertiary: {
          DEFAULT: 'var(--tertiary)',
          container: 'var(--tertiary-container)',
          fixed: 'var(--tertiary-fixed)',
          'fixed-dim': 'var(--tertiary-fixed-dim)',
        },
        'on-tertiary': {
          DEFAULT: 'var(--on-tertiary)',
          container: 'var(--on-tertiary-container)',
          fixed: 'var(--on-tertiary-fixed)',
          'fixed-variant': 'var(--on-tertiary-fixed-variant)',
        },

        /* Error */
        error: {
          DEFAULT: 'var(--error)',
          container: 'var(--error-container)',
        },
        'on-error': {
          DEFAULT: 'var(--on-error)',
          container: 'var(--on-error-container)',
        },

        /* Outline */
        outline: {
          DEFAULT: 'var(--outline)',
          variant: 'var(--outline-variant)',
        },

        /* Inverse */
        'inverse-surface': 'var(--inverse-surface)',
        'inverse-on-surface': 'var(--inverse-on-surface)',

        /* Legacy semantic tokens (for existing components) */
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'studio-sm': '0 1px 2px rgba(0, 0, 0, 0.2)',
        studio: '0 2px 8px rgba(0, 0, 0, 0.3)',
        'studio-md': '0 4px 16px rgba(0, 0, 0, 0.35)',
        'studio-lg': '0 12px 32px rgba(0, 0, 0, 0.4)',
        'studio-xl': '0 24px 48px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
