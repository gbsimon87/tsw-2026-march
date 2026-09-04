import { MOBILE_LANDSCAPE_QUERY } from './src/lib/mediaQueries.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Registered as a screen rather than an addVariant plugin on purpose:
      // extended screens emit AFTER sm/md/lg, so `landscape-compact:py-1` beats
      // the `sm:py-4` sitting on the same element. A plugin variant emits before
      // them and silently loses every such conflict.
      // Shares one definition with the JS listener - see src/lib/mediaQueries.js.
      screens: {
        'landscape-compact': { raw: MOBILE_LANDSCAPE_QUERY },
      },
      keyframes: {
        'row-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'row-in': 'row-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
