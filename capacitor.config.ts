import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zviewer.mobile',
  appName: 'ZViewer',
  webDir: 'dist',
  backgroundColor: '#111417',
  plugins: {
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'disable',
    },
  },
  android: {
    path: 'ZV-Android',
    allowMixedContent: true,
  },
}

export default config
