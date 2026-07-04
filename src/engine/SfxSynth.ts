/**
 * Tiny WebAudio synth used as a fallback when the real .mp3 assets are
 * missing (they are optional — see CLAUDE.md Audio). Every effect is a
 * couple of oscillators with an exponential decay, tuned to be soft.
 */

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!audioCtx) audioCtx = new AudioContext();
  // browsers gate audio behind a user gesture; play() is always gesture-driven
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** One decaying oscillator note. freqTo ≠ freq gives a pitch sweep. */
function tone(
  c: AudioContext,
  type: OscillatorType,
  freq: number,
  dur: number,
  gain: number,
  startAt = 0,
  freqTo?: number,
) {
  const osc = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + startAt;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Filtered noise burst (sighs, shakers). */
function noise(c: AudioContext, dur: number, gain: number, filterFrom: number, filterTo: number) {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  const t0 = c.currentTime;
  filter.frequency.setValueAtTime(filterFrom, t0);
  filter.frequency.exponentialRampToValueAtTime(filterTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
}

export const SfxSynth = {
  play(key: string) {
    const c = ctx();
    if (!c) return;
    switch (key) {
      case "footstep-soft":
        tone(c, "triangle", 90, 0.06, 0.06);
        break;
      case "token-pickup":
        tone(c, "sine", 660, 0.09, 0.14);
        tone(c, "sine", 880, 0.12, 0.14, 0.09);
        break;
      case "squeak":
        tone(c, "sawtooth", 900, 0.09, 0.1, 0, 1400);
        tone(c, "sawtooth", 1400, 0.09, 0.1, 0.09, 700);
        break;
      case "decoy-throw":
        tone(c, "sine", 400, 0.2, 0.1, 0, 150);
        break;
      case "success":
        [523, 659, 784, 1047].forEach((f, i) => tone(c, "sine", f, 0.22, 0.11, i * 0.1));
        break;
      case "caught-mommy":
      case "caught-dog":
      case "caught-husband":
        tone(c, "square", 220, 0.35, 0.07);
        tone(c, "square", 233, 0.35, 0.07);
        break;
      case "mom-sigh":
        noise(c, 0.9, 0.06, 600, 200);
        break;
      // "ambient-hum" intentionally silent — a looping synth drone annoys fast
    }
  },
};
