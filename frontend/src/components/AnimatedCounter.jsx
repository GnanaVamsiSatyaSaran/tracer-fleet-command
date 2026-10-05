import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';

/**
 * AnimatedCounter: Smooth spring-based roll-over number counter using framer-motion.
 */
export default function AnimatedCounter({ value, decimals = 0, className = '' }) {
  const motionVal = useMotionValue(value || 0);
  const springVal = useSpring(motionVal, {
    damping: 24,
    stiffness: 180,
  });
  const spanRef = useRef(null);

  useEffect(() => {
    motionVal.set(value || 0);
  }, [value, motionVal]);

  useEffect(() => {
    return springVal.on('change', (latest) => {
      if (spanRef.current) {
        spanRef.current.textContent = Number(latest).toFixed(decimals);
      }
    });
  }, [springVal, decimals]);

  return (
    <span ref={spanRef} className={`tabular-nums font-mono ${className}`}>
      {Number(value || 0).toFixed(decimals)}
    </span>
  );
}
