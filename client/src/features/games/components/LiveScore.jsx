import { useEffect, useRef, useState } from 'react';

/**
 * A score that shows it changed.
 *
 * Recording a basket moved the number silently — the one piece of feedback that
 * tells a tracker courtside "that tap landed" had no motion at all. Each digit
 * re-enters with a blurred slide (transitions-dev "number pop-in"), staggered
 * left to right, and only the digits that actually changed animate.
 */
export function LiveScore({ value, className = '' }) {
  const safeValue = Number(value) || 0;
  const digits = String(safeValue).split('');
  const previousRef = useRef(digits);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    const previous = previousRef.current.join('');
    if (previous !== digits.join('')) {
      // Re-keying the digits is the reflow: React unmounts and remounts them,
      // which restarts the animation instead of leaving it at its end state.
      setAnimationKey((current) => current + 1);
      previousRef.current = digits;
    }
  }, [digits]);

  const previousDigits = previousRef.current;

  return (
    <span className={`tsw-tnum inline-flex ${className}`}>
      {/* The animated digits are decorative duplicates. Keeping the whole value
          as real text means screen readers, DOM queries and copy-paste all see
          "24" rather than two separate glyph nodes. */}
      <span className="sr-only">{safeValue}</span>
      {digits.map((digit, index) => {
        // Right-align the comparison so 9 → 10 does not animate every digit.
        const offset = digits.length - previousDigits.length;
        const didChange = previousDigits[index - offset] !== digit;

        return (
          <span
            key={`${animationKey}-${index}`}
            aria-hidden="true"
            className={didChange ? 't-digit' : undefined}
            style={didChange ? { '--digit-index': index } : undefined}
          >
            {digit}
          </span>
        );
      })}
    </span>
  );
}
