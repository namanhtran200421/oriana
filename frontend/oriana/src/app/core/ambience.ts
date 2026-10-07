import { Injectable, effect, inject } from '@angular/core';
import { Settings } from './settings';

export type Soundscape = 'meadow' | 'skies' | 'valley';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Under the music, always: the places are heard more than listened to. */
const LEVEL = 0.32;

interface Playing {
  stop(): void;
}

/**
 * The sound of each place beyond the window, made as it plays rather than
 * from recordings: the sea rolling in and drawing back with a gull now and
 * then, a breeze over the flowers with birds in it, crickets under the stars.
 * Quiet, under the music, and silent whenever sounds are switched off.
 */
@Injectable({ providedIn: 'root' })
export class Ambience {
  private readonly settings = inject(Settings);
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wanted: Soundscape | null = null;
  private playing: Playing | null = null;
  private noise: AudioBuffer | null = null;
  private unlock: (() => void) | null = null;

  constructor() {
    // Sounds switched off (or on again) in the locket: the place falls silent, or comes back.
    effect(() => {
      const on = this.settings.sounds();
      if (!on) this.halt();
      else if (this.wanted && !this.playing) this.start(this.wanted);
    });
  }

  /** Plays a place's sound, or none. */
  play(scape: Soundscape | null): void {
    if (scape === this.wanted && this.playing) return;
    this.wanted = scape;
    this.halt();
    if (scape && this.settings.sounds()) this.start(scape);
  }

  private start(scape: Soundscape): void {
    // Browsers only let sound start after a touch: until there has been one, wait for it.
    if (
      typeof navigator !== 'undefined' &&
      navigator.userActivation &&
      !navigator.userActivation.hasBeenActive
    ) {
      this.waitForTouch();
      return;
    }
    const ctx = this.audio();
    if (!ctx || !this.master) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    out.connect(this.master);
    const parts =
      scape === 'valley'
        ? this.sea(ctx, out)
        : scape === 'meadow'
          ? this.meadow(ctx, out)
          : this.night(ctx, out);
    this.playing = {
      stop: () => {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
        parts.stop();
        setTimeout(() => out.disconnect(), 1500);
      },
    };
  }

  private halt(): void {
    this.playing?.stop();
    this.playing = null;
  }

  private audio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.context) {
      const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.context = new Ctor();
      } catch {
        return null;
      }
      this.master = this.context.createGain();
      this.master.gain.value = LEVEL;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  /** Arrived without a touch (a link, a reload): the first touch starts the place's sound. */
  private waitForTouch(): void {
    if (this.unlock) return;
    this.unlock = () => {
      removeEventListener('pointerdown', this.unlock!);
      removeEventListener('keydown', this.unlock!);
      this.unlock = null;
      if (this.wanted && !this.playing && this.settings.sounds()) this.start(this.wanted);
    };
    addEventListener('pointerdown', this.unlock, { passive: true });
    addEventListener('keydown', this.unlock);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    // Four seconds of brownish noise: deep, like distant water or wind.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.035 * white) / 1.035;
      data[i] = last * 3.2;
    }
    return (this.noise = buffer);
  }

  private source(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    src.loopStart = Math.random() * 3;
    return src;
  }

  /** Waves: a low roar that swells as each comes in, a hiss as it breaks and draws back; gulls. */
  private sea(ctx: AudioContext, out: AudioNode): Playing {
    const roar = this.source(ctx);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.25;
    roar.connect(low).connect(roarGain).connect(out);

    const hiss = this.source(ctx);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.5;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    hiss.connect(band).connect(hissGain).connect(out);
    roar.start();
    hiss.start(ctx.currentTime, 1.3);

    let timer = 0;
    const wave = () => {
      const t = ctx.currentTime + 0.05;
      const size = 0.7 + Math.random() * 0.5;
      // In: the roar builds; then it breaks, a rush of foam; then it draws back.
      roarGain.gain.cancelScheduledValues(t);
      roarGain.gain.setValueAtTime(roarGain.gain.value, t);
      roarGain.gain.linearRampToValueAtTime(0.75 * size, t + 2.4);
      roarGain.gain.linearRampToValueAtTime(0.3, t + 5.5);
      low.frequency.cancelScheduledValues(t);
      low.frequency.setValueAtTime(380, t);
      low.frequency.linearRampToValueAtTime(900, t + 2.5);
      low.frequency.linearRampToValueAtTime(350, t + 5.8);
      hissGain.gain.cancelScheduledValues(t);
      hissGain.gain.setValueAtTime(0, t);
      hissGain.gain.linearRampToValueAtTime(0.0, t + 2.1);
      hissGain.gain.linearRampToValueAtTime(0.32 * size, t + 2.6);
      hissGain.gain.exponentialRampToValueAtTime(0.002, t + 6.2);
      timer = window.setTimeout(wave, 5600 + Math.random() * 2600);
      if (Math.random() < 0.28) this.gull(ctx, out, t + 1 + Math.random() * 3);
    };
    wave();
    return {
      stop() {
        clearTimeout(timer);
        roar.stop(ctx.currentTime + 1.5);
        hiss.stop(ctx.currentTime + 1.5);
      },
    };
  }

  /** A gull far off: two or three falling cries. */
  private gull(ctx: AudioContext, out: AudioNode, at: number): void {
    const calls = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < calls; k++) {
      const t = at + k * 0.32;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1500 + Math.random() * 200, t);
      osc.frequency.exponentialRampToValueAtTime(900, t + 0.25);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(filter).connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  /** A breeze through the flowers, coming and going, with birds singing in it. */
  private meadow(ctx: AudioContext, out: AudioNode): Playing {
    const wind = this.source(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.12;
    wind.connect(filter).connect(gain).connect(out);
    // Gusts, in step with the flowers leaning.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.37 / (Math.PI * 2);
    const depth = ctx.createGain();
    depth.gain.value = 0.07;
    lfo.connect(depth).connect(gain.gain);
    wind.start();
    lfo.start();

    let timer = 0;
    const song = () => {
      this.bird(ctx, out, ctx.currentTime + 0.05);
      timer = window.setTimeout(song, 2500 + Math.random() * 5000);
    };
    timer = window.setTimeout(song, 1200);
    return {
      stop() {
        clearTimeout(timer);
        wind.stop(ctx.currentTime + 1.5);
        lfo.stop(ctx.currentTime + 1.5);
      },
    };
  }

  /** A little bird: a phrase of quick, rising and falling whistles. */
  private bird(ctx: AudioContext, out: AudioNode, at: number): void {
    const notes = 3 + Math.floor(Math.random() * 5);
    const base = 2600 + Math.random() * 1600;
    for (let k = 0; k < notes; k++) {
      const t = at + k * (0.09 + Math.random() * 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const from = base * (0.85 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(
        from * (Math.random() < 0.5 ? 1.35 : 0.75),
        t + 0.07,
      );
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.03, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  /** Night: crickets chirping in trains, a hush of air. */
  private night(ctx: AudioContext, out: AudioNode): Playing {
    const air = this.source(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    air.connect(filter).connect(gain).connect(out);
    air.start();

    let timer = 0;
    const chirp = () => {
      const t = ctx.currentTime + 0.05;
      const pitch = 4200 + Math.random() * 900;
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < pulses; k++) {
        const s = t + k * 0.055;
        const osc = ctx.createOscillator();
        osc.frequency.value = pitch;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.012, s + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.04);
        osc.connect(g).connect(out);
        osc.start(s);
        osc.stop(s + 0.05);
      }
      timer = window.setTimeout(chirp, 600 + Math.random() * 1400);
    };
    chirp();
    return {
      stop() {
        clearTimeout(timer);
        air.stop(ctx.currentTime + 1.5);
      },
    };
  }
}
