import { io, type Socket } from 'socket.io-client';
import type { Faction, TikTokConnectionState } from '../types/game';
import { resolveGiftConfig } from '../config/gifts';

export interface TikTokCommentPayload {
  eventId?: string;
  username: string;
  comment: string;
  team?: Faction;
}

export interface TikTokGiftPayload {
  eventId?: string;
  username: string;
  giftId: string | number;
  diamondCount?: number;
  repeatCount?: number;
  repeatEnd?: boolean;
  streakId?: string;
  team?: Faction;
}

export interface TikTokLikePayload {
  eventId?: string;
  username: string;
  likeCount: number;
  totalLikes?: number;
  team?: Faction;
}

interface TikTokClientCallbacks {
  onStatusChange: (status: TikTokConnectionState, roomUser?: string) => void;
  onComment: (username: string, comment: string) => void;
  onGift: (username: string, resolvedGiftId: string, deltaRepeatCount: number, forcedTeam?: Faction) => void;
  onLike: (username: string, likeCount: number, forcedTeam?: Faction) => void;
  onLog: (type: 'COMMENT' | 'GIFT' | 'LIKE' | 'STREAK' | 'QUEUED' | 'SYSTEM', username: string, summary: string, team?: Faction) => void;
  onCameraSync?: (camData: any) => void;
  onStateSync?: (stateData: any) => void;
}

class TikTokLiveClient {
  private sse: EventSource | null = null;
  private status: TikTokConnectionState = 'DEMO_FALLBACK';
  private connectedRoom = 'velofit.id';
  private callbacks: TikTokClientCallbacks | null = null;
  private syncInFlight = false;
  private acknowledgedFxStream = '';
  private acknowledgedFxId = 0;
  private pollFxStream = '';
  private pollFxId = 0;
  private mirrorPollInFlight = false;
  private latestCamToPost: any = null;
  private latestStateToPost: any = null;
  private readonly tabId = Math.random().toString(36).slice(2, 10);
  private lastInteractTime = Date.now();

  // Duplicate event prevention (LRU set of 3,000 IDs)
  private processedIds = new Set<string>();
  // Comment rate-limiting per user
  private userCommentTimestamps = new Map<string, number>();
  // Combo streak delta tracking: key = `${username}:${giftId}:${streakId}` -> lastProcessedCount
  private activeStreaks = new Map<string, number>();

  public init(callbacks: TikTokClientCallbacks): void {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined') {
      const markActive = () => {
        this.lastInteractTime = Date.now();
      };
      window.addEventListener('pointerdown', markActive, { capture: true, passive: true });
      window.addEventListener('keydown', markActive, { capture: true, passive: true });
      window.addEventListener('wheel', markActive, { capture: true, passive: true });
      window.addEventListener('click', markActive, { capture: true, passive: true });

      const params = new URLSearchParams(window.location.search);
      const urlUser = params.get('tiktok');
      if (urlUser) {
        this.connectedRoom = urlUser.trim().replace(/^@/, '');
      }
    }
    this.connectSocket();
  }

  public connectSocket(roomUsername?: string): void {
    if (roomUsername !== undefined) {
      this.connectedRoom = roomUsername.trim().replace(/^@/, '');
    }

    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }

    this.setStatus('CONNECTING');

    if (this.connectedRoom) {
      fetch(`/api/tiktok/connect?username=${encodeURIComponent(this.connectedRoom)}`).catch(() => {});
    }

    try {
      const sse = new EventSource('/api/stream');
      this.sse = sse;

      sse.onopen = () => {
        this.setStatus('CONNECTED');
        this.callbacks?.onLog(
          'SYSTEM',
          'Bridge Server',
          `Terhubung ke TikTok LIVE Bridge & Mirror Sync · Room @${this.connectedRoom}`
        );
      };

      sse.onerror = () => {
        if (this.status !== 'CONNECTED') {
          this.setStatus('DEMO_FALLBACK');
        }
      };

      sse.addEventListener('tiktok:comment_team', (e: MessageEvent) => {
        this.processIncomingComment(JSON.parse(e.data));
      });

      sse.addEventListener('tiktok:gift', (e: MessageEvent) => {
        this.processIncomingGift(JSON.parse(e.data));
      });

      sse.addEventListener('tiktok:like', (e: MessageEvent) => {
        this.processIncomingLike(JSON.parse(e.data));
      });

      sse.addEventListener('tiktok:gift_queued', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        this.callbacks?.onLog(
          'QUEUED',
          payload.username,
          `Gift ${payload.giftId} (x${payload.repeatCount}) ditahan menunggu komentar pilih tim`
        );
      });

      sse.addEventListener('tiktok:room_status', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        if (payload.state === 'CONNECTED') {
          this.setStatus('CONNECTED');
        } else if (payload.state === 'CONNECTING') {
          this.setStatus('CONNECTING');
        }
        this.callbacks?.onLog('SYSTEM', `@${payload.uniqueId}`, payload.message);
      });

      sse.addEventListener('sync:camera', (e: MessageEvent) => {
        this.callbacks?.onCameraSync?.(JSON.parse(e.data));
      });

      sse.addEventListener('sync:state', (e: MessageEvent) => {
        this.callbacks?.onStateSync?.(JSON.parse(e.data));
      });
    } catch {
      this.setStatus('DEMO_FALLBACK');
    }
  }

  private flushSyncPost(): void {
    if (this.syncInFlight || (!this.latestCamToPost && !this.latestStateToPost)) return;
    this.syncInFlight = true;
    const state = this.latestStateToPost;
    const fx = state?.fx;
    if (fx && fx.stream !== this.acknowledgedFxStream) {
      this.acknowledgedFxStream = fx.stream;
      this.acknowledgedFxId = 0;
    }
    const outgoingState = fx ? { ...state, fx: { ...fx,
      events: fx.events.filter((event: { id: number }) => event.id > this.acknowledgedFxId) } } : state;
    const body = JSON.stringify({
      tabId: this.tabId,
      lastInteractTime: this.lastInteractTime,
      cam: this.latestCamToPost,
      state: outgoingState,
    });
    this.latestCamToPost = null;
    this.latestStateToPost = null;

    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Mirror sync failed');
        if (fx && fx.stream === this.acknowledgedFxStream) {
          this.acknowledgedFxId = Math.max(this.acknowledgedFxId, ...fx.events.map((event: { id: number }) => event.id));
        }
      })
      .catch(() => {})
      .finally(() => {
        this.syncInFlight = false;
        if (this.latestCamToPost || this.latestStateToPost) {
          this.flushSyncPost();
        }
      });
  }

  public emitCameraSync(payload: any): void {
    this.latestCamToPost = payload;
    this.flushSyncPost();
  }

  public emitStateSync(payload: any): void {
    this.latestStateToPost = payload;
    this.flushSyncPost();
  }

  public emitMasterSync(camPayload: any, statePayload?: any): void {
    this.latestCamToPost = camPayload;
    if (statePayload) {
      this.latestStateToPost = statePayload;
    }
    this.flushSyncPost();
  }

  public requestMirrorInit(): void {
    if (this.mirrorPollInFlight) return;
    this.mirrorPollInFlight = true;
    fetch(`/api/sync?fxStream=${encodeURIComponent(this.pollFxStream)}&fxAfter=${this.pollFxId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.cam) this.callbacks?.onCameraSync?.(d.cam);
        if (d?.state) {
          this.callbacks?.onStateSync?.(d.state);
          const fx = d.state.fx;
          if (fx) {
            if (fx.stream !== this.pollFxStream) { this.pollFxStream = fx.stream; this.pollFxId = 0; }
            this.pollFxId = Math.max(this.pollFxId, ...fx.events.map((event: { id: number }) => event.id));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        this.mirrorPollInFlight = false;
      });
  }

  public disconnect(): void {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    this.setStatus('DEMO_FALLBACK');
  }

  private setStatus(next: TikTokConnectionState): void {
    this.status = next;
    this.callbacks?.onStatusChange(next, this.connectedRoom);
  }

  private isDuplicate(eventId?: string): boolean {
    if (!eventId) return false;
    if (this.processedIds.has(eventId)) return true;
    this.processedIds.add(eventId);
    if (this.processedIds.size > 3000) {
      const oldest = this.processedIds.values().next().value;
      if (oldest) this.processedIds.delete(oldest);
    }
    return false;
  }

  public processIncomingComment(payload: TikTokCommentPayload): void {
    if (!payload.username || !payload.comment) return;
    if (this.isDuplicate(payload.eventId)) return;

    const now = Date.now();
    const lastTime = this.userCommentTimestamps.get(payload.username) || 0;
    if (now - lastTime < 350) return; // Rate limit spam
    this.userCommentTimestamps.set(payload.username, now);

    this.callbacks?.onLog('COMMENT', payload.username, `Komentar: "${payload.comment}"`, payload.team);
    this.callbacks?.onComment(payload.username, payload.comment);
  }

  public processIncomingGift(payload: TikTokGiftPayload): void {
    if (!payload.username || payload.giftId === undefined) return;
    if (this.isDuplicate(payload.eventId)) return;

    const cfg = resolveGiftConfig(payload.giftId, payload.diamondCount);
    if (!cfg) return;

    const totalRepeat = Math.max(1, Math.floor(payload.repeatCount || 1));
    let deltaRepeat = totalRepeat;

    // Handle TikTok gift combo streaks without double-spawning intermediate counts
    if (payload.streakId) {
      const streakKey = `${payload.username}:${cfg.id}:${payload.streakId}`;
      const prevCount = this.activeStreaks.get(streakKey) || 0;
      deltaRepeat = Math.max(0, totalRepeat - prevCount);
      if (payload.repeatEnd) {
        this.activeStreaks.delete(streakKey);
      } else {
        this.activeStreaks.set(streakKey, totalRepeat);
      }
      if (deltaRepeat === 0) return;

      this.callbacks?.onLog(
        'STREAK',
        payload.username,
        `Combo Streak ${cfg.name} x${totalRepeat} (delta +${deltaRepeat})`,
        payload.team
      );
    } else {
      this.callbacks?.onLog(
        'GIFT',
        payload.username,
        `Gift ${cfg.name} (${cfg.coins}c) x${deltaRepeat}`,
        payload.team
      );
    }

    this.callbacks?.onGift(payload.username, cfg.id, deltaRepeat, payload.team);
  }

  public processIncomingLike(payload: TikTokLikePayload): void {
    if (!payload.username) return;
    if (this.isDuplicate(payload.eventId)) return;
    const count = Math.max(1, Math.min(200, Math.floor(payload.likeCount || 15)));
    this.callbacks?.onLog('LIKE', payload.username, `Mengirim +${count} Like ❤️`, payload.team);
    this.callbacks?.onLike(payload.username, count, payload.team);
  }
}

export const tikTokLiveClient = new TikTokLiveClient();
