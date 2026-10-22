import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as ScreenOrientation from 'expo-screen-orientation';
import { initialPlayerDisplay, PlayerDisplay, systemWindowDisplayPort, type PlayerDisplayState } from '@/lib/playerDisplay';

export type ScreenOrientationControl = Pick<PlayerDisplayState, 'available' | 'busy' | 'locked' | 'landscape' | 'error'> & { systemManaged?: boolean; toggle: () => Promise<void> };
const landscape = (orientation: ScreenOrientation.Orientation) => {
  if (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT) return true;
  if (orientation === ScreenOrientation.Orientation.PORTRAIT_UP || orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN) return false;
  return null;
};
export function usePlayerDisplay() {
  const systemManaged = Platform.OS === 'ios' && Platform.isPad;
  const [state, setState] = useState(() => { const window = Dimensions.get('window'); return initialPlayerDisplay(window.width > window.height); });
  const [controller] = useState(() => new PlayerDisplay(systemManaged ? systemWindowDisplayPort(() => Dimensions.get('window')) : {
    supported: async () => !Constants.expoVersion && (await Promise.all([ScreenOrientation.supportsOrientationLockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP), ScreenOrientation.supportsOrientationLockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)])).every(Boolean),
    landscape: async () => landscape(await ScreenOrientation.getOrientationAsync()),
    lock: value => ScreenOrientation.lockAsync(value === 'landscape' ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP),
    unlock: () => ScreenOrientation.unlockAsync(),
  }, setState, state.landscape));
  useEffect(() => {
    void controller.start();
    if (systemManaged) {
      const subscription = Dimensions.addEventListener('change', ({ window }) => controller.orientationChanged(window.width > window.height));
      return () => { subscription.remove(); void controller.dispose(); };
    }
    const subscription = ScreenOrientation.addOrientationChangeListener(event => { const value = landscape(event.orientationInfo.orientation); if (value !== null) controller.orientationChanged(value); });
    return () => { subscription.remove(); void controller.dispose(); };
  }, [controller, systemManaged]);
  const toggle = useCallback(() => controller.toggleOrientation(), [controller]);
  const toggleFullscreen = useCallback(() => controller.setFullscreen(!controller.snapshot.fullscreen), [controller]);
  const reset = useCallback(() => controller.reset(), [controller]);
  const orientation: ScreenOrientationControl = { ...state, systemManaged, toggle };
  const videoSize = useCallback((width: number, height: number) => controller.videoSize(width, height), [controller]);
  const resetVideoSize = useCallback(() => controller.resetVideoSize(), [controller]);
  return { videoSize, resetVideoSize, fullscreen: state.fullscreen, orientation, toggleFullscreen, reset };
}
