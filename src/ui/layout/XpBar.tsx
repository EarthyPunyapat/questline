import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'ink';

interface XpBarProps {
  intoLevel: number;
  xpForNext: number;
  width?: number;
  animateMs?: number;
}

/** Animated XP bar: eases the filled cells toward the target ratio (~300ms). */
export function XpBar({ intoLevel, xpForNext, width = 26, animateMs = 300 }: XpBarProps): React.ReactElement {
  const targetRatio = xpForNext > 0 ? Math.min(1, intoLevel / xpForNext) : 1;
  const [ratio, setRatio] = useState(targetRatio);
  const raf = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = ratio;
    const t0 = Date.now();
    if (raf.current) clearInterval(raf.current);
    raf.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / animateMs);
      const eased = 1 - Math.pow(1 - p, 2); // ease-out quad
      setRatio(start + (targetRatio - start) * eased);
      if (p >= 1 && raf.current) {
        clearInterval(raf.current);
        raf.current = null;
      }
    }, 16);
    return () => {
      if (raf.current) clearInterval(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intoLevel, xpForNext]);

  const filled = Math.round(ratio * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return (
    <Text>
      <Text color="green">{bar}</Text>
      <Text dimColor>
        {' '}
        {intoLevel}/{xpForNext} XP ({Math.floor(targetRatio * 100)}%)
      </Text>
    </Text>
  );
}
