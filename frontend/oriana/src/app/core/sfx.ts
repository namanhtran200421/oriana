import { Injectable, inject } from '@angular/core';
import { Settings } from './settings';

export type Sound = 'chime' | 'pop' | 'flip' | 'win' | 'miss' | 'tick' | 'purr' | 'click' | 'meow';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Kept well under the background music, which plays at about half volume. */
const LEVEL = 0.07;

/**
 * Small sounds for finds and games, played on a tiny synthesiser rather than
 * from files: a music-box chime, a soft pop, the rustle of a card. They are
 * only ever made in answer to a touch, so the browser always allows them.
 */
@Injectable({ providedIn: 'root' })
export class Sfx {
  private readonly settings = inject(Settings);
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  /** `step` raises the pitch by semitones, for a run of catches. */
  play(sound: Sound, step = 0): void {
    if (!this.settings.sounds()) return;
    const ctx = this.audio();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const lift = Math.pow(2, step / 12);

    switch (sound) {
      case 'chime':
        // A music box: G, B, D, then the G above, each with a bell's overtone.
        [784, 988, 1175, 1568].forEach((f, i) => this.bell(ctx, f, t + i * 0.09, 1.4));
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone(ctx, f, t + i * 0.1, 0.5, 'triangle', LEVEL * 0.9),
        );
        this.bell(ctx, 2093, t + 0.5, 1.6);
        break;
      case 'pop':
        this.glide(ctx, 520 * lift, 860 * lift, t, 0.09, 'sine', LEVEL);
        break;
      case 'tick':
        this.bell(ctx, 880 * lift, t, 0.35);
        break;
      case 'click':
        this.tone(ctx, 1200, t, 0.04, 'square', LEVEL * 0.18);
        break;
      case 'miss':
        this.glide(ctx, 300, 190, t, 0.28, 'sine', LEVEL * 0.8);
        break;
      case 'flip':
        this.rustle(ctx, t, 0.09);
        break;
      case 'purr':
        this.purr(ctx, t, 1.1);
        break;
      case 'meow':
        this.meow(ctx, t);
        break;
    }
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
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }

  private envelope(ctx: AudioContext, start: number, duration: number, peak: number): GainNode {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(ctx.destination);
    return gain;
  }

  private tone(
    ctx: AudioContext,
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType = 'sine',
    peak = LEVEL,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    osc.connect(this.envelope(ctx, start, duration, peak));
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private glide(
    ctx: AudioContext,
    from: number,
    to: number,
    start: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    osc.connect(this.envelope(ctx, start, duration, peak));
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** A struck bell: the note, and a quieter inharmonic overtone that fades first. */
  private bell(ctx: AudioContext, frequency: number, start: number, duration: number): void {
    this.tone(ctx, frequency, start, duration, 'sine', LEVEL);
    this.tone(ctx, frequency * 2.76, start, duration * 0.4, 'sine', LEVEL * 0.25);
  }

  private rustle(ctx: AudioContext, start: number, duration: number): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.8;
    source.connect(filter).connect(this.envelope(ctx, start, duration, LEVEL * 0.9));
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  /** A low, rolling hum: noise through a warm filter, trembling about 24 times a second. */
  private purr(ctx: AudioContext, start: number, duration: number): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    const tremble = ctx.createGain();
    tremble.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(tremble.gain);
    source
      .connect(filter)
      .connect(tremble)
      .connect(this.envelope(ctx, start, duration, LEVEL * 2.2));
    source.start(start);
    lfo.start(start);
    source.stop(start + duration + 0.05);
    lfo.stop(start + duration + 0.05);
  }

  /** A small cat: a bright buzz that rises, then falls away, through a soft filter. */
  private meow(ctx: AudioContext, start: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, start);
    osc.frequency.exponentialRampToValueAtTime(820, start + 0.12);
    osc.frequency.exponentialRampToValueAtTime(430, start + 0.42);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, start);
    filter.frequency.exponentialRampToValueAtTime(2200, start + 0.12);
    filter.frequency.exponentialRampToValueAtTime(700, start + 0.42);
    osc.connect(filter).connect(this.envelope(ctx, start, 0.46, LEVEL * 0.55));
    osc.start(start);
    osc.stop(start + 0.5);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return (this.noise = buffer);
  }
}
