import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.freepilot.mobile',
  appName: 'FreePilot',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
