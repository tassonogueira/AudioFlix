import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  threshold?: number;
  onLongPress: () => void;
  onClick?: () => void;
}

export function useLongPress({
  threshold = 500,
  onLongPress,
  onClick
}: UseLongPressOptions) {
  const isLongPressActive = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      isLongPressActive.current = false;
      timerRef.current = setTimeout(() => {
        isLongPressActive.current = true;
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate?.(50);
          } catch {}
        }
        onLongPress();
      }, threshold);
    },
    [onLongPress, threshold]
  );

  const clear = useCallback(
    (e: React.MouseEvent | React.TouchEvent, shouldTriggerClick = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (shouldTriggerClick && !isLongPressActive.current && onClick) {
        onClick();
      }
    },
    [onClick]
  );

  return {
    onMouseDown: (e: React.MouseEvent) => start(e),
    onMouseUp: (e: React.MouseEvent) => clear(e, true),
    onMouseLeave: (e: React.MouseEvent) => clear(e, false),
    onTouchStart: (e: React.TouchEvent) => start(e),
    onTouchEnd: (e: React.TouchEvent) => clear(e, true),
    onTouchCancel: (e: React.TouchEvent) => clear(e, false)
  };
}
