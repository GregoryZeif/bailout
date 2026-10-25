import type { SpaceKind, TokenId } from '../../shared/types';

/** Original, simple SVG tokens. */
export function TokenIcon({ token, size = 22, color = 'currentColor' }: { token: TokenId; size?: number; color?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true } as const;
  switch (token) {
    case 'avocado':
      return (
        <svg {...common}>
          <rect x="4" y="14" width="24" height="12" rx="3" fill="#d9a35b" stroke="#7a5230" strokeWidth="1.5" />
          <ellipse cx="16" cy="13" rx="9" ry="6" fill="#6b9a3a" stroke="#355e1d" strokeWidth="1.5" />
          <circle cx="16" cy="13" r="2.6" fill="#7a5230" />
          <circle cx="27" cy="6" r="3" fill={color} />
        </svg>
      );
    case 'cart':
      return (
        <svg {...common}>
          <path d="M3 6h4l3 14h15l3-10H9" fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="12" cy="25" r="2.6" fill={color} />
          <circle cx="23" cy="25" r="2.6" fill={color} />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...common}>
          <rect x="4" y="10" width="24" height="16" rx="3" fill={color} />
          <path d="M12 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" fill="none" stroke={color} strokeWidth="2.4" />
          <rect x="4" y="16" width="24" height="2" fill="rgba(0,0,0,.25)" />
          <rect x="14" y="15" width="4" height="4" rx="1" fill="#f4ecd8" />
        </svg>
      );
    case 'piggy':
      return (
        <svg {...common}>
          <ellipse cx="16" cy="18" rx="11" ry="8" fill={color} />
          <circle cx="25" cy="17" r="3.5" fill={color} stroke="rgba(0,0,0,.3)" />
          <rect x="9" y="24" width="3" height="5" rx="1" fill={color} />
          <rect x="18" y="24" width="3" height="5" rx="1" fill={color} />
          <path d="M11 10l2 3M14 9l-1 3" stroke={color} strokeWidth="2" />
          <rect x="13" y="11" width="6" height="1.8" rx=".9" fill="#14213d" />
          <circle cx="21" cy="15" r="1.2" fill="#14213d" />
        </svg>
      );
    case 'drone':
      return (
        <svg {...common}>
          <rect x="11" y="13" width="10" height="6" rx="2" fill={color} />
          <path d="M11 15L5 9M21 15l6-6M11 17l-6 6M21 17l6 6" stroke={color} strokeWidth="2" />
          {[[5, 9], [27, 9], [5, 23], [27, 23]].map(([x, y]) => (
            <ellipse key={`${x}${y}`} cx={x} cy={y} rx="4.5" ry="1.4" fill={color} />
          ))}
          <rect x="13" y="20" width="6" height="5" fill="#d9a35b" stroke="#7a5230" />
        </svg>
      );
    case 'coffee':
      return (
        <svg {...common}>
          <path d="M8 9h16l-2 19H10z" fill={color} />
          <rect x="7" y="6" width="18" height="4" rx="1.5" fill="#f4ecd8" stroke={color} strokeWidth="1.5" />
          <rect x="9.5" y="15" width="13" height="5" fill="#f4ecd8" />
          <text x="16" y="19.4" fontSize="5" textAnchor="middle" fill="#14213d" fontWeight="700">$9</text>
        </svg>
      );
  }
}

export function SpaceIcon({ kind, size = 22 }: { kind: SpaceKind; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true } as const;
  switch (kind) {
    case 'chance':
      return (
        <svg {...p}>
          <rect x="4" y="6" width="24" height="20" rx="2" fill="#f4ecd8" stroke="#14213d" strokeWidth="2" />
          <rect x="7" y="9" width="18" height="4" fill="#c0392b" />
          <path d="M7 16h8M7 19h8M7 22h8M18 16h7v6h-7z" stroke="#14213d" strokeWidth="1.5" fill="none" />
        </svg>
      );
    case 'community':
      return (
        <svg {...p}>
          <path d="M3 16l6-5 5 3 4-3 5 2 6 3-8 8-4-2-3 2z" fill="#5b7f62" stroke="#14213d" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M14 14l5 5M12 17l4 4" stroke="#14213d" strokeWidth="1.4" />
        </svg>
      );
    case 'propertyTax':
    case 'emergencyTax':
      return (
        <svg {...p}>
          <path d="M8 4h12l5 5v19H8z" fill="#f4ecd8" stroke="#14213d" strokeWidth="2" />
          <text x="16.5" y="22" fontSize="13" fontWeight="900" textAnchor="middle" fill="#c0392b">%</text>
        </svg>
      );
    case 'infra':
      return (
        <svg {...p}>
          <path d="M4 26L13 6h6l9 20z" fill="#5c6b7a" />
          <path d="M16 9v3M16 15v3M16 21v3" stroke="#f4ecd8" strokeWidth="2" />
        </svg>
      );
    case 'utility':
      return (
        <svg {...p}>
          <path d="M18 3L7 18h7l-2 11 11-15h-7z" fill="#d8b13a" stroke="#14213d" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'jail':
      return (
        <svg {...p}>
          <path d="M16 4l11 6H5z" fill="#14213d" />
          <rect x="6" y="11" width="20" height="3" fill="#14213d" />
          {[8, 13, 18, 23].map((x) => <rect key={x} x={x} y="14" width="2" height="10" fill="#14213d" />)}
          <rect x="5" y="24" width="22" height="4" fill="#14213d" />
        </svg>
      );
    case 'bailout':
      return (
        <svg {...p}>
          <circle cx="16" cy="16" r="11" fill="none" stroke="#c0392b" strokeWidth="5" />
          <circle cx="16" cy="16" r="11" fill="none" stroke="#f4ecd8" strokeWidth="5" strokeDasharray="8.6 8.6" />
          <text x="16" y="20" fontSize="10" fontWeight="900" textAnchor="middle" fill="#14213d">$</text>
        </svg>
      );
    case 'goToJail':
      return (
        <svg {...p}>
          <rect x="4" y="10" width="24" height="16" rx="2" fill="#c0392b" />
          <text x="16" y="21.5" fontSize="9" fontWeight="900" textAnchor="middle" fill="#f4ecd8">§</text>
          <path d="M10 10V7h12v3" stroke="#14213d" strokeWidth="2" fill="none" />
        </svg>
      );
    case 'start':
      return (
        <svg {...p}>
          <path d="M4 16h18M15 8l8 8-8 8" stroke="#c0392b" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x="26" y="12" fontSize="9" fontWeight="900" fill="#5b7f62">$</text>
        </svg>
      );
    default:
      return null;
  }
}

const PIPS: Record<number, [number, number][]> = {
  1: [[16, 16]],
  2: [[9, 9], [23, 23]],
  3: [[9, 9], [16, 16], [23, 23]],
  4: [[9, 9], [23, 9], [9, 23], [23, 23]],
  5: [[9, 9], [23, 9], [16, 16], [9, 23], [23, 23]],
  6: [[9, 9], [23, 9], [9, 16], [23, 16], [9, 23], [23, 23]],
};

export function Die({ value, rolling, size = 40 }: { value: number; rolling?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`die${rolling ? ' rolling' : ''}`} role="img" aria-label={String(value)}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="6" fill="#f4ecd8" stroke="#14213d" strokeWidth="2" />
      {(PIPS[value] ?? PIPS[1]).map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.8" fill={value === 1 ? '#c0392b' : '#14213d'} />)}
    </svg>
  );
}
