'use client';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

export default function Spinner({ size = 'md', color = '#3b82f6' }: SpinnerProps) {
  const sizeMap = {
    sm: { wrapper: 20, blade: { width: 2, height: 6, margin: -8 } },
    md: { wrapper: 32, blade: { width: 3, height: 9, margin: -12 } },
    lg: { wrapper: 48, blade: { width: 4, height: 12, margin: -18 } },
  };

  const s = sizeMap[size];

  return (
    <div className="ios-spinner" style={{ width: s.wrapper, height: s.wrapper }}>
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="ios-spinner-blade"
          style={{
            width: s.blade.width,
            height: s.blade.height,
            marginLeft: -s.blade.width / 2,
            marginTop: s.blade.margin,
            transformOrigin: `center ${-s.blade.margin + s.blade.height / 2}px`,
            transform: `rotate(${i * 30}deg)`,
            animationDelay: `${-1.2 + i * 0.1}s`,
            backgroundColor: color,
          }}
        />
      ))}
      <style jsx>{`
        .ios-spinner {
          position: relative;
        }
        .ios-spinner-blade {
          position: absolute;
          left: 50%;
          top: 50%;
          border-radius: 3px;
          animation: ios-spinner-fade 1.2s linear infinite;
        }
        @keyframes ios-spinner-fade {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
