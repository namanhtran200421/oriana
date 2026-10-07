import { DOCUMENT, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SITE } from '../../stories/site';

/** The few calls we make on a YouTube IFrame API player. */
interface YouTubePlayer {
  playVideo(): void;
  loadVideoById(videoId: string): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  unMute(): void;
}

interface YouTubeApi {
  Player: new (element: HTMLElement, options: object) => YouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

const PlayerState = { Ended: 0, Playing: 1 } as const;

const PREFERENCE_KEY = 'oriana:music';
const FADE_IN_MS = 2400;
const FADE_OUT_MS = 900;
const FADE_STEP_MS = 50;

/** Extracts the video id from any common YouTube link (or a bare id). */
export function youtubeId(link: string): string | null {
  const bare = /^[\w-]{11}$/;
  if (bare.test(link)) return link;
  try {
    const url = new URL(link);
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12) || null;
    const v = url.searchParams.get('v');
    if (v && bare.test(v)) return v;
    return /\/(?:embed|shorts|live)\/([\w-]{11})/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The video ids from one link or several, skipping any that are not videos. */
export function youtubeIds(links: string | readonly string[] | undefined): string[] {
  const all = typeof links === 'string' ? [links] : (links ?? []);
  return all.map(youtubeId).filter((id): id is string => id !== null);
}

/**
 * Background music from YouTube: one song looped, or several in turn, played through a hidden embedded
 * player that lives for the whole visit. Browsers only allow sound after a
 * gesture, so it begins when the seal is broken (or on the first touch of a
 * later visit) and always fades in and out rather than starting abruptly.
 */
@Injectable({ providedIn: 'root' })
export class Music {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly videoIds = youtubeIds(SITE.music?.youtube);
  private readonly volume = SITE.music?.volume ?? 45;

  /** A song is configured. */
  readonly available = this.videoIds.length > 0;
  /** The listener wants music (it may still be loading or blocked). */
  readonly on = signal(false);
  /** Sound is actually coming out. */
  readonly sounding = signal(false);

  private player: YouTubePlayer | null = null;
  private ready = false;
  /** Which song is playing, and how many in a row have failed to. */
  private track = 0;
  private failures = 0;
  private level = 0;
  private fade?: ReturnType<typeof setInterval>;

  /** Loads the hidden player into `host`. Call once, in the browser. */
  attach(host: HTMLElement): void {
    if (!this.browser || !this.available || this.player) return;
    const win = this.document.defaultView as YouTubeWindow;

    const create = () => {
      const mount = this.document.createElement('div');
      host.append(mount);
      const single = this.videoIds.length === 1;
      this.player = new win.YT!.Player(mount, {
        host: 'https://www.youtube-nocookie.com',
        videoId: this.videoIds[0],
        width: 200,
        height: 200,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          rel: 0,
          // One song loops by itself; several are moved through by hand below.
          ...(single ? { loop: 1, playlist: this.videoIds[0] } : {}),
        },
        events: {
          onReady: () => {
            this.ready = true;
            if (this.on()) this.start();
          },
          onStateChange: ({ data }: { data: number }) => {
            this.sounding.set(data === PlayerState.Playing);
            if (data === PlayerState.Playing) this.failures = 0;
            if (data === PlayerState.Ended && this.on()) this.next();
          },
          onError: () => {
            this.sounding.set(false);
            // A song that will not play here (some cannot be embedded): try the next.
            if (this.videoIds.length > 1 && ++this.failures < this.videoIds.length) this.next();
          },
        },
      });
    };

    if (win.YT?.Player) {
      create();
    } else {
      const previous = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        previous?.();
        create();
      };
      const script = this.document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      this.document.head.append(script);
    }

    // On a return visit there is no seal to break: begin with the first touch.
    const firstTouch = (event: Event) => {
      if ((event.target as Element | null)?.closest?.('[data-music-toggle]')) return;
      this.begin();
    };
    this.document.addEventListener('pointerdown', firstTouch, { once: true, capture: true });
    this.document.addEventListener('keydown', firstTouch, { once: true, capture: true });
  }

  /** Starts the music unless the listener has switched it off before. */
  begin(): void {
    if (!this.available || this.on() || this.preference() === 'off') return;
    this.on.set(true);
    this.start();
  }

  toggle(): void {
    if (this.on() && this.sounding()) {
      this.remember('off');
      this.on.set(false);
      this.fadeTo(0, FADE_OUT_MS, () => this.player?.pauseVideo());
    } else {
      this.remember('on');
      this.on.set(true);
      this.start();
    }
  }

  /** On to the next song, or round to the first; one song simply starts again. */
  private next(): void {
    if (!this.player) return;
    if (this.videoIds.length === 1) {
      this.player.seekTo(0, true);
      this.player.playVideo();
      return;
    }
    this.track = (this.track + 1) % this.videoIds.length;
    this.player.loadVideoById(this.videoIds[this.track]);
  }

  private start(): void {
    if (!this.player || !this.ready) return;
    this.player.setVolume(this.level);
    this.player.unMute();
    this.player.playVideo();
    this.fadeTo(this.volume, FADE_IN_MS);
  }

  private fadeTo(target: number, duration: number, done?: () => void): void {
    clearInterval(this.fade);
    const from = this.level;
    const steps = Math.max(1, Math.round(duration / FADE_STEP_MS));
    let step = 0;
    this.fade = setInterval(() => {
      step++;
      // Ease-out, so the swell settles gently into place.
      const t = 1 - Math.pow(1 - step / steps, 3);
      this.level = Math.round(from + (target - from) * t);
      this.player?.setVolume(this.level);
      if (step >= steps) {
        clearInterval(this.fade);
        done?.();
      }
    }, FADE_STEP_MS);
  }

  private preference(): string | null {
    try {
      return localStorage.getItem(PREFERENCE_KEY);
    } catch {
      return null;
    }
  }

  private remember(value: 'on' | 'off'): void {
    try {
      localStorage.setItem(PREFERENCE_KEY, value);
    } catch {
      // Not remembered in private browsing; music still works for this visit.
    }
  }
}
