/**
 * Ink-sketch caricature of the satirical "Bibi Netanyahoo" for the main menu poster.
 * Pure SVG: a displacement filter roughens every stroke so it reads as hand-drawn.
 */
import { useId } from 'react';

export function BibiSketch({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  const ink = '#1a1a2a';
  // Unique SVG ids, so two sketches on one page never share filters or patterns.
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const ref = (name: string) => `url(#${id(name)})`;
  return (
    <svg className={className} viewBox="0 0 320 360" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-labelledby': id('title') })}>
      {!decorative && <title id={id('title')}>Caricature sketch of Bibi Netanyahoo holding a bailout money bag</title>}
      <defs>
        <filter id={id('rough')} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        <pattern id={id('hatch')} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={ink} strokeWidth="1.1" opacity="0.55" />
        </pattern>
        <pattern id={id('hatch-light')} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={ink} strokeWidth="0.8" opacity="0.3" />
        </pattern>
        <radialGradient id={id('sun')} cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#d8b13a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d8b13a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* propaganda sunburst */}
      <g opacity="0.22">
        {Array.from({ length: 18 }, (_, i) => (
          <path key={i} d="M160 150 L150 -40 L170 -40 Z" fill="#c0392b" transform={`rotate(${i * 20} 160 150)`} />
        ))}
      </g>
      <circle cx="160" cy="150" r="150" fill={ref('sun')} />

      <g filter={ref('rough')} stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        {/* suit */}
        <path d="M30 360 C40 300 80 276 122 266 L160 300 L198 266 C240 276 280 300 290 360 Z" fill="#24427a" strokeWidth="3" />
        <path d="M30 360 C40 300 80 276 122 266 L160 300 L198 266 C240 276 280 300 290 360 Z" fill={ref('hatch')} stroke="none" />
        {/* lapels */}
        <path d="M122 266 L146 330 L160 300 Z" fill="#1c2c4f" strokeWidth="2.5" />
        <path d="M198 266 L174 330 L160 300 Z" fill="#1c2c4f" strokeWidth="2.5" />
        {/* shirt and tie */}
        <path d="M134 262 L160 300 L186 262 Z" fill="#fbf6ea" strokeWidth="2.5" />
        <path d="M152 274 L168 274 L172 286 L164 292 L174 352 L160 360 L146 352 L156 292 L148 286 Z" fill="#c0392b" strokeWidth="2.5" />
        {/* lapel pin: a tiny dollar sign */}
        <circle cx="210" cy="294" r="7" fill="#d8b13a" strokeWidth="2" />
        <text x="210" y="298.5" textAnchor="middle" fontSize="11" fontWeight="900" fill={ink} stroke="none" fontFamily="Georgia, serif">$</text>

        {/* neck */}
        <path d="M128 232 C130 252 132 262 140 268 L180 268 C188 262 190 252 192 232" fill="#efd3ad" strokeWidth="3" />

        {/* ears */}
        <path d="M95 152 C80 146 78 176 90 186 C96 190 100 186 101 180" fill="#efd3ad" strokeWidth="3" />
        <path d="M225 152 C240 146 242 176 230 186 C224 190 220 186 219 180" fill="#efd3ad" strokeWidth="3" />

        {/* head: broad, heavy-jawed */}
        <path d="M100 118 C100 70 130 52 160 52 C192 52 222 70 222 118 C224 160 222 196 206 220 C192 240 176 248 160 248 C144 248 128 240 114 220 C98 196 96 160 100 118 Z" fill="#f4dcb8" strokeWidth="3.2" />
        {/* cheek and jowl shading */}
        <path d="M108 170 C110 205 128 232 150 242 C130 236 110 214 106 186 Z" fill={ref('hatch-light')} stroke="none" />
        <path d="M214 170 C212 205 194 232 172 242 C192 236 212 214 216 186 Z" fill={ref('hatch-light')} stroke="none" />
        <path d="M120 206 C126 222 136 232 146 238" fill="none" strokeWidth="1.8" />
        <path d="M200 206 C194 222 184 232 174 238" fill="none" strokeWidth="1.8" />

        {/* swept-back silver hair, full at the sides, high forehead */}
        <path d="M98 136 C92 96 104 62 136 48 C158 38 190 40 210 54 C230 68 230 100 224 136 C220 116 216 100 208 92 C196 80 176 76 160 78 C140 80 118 88 108 104 C102 114 100 124 98 136 Z" fill="#c9c9c4" strokeWidth="3" />
        <path d="M118 84 C134 66 168 58 196 70" fill="none" strokeWidth="1.6" />
        <path d="M112 98 C130 76 170 68 204 82" fill="none" strokeWidth="1.6" />
        <path d="M108 112 C116 96 132 88 150 84" fill="none" strokeWidth="1.4" />
        <path d="M214 112 C210 98 200 90 186 86" fill="none" strokeWidth="1.4" />

        {/* forehead lines */}
        <path d="M134 104 C150 98 172 98 188 104" fill="none" strokeWidth="1.5" />
        <path d="M138 112 C152 107 170 107 184 112" fill="none" strokeWidth="1.3" />

        {/* heavy, slightly raised brows */}
        <path d="M118 132 C128 122 142 122 150 128" fill="none" strokeWidth="5" />
        <path d="M170 128 C178 120 194 120 204 130" fill="none" strokeWidth="5" />

        {/* eyes: narrow, knowing, with bags */}
        <path d="M124 142 C130 136 142 136 148 142 C142 146 130 146 124 142 Z" fill="#fbf6ea" strokeWidth="2" />
        <path d="M172 142 C178 136 190 136 196 142 C190 146 178 146 172 142 Z" fill="#fbf6ea" strokeWidth="2" />
        <circle cx="138" cy="141" r="3" fill={ink} stroke="none" />
        <circle cx="184" cy="141" r="3" fill={ink} stroke="none" />
        <path d="M126 152 C134 156 142 156 148 152" fill="none" strokeWidth="1.4" />
        <path d="M172 152 C180 156 188 156 196 152" fill="none" strokeWidth="1.4" />

        {/* big rounded nose */}
        <path d="M158 146 C156 162 150 176 148 184 C146 192 154 198 162 196 C170 198 178 192 174 184" fill="none" strokeWidth="2.8" />
        <path d="M150 188 C152 192 156 192 158 190" fill="none" strokeWidth="1.6" />
        <path d="M166 190 C168 192 172 192 174 188" fill="none" strokeWidth="1.6" />

        {/* smug grin */}
        <path d="M132 210 C146 224 176 226 192 208" fill="#fbf6ea" strokeWidth="2.8" />
        <path d="M134 211 C150 216 174 216 190 209" fill="none" strokeWidth="1.4" />
        <path d="M126 204 C128 208 130 210 133 211" fill="none" strokeWidth="2" />
        <path d="M196 202 C195 206 193 208 191 209" fill="none" strokeWidth="2" />
        {/* chin */}
        <path d="M148 236 C156 240 166 240 174 236" fill="none" strokeWidth="1.6" />

        {/* raised hand with a money bag */}
        <path d="M240 320 C258 296 268 270 272 246" fill="none" strokeWidth="22" stroke={ink} />
        <path d="M240 320 C258 296 268 270 272 246" fill="none" strokeWidth="16" stroke="#24427a" />
        <path d="M262 258 L282 262" fill="none" strokeWidth="2" />
        <path d="M262 236 C258 226 268 220 274 226 C282 220 290 228 284 238 C286 248 276 254 268 250 C260 250 258 242 262 236 Z" fill="#efd3ad" strokeWidth="2.6" />
        <path d="M276 226 C272 212 266 206 262 200" fill="none" strokeWidth="2.6" />
        <path d="M244 196 C232 176 236 152 256 140 C252 134 254 126 262 126 C270 122 280 124 282 132 C290 134 292 142 286 146 C306 160 306 186 292 200 C278 214 256 212 244 196 Z" fill="#ebdfc2" strokeWidth="3" />
        <path d="M244 196 C232 176 236 152 256 140 C268 148 270 176 256 202 Z" fill={ref('hatch-light')} stroke="none" />
        <path d="M256 140 C264 144 276 144 286 146" fill="none" strokeWidth="2.4" />
        <text x="270" y="186" textAnchor="middle" fontSize="38" fontWeight="900" fill="#5b7f62" stroke={ink} strokeWidth="1.2" fontFamily="Georgia, serif">$</text>
      </g>

      {/* rubber stamp */}
      <g transform="rotate(-12 60 40)" filter={ref('rough')}>
        <rect x="8" y="18" width="104" height="40" rx="4" fill="rgba(251,246,234,0.6)" stroke="#c0392b" strokeWidth="3.5" />
        <rect x="13" y="23" width="94" height="30" rx="2" fill="none" stroke="#c0392b" strokeWidth="1.3" />
        <text x="60" y="44" textAnchor="middle" fontSize="15" fontWeight="900" letterSpacing="1.5" fill="#c0392b" fontFamily="'IBM Plex Sans', sans-serif">BAILED OUT</text>
      </g>
    </svg>
  );
}
