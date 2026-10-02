import type { ViewStyle } from 'react-native';

// Size the viewport with ordinary Yoga Views. Native ScrollView measurement
// must never decide whether the video/music column receives any screen space.
export const roomLayout = {
  body: { flex: 1, minHeight: 0, width: '100%', gap: 12 },
  wide: { flexDirection: 'row' },
  mediaFrame: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 0 },
  stackedMedia: { flexGrow: 0, flexShrink: 0, flexBasis: '48%' },
  stackedSidebar: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, width: '100%' },
  mediaScroll: { flex: 1, width: '100%', minHeight: 0 },
  sidebar: { width: 320, flexBasis: 320, flexGrow: 0, flexShrink: 0, minHeight: 0 },
} satisfies Record<string, ViewStyle>;
