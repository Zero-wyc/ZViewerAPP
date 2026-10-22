import { createContext, forwardRef, useContext, useEffect, type ComponentRef, type ReactNode } from 'react';
import { Text as NativeText, useWindowDimensions, type TextProps } from 'react-native';

const FontScale = createContext(1);

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  useEffect(() => { if (__DEV__) console.info('[ZViewerFontScale]', { fontScale }); }, [fontScale]);
  return <FontScale.Provider value={fontScale}>{children}</FontScale.Provider>;
}

// Refresh only the native paragraph after a live Dynamic Type change. Keeping
// the surrounding component mounted preserves inputs, dialogs and media owners.
export const DynamicText = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function DynamicText(props, ref) {
  const scale = useContext(FontScale);
  return <NativeText {...props} key={scale} ref={ref} />;
});
