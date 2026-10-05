/**
 * Dust in lamplight, and the sparks a hand leaves in it. Motes drift upward
 * and glow brighter near the lantern (the pointer); come close and they part
 * and swirl round it. Moving quickly trails sparks; a click scatters a burst.
 * Drawn additively from one pre-rendered glow sprite, so a hundred cost little.
 */

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  depth: number;
  phase: number;
  twinkle: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  ttl: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
}

const REACH = 170;
const GLOW_REACH = 300;
const MAX_SPARKS = 260;

export class Motes {
  private readonly context: CanvasRenderingContext2D;
  private readonly sprite: HTMLCanvasElement;
  private motes: Mote[] = [];
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private width = 0;
  private height = 0;
  private pointer = { x: -9999, y: -9999, active: false };
  private last = { x: 0, y: 0, known: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    this.sprite = glowSprite();
  }

  resize(width: number, height: number, ratio: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const wanted = Math.round(Math.min(120, Math.max(36, (width * height) / 15000)));
    while (this.motes.length < wanted) this.motes.push(this.mote(Math.random() * height));
    this.motes.length = wanted;
  }

  /** Where the lantern is; `active` when a hand is actually there. */
  point(x: number, y: number, active: boolean): void {
    if (active && this.last.known) {
      const speed = Math.hypot(x - this.last.x, y - this.last.y);
      const trail = Math.min(4, Math.floor(speed / 14));
      for (let i = 0; i < trail; i++) {
        const t = i / Math.max(1, trail);
        this.spark(
          this.last.x + (x - this.last.x) * t,
          this.last.y + (y - this.last.y) * t,
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30 - 12,
          0.7 + Math.random() * 0.7,
          0.5 + Math.random() * 0.6,
        );
      }
    }
    this.pointer = { x, y, active };
    this.last = { x, y, known: active };
  }

  burst(x: number, y: number, count = 28, power = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (60 + Math.random() * 170) * power;
      this.spark(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 20,
        1 + Math.random() * 1.4,
        0.7 + Math.random() * 0.9,
      );
    }
    this.rings.push({ x, y, life: 0 });
  }

  /** Advances the world by `dt` seconds and draws it. */
  step(dt: number, time: number): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    const { x: px, y: py, active } = this.pointer;

    for (const mote of this.motes) {
      mote.vx *= 0.94;
      mote.vy *= 0.94;
      const dx = mote.x - px;
      const dy = mote.y - py;
      const distance = Math.hypot(dx, dy) || 1;
      if (active && distance < REACH) {
        // Part around the hand, and swirl as they go.
        const force = (1 - distance / REACH) ** 2 * 120;
        mote.vx += ((dx / distance) * 0.55 - (dy / distance) * 0.9) * force * dt;
        mote.vy += ((dy / distance) * 0.55 + (dx / distance) * 0.9) * force * dt;
      }
      mote.x += (mote.vx + Math.sin(time * 0.5 + mote.phase) * 6 * mote.depth) * dt;
      mote.y += (mote.vy - (5 + mote.depth * 15)) * dt;
      if (mote.y < -12) Object.assign(mote, this.mote(this.height + 12));
      if (mote.x < -12) mote.x = this.width + 12;
      if (mote.x > this.width + 12) mote.x = -12;

      const lit = distance < GLOW_REACH ? (1 - distance / GLOW_REACH) * 0.9 : 0;
      const shimmer = 0.6 + 0.4 * Math.sin(time * mote.twinkle + mote.phase);
      const alpha = Math.min(1, (0.16 + mote.depth * 0.32) * shimmer + lit);
      this.draw(mote.x, mote.y, mote.size * (1 + lit * 0.8), alpha);
    }

    this.sparks = this.sparks.filter((spark) => {
      spark.life += dt;
      if (spark.life >= spark.ttl) return false;
      spark.vx *= 0.95;
      spark.vy = spark.vy * 0.95 - 26 * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      const left = 1 - spark.life / spark.ttl;
      this.draw(spark.x, spark.y, spark.size * (0.4 + left), left);
      return true;
    });

    this.rings = this.rings.filter((ring) => {
      ring.life += dt / 0.8;
      if (ring.life >= 1) return false;
      const eased = 1 - (1 - ring.life) ** 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 10 + eased * 70, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 214, 140, ${0.45 * (1 - ring.life)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return true;
    });
  }

  private draw(x: number, y: number, size: number, alpha: number): void {
    const radius = size * 6;
    this.context.globalAlpha = alpha;
    this.context.drawImage(this.sprite, x - radius, y - radius, radius * 2, radius * 2);
    this.context.globalAlpha = 1;
  }

  private mote(y: number): Mote {
    const depth = Math.random();
    return {
      x: Math.random() * this.width,
      y,
      vx: 0,
      vy: 0,
      size: 0.5 + depth * 1.3,
      depth,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.6 + Math.random() * 1.8,
    };
  }

  private spark(x: number, y: number, vx: number, vy: number, size: number, ttl: number): void {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    this.sparks.push({ x, y, vx, vy, size, life: 0, ttl });
  }
}

function glowSprite(): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext('2d')!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255, 246, 220, 1)');
  glow.addColorStop(0.12, 'rgba(255, 222, 160, 0.9)');
  glow.addColorStop(0.35, 'rgba(255, 190, 110, 0.28)');
  glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return sprite;
}
