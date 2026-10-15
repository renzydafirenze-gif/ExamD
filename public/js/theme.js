'use strict';

// Palet bersama; berlaku juga pada kartu dan opsi yang dibuat lewat JavaScript.
const darkNeutral = {
  50: '#23191c', 100: '#302126', 200: '#493038', 300: '#76515b',
  400: '#ba9ba5', 500: '#c5adb5', 600: '#d6c1c8', 700: '#e7d6dc',
  800: '#f3e7eb', 900: '#fff1f4', 950: '#fff7f9',
};
const redAccent = {
  50: '#35151e', 100: '#501e2a', 200: '#783143', 300: '#fda4af',
  400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c',
  800: '#9f1239', 900: '#881337',
};
const currentTheme = tailwind.config.theme || {};
tailwind.config = {
  ...tailwind.config,
  theme: {
    ...currentTheme,
    extend: {
      ...currentTheme.extend,
      colors: {
        ...currentTheme.extend?.colors,
        canvas: '#100c0e',
        stone: darkNeutral,
        gray: darkNeutral,
        teal: redAccent,
        indigo: redAccent,
        amber: { 50: '#352616', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#fcd34d' },
      },
    },
  },
};
