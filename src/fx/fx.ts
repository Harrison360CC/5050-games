/**
 * Sound and haptics. Synthesised, no audio files, nothing to download.
 *
 * The whole site had neither until now: a grep for AudioContext, new Audio or
 * navigator.vibrate across src/ and site/ returned nothing at all.
 *
 * Register: this is a fluorescent-lit corporate building, not an arcade. Every
 * sound here is dry, short and slightly disappointing on purpose. Nothing
 * celebrates. The reward chime is deliberately a semitone short of satisfying.
 *
 * Haptics honesty: navigator.vibrate does not exist on iOS Safari and there is
 * no web haptics API on iPhone. buzz() is a no-op there rather than a lie, and
 * supportsHaptics() reports it so the UI can avoid offering a toggle that
 * cannot do anything.
 */

const KEY = "5050.fx";
type Prefs = { sound: boolean; haptics: boolean };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw); return { sound: p.sound !== false, haptics: p.haptics !== false }; }
  } catch {}
  return { sound: true, haptics: true };
}
function save(p: Prefs) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export const supportsHaptics = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export class Fx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humOsc: OscillatorNode[] = [];
  private humGain: GainNode | null = null;
  prefs: Prefs = load();

  /**
   * Browsers refuse to start an AudioContext without a user gesture, so this
   * is called from the first pointerdown rather than on mount. Calling it
   * again is free.
   */
  unlock() {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.prefs.sound ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setSound(on: boolean) {
    this.prefs.sound = on; save(this.prefs);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02);
    if (!on) this.hum(false);
  }
  setHaptics(on: boolean) { this.prefs.haptics = on; save(this.prefs); }

  /** One oscillator-shaped blip. Everything below is built from these. */
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
    const c = this.ctx, m = this.master;
    if (!c || !m || !this.prefs.sound) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    // A hard attack and a short exponential tail: dry, no reverb, no sparkle.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(m);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Filtered noise, for footsteps and pneumatics. */
  private noise(dur: number, vol: number, cut: number, at = 0) {
    const c = this.ctx, m = this.master;
    if (!c || !m || !this.prefs.sound) return;
    const t = c.currentTime + at;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(m);
    src.start(t);
  }

  /** A quiet fluorescent hum. The single best atmosphere-per-byte available. */
  hum(on: boolean) {
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    if (on) {
      if (this.humGain || !this.prefs.sound) return;
      this.humGain = c.createGain();
      this.humGain.gain.value = 0.0001;
      this.humGain.connect(m);
      // Mains hum: 60Hz with its third harmonic, barely there.
      for (const [f, v] of [[60, 0.05], [180, 0.018]] as const) {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = c.createGain(); g.gain.value = v;
        o.connect(g); g.connect(this.humGain); o.start();
        this.humOsc.push(o);
      }
      this.humGain.gain.setTargetAtTime(0.5, c.currentTime, 1.2); // fades up slowly
    } else {
      for (const o of this.humOsc) { try { o.stop(); } catch {} }
      this.humOsc = [];
      if (this.humGain) { try { this.humGain.disconnect(); } catch {} this.humGain = null; }
    }
  }

  buzz(pattern: number | number[]) {
    if (!this.prefs.haptics || !supportsHaptics()) return;
    try { navigator.vibrate(pattern); } catch {}
  }

  // ---- the sounds themselves ----

  /** A footstep on industrial carpet. Quiet enough to hear thirty of them. */
  step() { this.noise(0.045, 0.055, 900); }

  /** Tapping somewhere to walk. */
  tick() { this.blip(880, 0.03, "square", 0.025); }

  /** A pod door. Pneumatic hiss, then a servo note that lands flat. */
  doorOpen() {
    this.noise(0.26, 0.09, 1600);
    this.blip(300, 0.16, "sawtooth", 0.05, 0.05, 460);
    this.buzz(12);
  }

  /** A closed pod. Two dead clunks, no music. */
  doorLocked() {
    this.blip(150, 0.07, "square", 0.05);
    this.blip(120, 0.09, "square", 0.045, 0.1);
    this.buzz([18, 40, 18]);
  }

  /**
   * The hat. Three notes that start like a fanfare and stop one short of one,
   * because the hat does nothing and the sound should know that.
   */
  reward() {
    this.blip(523.25, 0.1, "triangle", 0.075);          // C5
    this.blip(659.25, 0.1, "triangle", 0.075, 0.1);     // E5
    this.blip(698.46, 0.26, "triangle", 0.07, 0.2);     // F5, not the G it wants
    this.buzz([14, 50, 14, 50, 26]);
  }

  /** Refused. One flat buzz, the sound of a building saying no. */
  denied() {
    this.blip(190, 0.1, "sawtooth", 0.05);
    this.blip(140, 0.22, "sawtooth", 0.045, 0.09);
    this.buzz(70);
  }

  /** Leaving an ad early. Sad, small, over quickly. */
  abandon() {
    this.blip(360, 0.1, "sine", 0.05, 0, 240);
    this.buzz(24);
  }

  suspend() { this.hum(false); if (this.ctx && this.ctx.state === "running") void this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume(); }
  destroy() { this.hum(false); try { void this.ctx?.close(); } catch {} this.ctx = null; this.master = null; }
}
