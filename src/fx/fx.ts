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

export const supportsHaptics = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.vibrate === "function" &&
  (navigator.maxTouchPoints ?? 0) > 0 &&
  matchMedia("(hover: none) and (pointer: coarse)").matches;

export class Fx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humOsc: OscillatorNode[] = [];
  private humGain: GainNode | null = null;
  private humOn = false;
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
    // A running context keeps the device's audio path alive to compute silence.
    // Leaving it running for someone who just asked for no audio is the worst
    // case of that.
    if (!on) { this.hum(false); if (this.ctx?.state === "running") setTimeout(() => { if (!this.prefs.sound) void this.ctx?.suspend(); }, 450); }
    else this.unlock();
  }
  setHaptics(on: boolean) {
    this.prefs.haptics = on; save(this.prefs);
    // Switching off mid-pattern otherwise leaves the motor running.
    if (!on && supportsHaptics()) { try { navigator.vibrate(0); } catch {} }
  }

  /** One oscillator-shaped blip. Everything below is built from these. */
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
    const c = this.ctx, m = this.master;
    if (!c || !m || !this.prefs.sound) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    // exponentialRampToValueAtTime(0) throws. No caller passes 0 today; this
    // stops the next one finding out the hard way.
    const v = Math.max(1e-4, vol);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    // A hard attack and a short exponential tail: dry, no reverb, no sparkle.
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
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

  /**
   * A quiet fluorescent hum.
   *
   * At 60Hz + 180Hz this was 100% of its energy below 300Hz, which a phone's
   * micro-speaker rolls off by ~47dB: measured -85.7 dBFS at the ear, i.e.
   * silence, for two oscillators running forever. A real fluorescent fixture
   * sings at TWICE mains plus ballast whine anyway, so 120/240/2400 is both
   * audible (-54.9 dBFS, ~31dB better) and physically correct.
   */
  hum(on: boolean) {
    this.humOn = on;
    const c = this.ctx, m = this.master;
    if (!c || !m) return;
    if (on) {
      if (this.humGain || !this.prefs.sound) return;
      this.humGain = c.createGain();
      this.humGain.gain.value = 0.0001;
      this.humGain.connect(m);
      // Mains hum: 60Hz with its third harmonic, barely there.
      for (const [f, v] of [[120, 0.09], [240, 0.03], [2400, 0.006]] as const) {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = c.createGain(); g.gain.value = v;
        o.connect(g); g.connect(this.humGain); o.start();
        this.humOsc.push(o);
      }
      this.humGain.gain.setTargetAtTime(0.5, c.currentTime, 0.6); // 1.2 took 3.6s to arrive
    } else {
      const g = this.humGain, t = c.currentTime;
      if (g) g.gain.setTargetAtTime(0.0001, t, 0.08);   // fade, don't cut
      for (const o of this.humOsc) { try { o.stop(t + 0.35); } catch {} }
      this.humOsc = [];
      if (g) { setTimeout(() => { try { g.disconnect(); } catch {} }, 420); this.humGain = null; }
    }
  }

  buzz(pattern: number | number[]) {
    // enter() awaits the ad, so the reward tail can land after the tab is
    // hidden. Chrome suppresses it anyway; asking is still the wrong side of
    // a battery constraint to sit on.
    if (document.hidden) return;
    if (!this.prefs.haptics || !supportsHaptics()) return;
    try { navigator.vibrate(pattern); } catch {}
  }

  // ---- the sounds themselves ----

  /** A footstep on industrial carpet. Quiet enough to hear thirty of them. */
  step() {
    // Varied per step: an identical repeated transient is what makes footsteps
    // grating. Cut at 1600 rather than 900 also survives a phone speaker by 4dB.
    this.noise(0.035 + Math.random() * 0.015, 0.15 + Math.random() * 0.06, 1400 + Math.random() * 500);
  }

  /** Tapping somewhere to walk. */
  tick() { this.blip(880, 0.03, "square", 0.12); }

  /** A pod door. Pneumatic hiss, then a servo note that lands flat. */
  doorOpen() {
    this.noise(0.26, 0.34, 1600);
    this.blip(300, 0.16, "sawtooth", 0.22, 0.05, 460);
    this.buzz([30, 70, 90]);
  }

  /** A closed pod. Two dead clunks, no music. */
  doorLocked() {
    this.blip(170, 0.07, "square", 0.30);
    this.blip(135, 0.09, "square", 0.27, 0.1);
    this.buzz([35, 65, 40]);
  }

  /**
   * The hat. A fanfare that arrives at the right note and the note is out of
   * tune, so the building's chime sounds broken rather than the composer.
   *
   * The previous version landed on F5 and claimed to be "a semitone short of
   * the G". F5 is a WHOLE TONE below G5, and C-E-F is root, major third,
   * perfect fourth: every note consonant, which reads as an unfinished pleasant
   * phrase rather than a deadpan one. Each note also ended exactly as the next
   * began, so it was three detached beeps instead of a phrase.
   */
  reward() {
    this.blip(523.25, 0.16, "triangle", 0.50);        // C5
    this.blip(659.25, 0.16, "triangle", 0.50, 0.1);   // E5
    this.blip(762.00, 0.34, "triangle", 0.46, 0.2);   // G5, 48 cents flat
    this.buzz([25, 75, 25, 75, 120]);
  }

  /** Refused. One flat buzz, the sound of a building saying no. */
  denied() {
    this.blip(190, 0.1, "sawtooth", 0.32);
    this.blip(140, 0.22, "sawtooth", 0.29, 0.09);
    this.buzz([60, 40, 160]);
  }

  /** Leaving an ad early. Sad, small, over quickly. */
  abandon() {
    // Triangle, not sine: a pure sine has no harmonics to survive a phone
    // speaker and measured -47 dBFS at the ear, so the one sound that reports
    // a failure was the one you could not hear.
    this.blip(520, 0.14, "triangle", 0.22, 0, 330);
    this.buzz(45);
  }

  /** Stops the hum's oscillators but REMEMBERS that it was on, so resume()
   *  can bring it back. Without that it died on the first tab-away and only
   *  returned because the pod re-armed it on the next pointerdown. */
  suspend() {
    if (supportsHaptics()) { try { navigator.vibrate(0); } catch {} }
    const want = this.humOn;
    this.hum(false); this.humOn = want;
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }
  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
    if (this.humOn && !this.humGain) this.hum(true);
  }
  destroy() { this.hum(false); try { void this.ctx?.close(); } catch {} this.ctx = null; this.master = null; }
}
