import type { ViewStyle } from 'react-native';

// Growth belongs to the remaining viewport or to an explicit horizontal row.
// A growing button inside an unbounded column consumes the native screen height.
export const homeLayout = {
  root: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', flexShrink: 0, paddingHorizontal: 16, paddingVertical: 8 },
  scroll: { flex: 1, minHeight: 0 },
  action: { minHeight: 44, paddingVertical: 10, flexGrow: 0, flexShrink: 0 },
  rowAction: { flexGrow: 1, flexBasis: 0, minWidth: 0 },
} satisfies Record<string, ViewStyle>;
