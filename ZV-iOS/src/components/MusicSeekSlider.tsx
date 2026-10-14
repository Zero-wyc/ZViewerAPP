import Slider from '@react-native-community/slider';
import { useState, type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Slider>, 'onSlidingStart'>;

/** Keep native dragging independent of the continuously updating room clock. */
export function MusicSeekSlider({ value = 0, onSlidingComplete, ...props }: Props) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  return <Slider {...props} tapToSeek value={dragStart ?? value}
    onSlidingStart={setDragStart}
    onSlidingComplete={position => { setDragStart(null); onSlidingComplete?.(position); }} />;
}
