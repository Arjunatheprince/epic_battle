import type { VfxManager } from './VfxManager';

export interface VisualArguments {
  emitCharacterStrike: [unitId: string, ...args: Parameters<VfxManager['emitCharacterStrike']> extends [unknown, ...infer Rest] ? Rest : never];
  emitDamageNumber: Parameters<VfxManager['emitDamageNumber']>;
  emitBurst: Parameters<VfxManager['emitBurst']>;
  emitDragonBreath: Parameters<VfxManager['emitDragonBreath']>;
  emitChainLightning: Parameters<VfxManager['emitChainLightning']>;
  emitMeteorStrike: [x: number, z: number, color: number];
  emitSpawnPortal: Parameters<VfxManager['emitSpawnPortal']>;
  emitHitImpact: Parameters<VfxManager['emitHitImpact']>;
  emitDeathDissolve: Parameters<VfxManager['emitDeathDissolve']>;
  emitHealParticles: Parameters<VfxManager['emitHealParticles']>;
  emitShockwaveRing: Parameters<VfxManager['emitShockwaveRing']>;
  emitSlashTrail: Parameters<VfxManager['emitSlashTrail']>;
  emitSkyBeam: Parameters<VfxManager['emitSkyBeam']>;
}

export type VisualCommand = { [K in keyof VisualArguments]: { type: K; args: VisualArguments[K] } }[keyof VisualArguments];
export type VisualEvent = VisualCommand & { id: number; time: number };
export interface VisualBatch { version: 1; stream: string; now: number; events: VisualEvent[] }
export const EFFECT_RETENTION_MS = 3000;
export const MAX_VISUAL_EVENTS = 4096;

/** Recent events survive missed/coalesced snapshots; IDs make SSE + polling idempotent. */
export class VisualEventJournal {
  private stream = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  private sequence = 0;
  private events: VisualEvent[] = [];

  record<K extends keyof VisualArguments>(type: K, args: VisualArguments[K]): void {
    // JSON turns undefined array entries into null; omit trailing optional arguments instead.
    while (args.length && args[args.length - 1] === undefined) args.pop();
    this.events.push({ type, args, id: ++this.sequence, time: performance.now() } as VisualEvent);
    this.prune(performance.now());
  }

  private prune(now: number): void {
    const oldest = this.events.findIndex((event) => now - event.time <= EFFECT_RETENTION_MS);
    if (oldest < 0) this.events.length = 0;
    else if (oldest > 0) this.events.splice(0, oldest);
    if (this.events.length > MAX_VISUAL_EVENTS) this.events.splice(0, this.events.length - MAX_VISUAL_EVENTS);
  }

  snapshot(): VisualBatch {
    const now = performance.now();
    this.prune(now);
    return { version: 1, stream: this.stream, now, events: this.events.slice() };
  }
}

export class VisualEventReceiver {
  private stream = '';
  private lastId = 0;
  private seen = new Set<number>();
  consume(batch: VisualBatch, play: (event: VisualEvent) => void): number {
    if (batch.version !== 1 || !Array.isArray(batch.events)) return 0;
    if (batch.stream !== this.stream) { this.stream = batch.stream; this.lastId = 0; this.seen.clear(); }
    let count = 0;
    for (const event of batch.events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      this.lastId = Math.max(this.lastId, event.id);
      if (this.seen.size > MAX_VISUAL_EVENTS * 2) this.seen.delete(this.seen.values().next().value!);
      if (batch.now - event.time > EFFECT_RETENTION_MS) continue;
      play(event);
      count++;
    }
    return count;
  }
}

/** Bridge retains recent history for polling/reconnect, while live SSE sends only new events. */
export function mergeVisualBatches(previous: VisualBatch | undefined, incoming: VisualBatch): VisualBatch {
  const events = previous?.stream === incoming.stream ? previous.events.concat(incoming.events) : incoming.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  return { ...incoming, events: [...byId.values()].filter((event) => incoming.now - event.time <= EFFECT_RETENTION_MS)
    .sort((a, b) => a.id - b.id).slice(-MAX_VISUAL_EVENTS) };
}
