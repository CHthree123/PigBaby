import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pigbaby.app',
  appName: 'PigBaby',
  webDir: 'dist',
  plugins: {
    Preferences: {},
  },
};

export default config;
