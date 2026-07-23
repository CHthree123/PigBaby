import { useMemo } from 'react';

interface Props {
  value: number;
  prefix?: string;
  decimals?: number;
}

function DigitRoll({ digit }: { digit: number }) {
  return (
    <span className="anim-digit-wrap">
      <span className="anim-digit-roll" style={{ transform: `translateY(-${digit}em)` }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="anim-digit-cell">{n}</span>
        ))}
      </span>
    </span>
  );
}

export default function AnimatedNumber({ value, prefix = '', decimals = 2 }: Props) {
  const formatted = useMemo(() => {
    const s = value.toFixed(decimals);
    const dotIdx = s.indexOf('.');
    return {
      intDigits: s.substring(0, dotIdx).replace('-', '').split('').map(Number),
      decDigits: s.substring(dotIdx + 1).split('').map(Number),
      negative: value < 0,
      dot: dotIdx >= 0,
    };
  }, [value, decimals]);

  return (
    <span className="anim-number">
      {prefix && <span className="anim-number-prefix">{prefix}</span>}
      {formatted.negative && <span className="anim-number-sign">−</span>}
      <span className="anim-number-digits">
        {formatted.intDigits.map((d, i) => (
          <DigitRoll key={`i-${i}`} digit={d} />
        ))}
      </span>
      {formatted.dot && (
        <>
          <span className="anim-number-dot">.</span>
          <span className="anim-number-digits">
            {formatted.decDigits.map((d, i) => (
              <DigitRoll key={`d-${i}`} digit={d} />
            ))}
          </span>
        </>
      )}
    </span>
  );
}
