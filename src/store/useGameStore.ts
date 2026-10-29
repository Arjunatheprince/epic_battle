import { create } from 'zustand';
import type {
  BattlePhase,
  BossAnnouncement,
  CameraMode,
  EventFeedItem,
  Faction,
  PerformanceProfileMetrics,
  QualityLevel,
  TikTokConnectionState,
  TikTokEventLogItem,
  ViewerProfile,
} from '../types/game';
import { GIFT_BY_ID, resolveGiftConfig } from '../config/gifts';
import { UNIT_CONFIGS } from '../config/units';
import { MAX_CASTLE_HP, QUALITY_UNIT_CAPS, type SimulationEngine } from '../engine/SimulationEngine';
import { audioManager } from '../audio/AudioManager';

interface PendingViewerGift {
  username: string;
  giftId: string;
  repeatCount: number;
  timestamp: number;
}

interface GameStoreState {
  engineRef: SimulationEngine | null;
  setEngineRef: (engine: SimulationEngine | null) => void;

  // Battle Telemetry
  kingdomHp: number;
  monsterHp: number;
  maxCastleHp: number;
  kingdomUnits: number;
  monsterUnits: number;
  unitCap: number;
  phase: BattlePhase;
  timeRemainingSec: number;
  fps: number;
  drawCalls: number;

  // Announcements & Feeds
  bannerTitle: string;
  bannerSubtitle: string;
  bannerVisible: boolean;
  bossAnnouncement: BossAnnouncement | null;
  eventFeed: EventFeedItem[];

  // TikTok LIVE & Viewer Team System (Phase 7)
  viewers: Record<string, ViewerProfile>;
  pendingGifts: PendingViewerGift[];
  demoModeEnabled: boolean;
  tiktokStatus: TikTokConnectionState;
  tiktokRoom: string;
  tiktokEventLogs: TikTokEventLogItem[];

  // Controls & Settings (Phase 8 Adaptive Quality & Profiler)
  paused: boolean;
  autoSpawn: boolean;
  autoCamera: boolean;
  cameraMode: CameraMode;
  quality: QualityLevel;
  adaptiveQuality: boolean;
  profileMetrics: PerformanceProfileMetrics;
  muted: boolean;
  masterVolume: number;
  vertical916: boolean;
  obsMode: boolean;
  dashboardOpen: boolean;
  giftGuideOpen: boolean;
  setGiftGuideOpen: (open: boolean, autoCloseMs?: number) => void;

  // Actions
  syncTelemetry: (data: {
    kingdomHp: number;
    monsterHp: number;
    kingdomUnits: number;
    monsterUnits: number;
    unitCap: number;
    phase: BattlePhase;
    timeRemainingSec: number;
    fps: number;
    drawCalls: number;
    cameraMode: CameraMode;
    bossAnnouncement?: BossAnnouncement | null;
    profileMetrics?: PerformanceProfileMetrics;
  }) => void;
  showBanner: (title: string, subtitle?: string, durationMs?: number) => void;
  setBossAnnouncement: (boss: BossAnnouncement | null) => void;
  addFeedEvent: (item: Omit<EventFeedItem, 'id' | 'timestamp'>) => void;
  addTikTokLog: (
    type: TikTokEventLogItem['type'],
    username: string,
    summary: string,
    team?: Faction
  ) => void;
  setTikTokConnectionState: (status: TikTokConnectionState, room?: string) => void;

  // Gameplay & Admin Actions
  togglePause: () => void;
  resetRound: () => void;
  toggleAutoSpawn: () => void;
  toggleAutoCamera: () => void;
  setCameraMode: (mode: CameraMode) => void;
  setQuality: (q: QualityLevel) => void;
  toggleAdaptiveQuality: () => void;
  runStressBenchmark: (count?: number) => void;
  toggleMute: () => void;
  setMasterVolume: (v: number) => void;
  toggleVertical916: () => void;
  toggleObsMode: () => void;
  toggleDashboard: () => void;
  toggleDemoMode: () => void;

  // Spawn & TikTok Interaction Actions
  adminSpawnUnit: (unitId: string, count: number) => void;
  handleViewerComment: (username: string, commentText: string) => void;
  handleViewerGift: (
    username: string,
    giftId: string | number,
    forcedTeam?: Faction,
    repeatCount?: number
  ) => void;
  handleViewerLike: (username: string, likeCount: number, forcedTeam?: Faction) => void;
}

let bannerTimeout: number | null = null;

export const useGameStore = create<GameStoreState>((set, get) => ({
  engineRef: null,
  setEngineRef: (engine) => set({ engineRef: engine }),

  kingdomHp: MAX_CASTLE_HP,
  monsterHp: MAX_CASTLE_HP,
  maxCastleHp: MAX_CASTLE_HP,
  kingdomUnits: 0,
  monsterUnits: 0,
  unitCap: QUALITY_UNIT_CAPS.MEDIUM,
  phase: 'PREPARATION',
  timeRemainingSec: 15,
  fps: 60,
  drawCalls: 0,

  bannerTitle: '',
  bannerSubtitle: '',
  bannerVisible: false,
  bossAnnouncement: null,
  eventFeed: [],

  viewers: {
    'Sultan_Arjuna': { username: 'Sultan_Arjuna', team: 'K', totalCoins: 1500, giftsSent: 4 },
    'RajaMonster99': { username: 'RajaMonster99', team: 'M', totalCoins: 1200, giftsSent: 5 },
    'KsatriaBiru': { username: 'KsatriaBiru', team: 'K', totalCoins: 350, giftsSent: 3 },
    'AbyssWalker': { username: 'AbyssWalker', team: 'M', totalCoins: 300, giftsSent: 2 },
  },
  pendingGifts: [],
  demoModeEnabled: false,
  tiktokStatus: 'DEMO_FALLBACK',
  tiktokRoom: '',
  tiktokEventLogs: [],

  paused: false,
  autoSpawn: true,
  autoCamera: true,
  cameraMode: 'OVERVIEW',
  quality: 'MEDIUM',
  adaptiveQuality: true,
  profileMetrics: {
    stepTimeMs: 0,
    animTimeMs: 0,
    lodNear: 0,
    lodMid: 0,
    lodFar: 0,
    culledCount: 0,
    powerScoreK: 0,
    powerScoreM: 0,
    comebackBoostK: 1,
    comebackBoostM: 1,
  },
  muted: false,
  masterVolume: 0.75,
  vertical916: new URLSearchParams(window.location.search).has('obs'),
  obsMode: new URLSearchParams(window.location.search).has('obs'),
  dashboardOpen: !new URLSearchParams(window.location.search).has('obs'),
  giftGuideOpen: false,

  setGiftGuideOpen: (open, autoCloseMs) => {
    audioManager.playUiClick();
    set({ giftGuideOpen: open });
    if (open && autoCloseMs) {
      window.setTimeout(() => {
        set({ giftGuideOpen: false });
      }, autoCloseMs);
    }
  },

  syncTelemetry: (data) =>
    set((state) => ({
      kingdomHp: data.kingdomHp,
      monsterHp: data.monsterHp,
      kingdomUnits: data.kingdomUnits,
      monsterUnits: data.monsterUnits,
      unitCap: data.unitCap,
      phase: data.phase,
      timeRemainingSec: data.timeRemainingSec,
      fps: data.fps,
      drawCalls: data.drawCalls,
      cameraMode: data.cameraMode,
      bossAnnouncement:
        data.bossAnnouncement !== undefined ? data.bossAnnouncement : state.bossAnnouncement,
      profileMetrics: data.profileMetrics ? { ...data.profileMetrics } : state.profileMetrics,
    })),

  showBanner: (title, subtitle = '', durationMs = 2800) => {
    if (bannerTimeout !== null) {
      window.clearTimeout(bannerTimeout);
    }
    set({ bannerTitle: title, bannerSubtitle: subtitle, bannerVisible: true });
    bannerTimeout = window.setTimeout(() => {
      set({ bannerVisible: false });
    }, durationMs);
  },

  setBossAnnouncement: (boss) => set({ bossAnnouncement: boss }),

  addFeedEvent: (item) =>
    set((state) => {
      const next: EventFeedItem = {
        ...item,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
      };
      return {
        eventFeed: [next, ...state.eventFeed].slice(0, 7),
      };
    }),

  addTikTokLog: (type, username, summary, team) =>
    set((state) => {
      const entry: TikTokEventLogItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        type,
        username,
        summary,
        team,
      };
      return {
        tiktokEventLogs: [entry, ...state.tiktokEventLogs].slice(0, 25),
      };
    }),

  setTikTokConnectionState: (status, room) =>
    set((state) => ({
      tiktokStatus: status,
      tiktokRoom: room !== undefined ? room : state.tiktokRoom,
    })),

  togglePause: () => {
    const eng = get().engineRef;
    const next = !get().paused;
    if (eng) eng.paused = next;
    audioManager.playUiClick();
    set({ paused: next });
  },

  resetRound: () => {
    const eng = get().engineRef;
    audioManager.playUiClick();
    if (eng) eng.resetRound();
  },

  toggleAutoSpawn: () => {
    const eng = get().engineRef;
    const next = !get().autoSpawn;
    if (eng) eng.autoSpawnEnabled = next;
    audioManager.playUiClick();
    set({ autoSpawn: next });
  },

  toggleAutoCamera: () => {
    const eng = get().engineRef;
    const next = !get().autoCamera;
    if (eng) eng.cameraDirector.setAutoDirector(next);
    audioManager.playUiClick();
    set({ autoCamera: next });
  },

  setCameraMode: (mode) => {
    const eng = get().engineRef;
    audioManager.playUiClick();
    if (eng) {
      eng.cameraDirector.setManualMode(mode, eng.units);
    }
    set({ cameraMode: mode, autoCamera: false });
  },

  setQuality: (q) => {
    audioManager.playUiClick();
    set({ quality: q });
  },

  toggleAdaptiveQuality: () => {
    audioManager.playUiClick();
    set((s) => ({ adaptiveQuality: !s.adaptiveQuality }));
  },

  runStressBenchmark: (count = 150) => {
    const eng = get().engineRef;
    audioManager.playUiClick();
    if (eng) eng.runStressBenchmark(count);
  },

  toggleMute: () => {
    const next = !get().muted;
    audioManager.setMuted(next);
    set({ muted: next });
  },

  setMasterVolume: (v) => {
    audioManager.setMasterVolume(v);
    set({ masterVolume: v });
  },

  toggleVertical916: () => {
    audioManager.playUiClick();
    set((s) => ({ vertical916: !s.vertical916 }));
  },

  toggleObsMode: () => {
    audioManager.playUiClick();
    set((s) => ({
      obsMode: !s.obsMode,
      vertical916: !s.obsMode ? true : s.vertical916,
      dashboardOpen: !s.obsMode ? false : s.dashboardOpen,
    }));
  },

  toggleDashboard: () => {
    audioManager.playUiClick();
    set((s) => ({ dashboardOpen: !s.dashboardOpen }));
  },

  toggleDemoMode: () => {
    audioManager.playUiClick();
    set((s) => ({ demoModeEnabled: !s.demoModeEnabled }));
  },

  adminSpawnUnit: (unitId, count) => {
    const eng = get().engineRef;
    const cfg = UNIT_CONFIGS[unitId];
    if (!eng || !cfg) return;
    audioManager.unlock();
    eng.enqueueSpawn(unitId, count, 'Admin');
    get().addFeedEvent({
      team: cfg.faction,
      title: `Admin Spawn (${cfg.faction === 'K' ? 'Kingdom' : 'Monsters'})`,
      detail: `+${count} ${cfg.name}`,
      isBoss: cfg.isBoss,
      isLegendary: cfg.isLegendary,
    });
  },

  handleViewerComment: (username, commentText) => {
    const normalized = commentText.trim().toUpperCase();
    if (
      normalized.includes('GIFT') ||
      normalized.includes('PANDUAN') ||
      normalized.includes('MENU') ||
      normalized.includes('INFO') ||
      normalized.includes('CARA')
    ) {
      get().setGiftGuideOpen(true, 10000);
      get().addFeedEvent({
        title: `📖 ${username} membuka Panduan Gift!`,
        detail: 'Tabel Panduan Gift ditampilkan di layar selama 10 detik',
      });
    }

    let chosenTeam: Faction | null = null;
    if (normalized.includes('KINGDOM') || normalized === 'K' || normalized.includes('BIRU') || normalized === '1') {
      chosenTeam = 'K';
    } else if (normalized.includes('MONSTER') || normalized === 'M' || normalized.includes('MERAH') || normalized === '2') {
      chosenTeam = 'M';
    }

    if (!chosenTeam) return;

    audioManager.unlock();
    const state = get();
    const existing = state.viewers[username] || {
      username,
      totalCoins: 0,
      giftsSent: 0,
    };

    const updatedViewer: ViewerProfile = {
      ...existing,
      team: chosenTeam,
    };

    // Release any queued gifts from this viewer
    const readyGifts = state.pendingGifts.filter((g) => g.username === username);
    const remainingPending = state.pendingGifts.filter((g) => g.username !== username);

    set({
      viewers: { ...state.viewers, [username]: updatedViewer },
      pendingGifts: remainingPending,
    });

    // Spawn 1 starter troop when joining a faction
    const eng = state.engineRef;
    if (eng) {
      eng.enqueueSpawn(chosenTeam === 'K' ? 'k_swordsman' : 'm_goblin', chosenTeam === 'K' ? 1 : 2, username);
    }

    state.addFeedEvent({
      team: chosenTeam,
      title: `${username} bergabung ke ${chosenTeam === 'K' ? 'KINGDOM' : 'MONSTERS'}!`,
      detail: chosenTeam === 'K' ? '+1 Swordsman bantuan' : '+2 Goblin bantuan',
    });

    // Trigger any pending gifts now that team is selected
    for (const pg of readyGifts) {
      get().handleViewerGift(pg.username, pg.giftId, chosenTeam, pg.repeatCount);
    }
  },

  handleViewerGift: (username, giftId, forcedTeam, repeatCount = 1) => {
    const gift = resolveGiftConfig(giftId) || GIFT_BY_ID[String(giftId)];
    const eng = get().engineRef;
    if (!gift || !eng) return;

    audioManager.unlock();
    const state = get();
    const viewer = state.viewers[username];
    const team = forcedTeam || viewer?.team;

    // If viewer hasn't chosen a team yet, queue the gift and instruct viewer to comment KINGDOM / MONSTER
    if (!team) {
      set({
        pendingGifts: [
          ...state.pendingGifts,
          { username, giftId: gift.id, repeatCount, timestamp: Date.now() },
        ],
      });
      state.addFeedEvent({
        title: `Gift ${gift.name} dari ${username} ditahan!`,
        detail: `Ketik KINGDOM atau MONSTER di komentar untuk mencairkan gift!`,
      });
      state.addTikTokLog('QUEUED', username, `${gift.name} x${repeatCount} ditahan (belum pilih tim)`);
      return;
    }

    const totalCoinsAdded = gift.coins * repeatCount;
    const updatedViewer: ViewerProfile = {
      username,
      team,
      totalCoins: (viewer?.totalCoins || 0) + totalCoinsAdded,
      giftsSent: (viewer?.giftsSent || 0) + repeatCount,
      likesSent: viewer?.likesSent || 0,
    };

    set({
      viewers: { ...state.viewers, [username]: updatedViewer },
    });

    const spawns = team === 'K' ? gift.kingdomSpawns : gift.monsterSpawns;
    const special = team === 'K' ? gift.kingdomSpecial : gift.monsterSpecial;

    const spawnedDescriptions: string[] = [];
    for (const entry of spawns) {
      const totalCount = entry.count * repeatCount;
      eng.enqueueSpawn(entry.unitId, totalCount, username);
      const uCfg = UNIT_CONFIGS[entry.unitId];
      if (uCfg) {
        spawnedDescriptions.push(`${totalCount}x ${uCfg.name}`);
      }
    }

    if (special) {
      eng.triggerSpecialGiftEffect(special, username);
      spawnedDescriptions.push(special.replace('_', ' '));
    }

    audioManager.playGift(gift.tier);

    state.addFeedEvent({
      team,
      title: `${username} mengirim ${repeatCount > 1 ? `${repeatCount}x ` : ''}${gift.name} (${totalCoinsAdded} koin)`,
      detail: `${team === 'K' ? 'Kingdom' : 'Monsters'}: ${spawnedDescriptions.join(' + ')}`,
      isBoss: gift.tier === 'BOSS' || gift.tier === 'LEGENDARY',
      isLegendary: gift.tier === 'LEGENDARY',
    });
  },

  handleViewerLike: (username, likeCount, forcedTeam) => {
    const state = get();
    const eng = state.engineRef;
    if (!eng) return;

    const viewer = state.viewers[username];
    const team: Faction =
      forcedTeam || viewer?.team || (state.kingdomUnits <= state.monsterUnits ? 'K' : 'M');

    const prevLikes = viewer?.likesSent || 0;
    const nextLikes = prevLikes + likeCount;
    const milestonesCrossed = Math.floor(nextLikes / 50) - Math.floor(prevLikes / 50);

    const updatedViewer: ViewerProfile = {
      username,
      team,
      totalCoins: viewer?.totalCoins || 0,
      giftsSent: viewer?.giftsSent || 0,
      likesSent: nextLikes,
    };

    set({
      viewers: { ...state.viewers, [username]: updatedViewer },
    });

    if (milestonesCrossed > 0) {
      const unitId = team === 'K' ? 'k_swordsman' : 'm_goblin';
      const count = (team === 'K' ? 1 : 2) * milestonesCrossed;
      eng.enqueueSpawn(unitId, count, username);
      state.addFeedEvent({
        team,
        title: `${username} mencapai ${nextLikes} Likes ❤️!`,
        detail: `Bonus Bantuan: +${count} ${team === 'K' ? 'Swordsman' : 'Goblin'}`,
      });
    }
  },
}));
