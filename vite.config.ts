import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' plutôt que 'autoUpdate' : jamais de rechargement automatique
      // pendant une saisie en cours, l'utilisateur déclenche la mise à jour.
      registerType: 'prompt',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        id: '/freepilot',
        name: 'FreePilot — Pilotage financier',
        short_name: 'FreePilot',
        description:
          "Pilotage des finances pro et perso d'un auto-entrepreneur : CA encaissé, ARE, Urssaf, impôts et suivi client.",
        lang: 'fr',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#14213d',
        background_color: '#eef3f8',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
      devOptions: {
        // Permet de tester le service worker en `npm run dev`.
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
