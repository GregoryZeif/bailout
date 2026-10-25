/** Tiny synthesized sound effects (WebAudio) — no assets, fully optional. */
type SoundName = 'dice' | 'buy' | 'rent' | 'card' | 'bankrupt' | 'win' | 'coin' | 'alert' | 'tick';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.08) {
  const a = ac();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = gain;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export function play(name: SoundName) {
  if (muted) return;
  switch (name) {
    case 'dice':
      for (let i = 0; i < 5; i++) noise(i * 0.07, 0.05, 0.12);
      break;
    case 'buy':
      tone(660, 0, 0.12, 'triangle');
      tone(990, 0.1, 0.2, 'triangle');
      break;
    case 'coin':
      tone(1320, 0, 0.08, 'square', 0.05);
      tone(1760, 0.06, 0.12, 'square', 0.05);
      break;
    case 'rent':
      tone(520, 0, 0.15, 'sawtooth', 0.06);
      tone(390, 0.12, 0.25, 'sawtooth', 0.06);
      break;
    case 'card':
      noise(0, 0.15, 0.05);
      tone(880, 0.05, 0.15, 'sine', 0.06, 1200);
      break;
    case 'bankrupt':
      tone(392, 0, 0.35, 'sawtooth', 0.07);
      tone(370, 0.35, 0.35, 'sawtooth', 0.07);
      tone(349, 0.7, 0.35, 'sawtooth', 0.07);
      tone(330, 1.05, 0.9, 'sawtooth', 0.07, 200);
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.1));
      break;
    case 'alert':
      tone(880, 0, 0.1, 'square', 0.05);
      tone(660, 0.12, 0.15, 'square', 0.05);
      break;
    case 'tick':
      tone(1200, 0, 0.03, 'square', 0.03);
      break;
  }
}
