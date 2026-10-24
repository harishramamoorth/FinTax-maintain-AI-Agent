const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), bg2: c('bg2'), panel: c('panel'), ink: c('text'), muted: c('muted'), faint: c('faint'),
        line: c('line'), cyan: c('cyan'), blue: c('blue'), violet: c('violet'), magenta: c('magenta'),
        ok: c('green'), warn: c('amber'), bad: c('red'),
      },
      fontFamily: {
        sans: ['"Space Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--cyan) / .35), 0 0 28px -4px rgb(var(--cyan) / .45)',
        panel: '0 1px 0 0 rgb(255 255 255 / .04) inset, 0 18px 40px -24px rgb(0 0 0 / .6)',
      },
      borderRadius: { xl2: '1.125rem' },
    },
  },
  plugins: [],
};
