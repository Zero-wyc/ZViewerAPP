import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '@/state/appearance';
import { useMediaPalette } from './MediaPanelUi';

/** A right-edge overlay, matching the music side dock without resizing the player. */
export function RoomSideDrawer({ visible, close, title, children }: { visible: boolean; close: () => void; title: string; children: ReactNode }) {
  const p = useMediaPalette(); const theme = useAppearance(); const insets = useSafeAreaInsets(); const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState(visible); const [offset] = useState(() => new Animated.Value(visible ? 0 : 1));
  const wasVisible = useRef(visible);
  const panelWidth = Math.min(344, Math.max(0, width - insets.left - insets.right - 24));
  const panelHeight = Math.min(376, height * .42 + 16, Math.max(0, height - insets.top - insets.bottom - 48));
  const dismiss = useCallback(() => { Keyboard.dismiss(); close(); }, [close]);
  useEffect(() => {
    let current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the native modal mounted until its closing animation finishes.
    if (visible) setShown(true); else if (wasVisible.current) Keyboard.dismiss();
    wasVisible.current = visible;
    const animation = Animated.timing(offset, { toValue: visible ? 0 : 1, duration: theme.preferences.reduceMotion ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (current && finished && !visible) setShown(false); });
    return () => { current = false; animation.stop(); };
  }, [visible, offset, theme.preferences.reduceMotion]);
  const swipe = useMemo(() => {
    const restore = () => Animated.timing(offset, { toValue: 0, duration: theme.preferences.reduceMotion ? 0 : 160, useNativeDriver: true }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dx > 12 && gesture.dx > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => offset.stopAnimation(),
      onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, Math.min(1, gesture.dx / Math.max(1, panelWidth)))),
      onPanResponderRelease: (_, gesture) => { if (gesture.dx > panelWidth * .22 || gesture.dx > 12 && gesture.vx > .55) dismiss(); else restore(); },
      onPanResponderTerminate: restore,
    });
  }, [dismiss, offset, panelWidth, theme.preferences.reduceMotion]);
  if (!shown) return null;
  return <Modal transparent visible animationType="none" presentationStyle="overFullScreen" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={dismiss}>
    <KeyboardAvoidingView testID="room-discussion-keyboard" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Pressable testID="room-discussion-backdrop" accessibilityRole="button" accessibilityLabel="收起房间评论" onPress={dismiss} onAccessibilityTap={dismiss} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,.2)' }]} />
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }}>
        <Animated.View testID="room-discussion-drawer" accessibilityViewIsModal onAccessibilityEscape={dismiss} style={{ width: panelWidth, height: panelHeight, maxHeight: '100%', flexShrink: 1, marginRight: Math.max(6, insets.right), backgroundColor: p.surface, borderColor: p.line, borderWidth: .5, borderRadius: 20, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,.22)', transform: [{ translateX: offset.interpolate({ inputRange: [0, 1], outputRange: [0, panelWidth + Math.max(6, insets.right)] }) }] }}>
          <View testID="room-discussion-drag" {...swipe.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 6, minHeight: 52, borderBottomWidth: .5, borderColor: p.line }}><Text accessibilityRole="header" style={{ flex: 1, color: p.text, fontSize: 16, fontWeight: '600' }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭房间评论" onPress={dismiss} onAccessibilityTap={dismiss} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Feather name="x" size={20} color={p.muted} /></Pressable></View>
          {children}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

/** Narrow touch handle used by the reference mobile music dock. */
export function RoomCommentButton({ onPress }: { onPress: () => void }) {
  const p = useMediaPalette();
  const swipe = useMemo(() => {
    return PanResponder.create({ onMoveShouldSetPanResponder: (_, gesture) => gesture.dx < -12 && -gesture.dx > Math.abs(gesture.dy) * 1.5, onPanResponderRelease: (_, gesture) => { if (gesture.dx < -18) onPress(); } });
  }, [onPress]);
  return <Pressable testID="room-comment-edge" {...swipe.panHandlers} accessibilityRole="button" accessibilityLabel="展开房间评论" accessibilityHint="轻点或向左滑动展开侧栏" accessibilityState={{ expanded: false }} onPress={onPress} onAccessibilityTap={onPress} style={{ position: 'absolute', right: 0, top: '44%', zIndex: 45, width: 44, height: 84, alignItems: 'flex-end', justifyContent: 'center' }}><View style={{ width: 14, height: 64, borderTopLeftRadius: 7, borderBottomLeftRadius: 7, backgroundColor: p.container, borderColor: p.line, borderWidth: .5, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 3, height: 28, borderRadius: 2, backgroundColor: p.muted }} /></View></Pressable>;
}
