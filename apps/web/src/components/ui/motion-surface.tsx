import type { ComponentProps } from 'react';
import { motion } from 'motion/react';
export function MotionSurface(props: Omit<ComponentProps<'div'>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'>) {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return <div {...props} />;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return <motion.div {...props} initial={reduced ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} />;
}
