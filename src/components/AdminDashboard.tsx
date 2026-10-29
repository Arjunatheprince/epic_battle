import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Gift,
  Swords,
  Camera,
  Volume2,
  VolumeX,
  Smartphone,
  Tv,
  Radio,
  MessageSquare,
  X,
  Activity,
  Heart,
  Zap,
  QrCode,
} from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { QrCodeModal } from './QrCodeModal';
import { KINGDOM_UNIT_LIST, MONSTER_UNIT_LIST } from '../config/units';
import { GIFT_CONFIGS } from '../config/gifts';
import { audioManager, type AudioCategory } from '../audio/AudioManager';
import { tikTokLiveClient } from '../services/TikTokLiveClient';
import type { CameraMode, Faction, QualityLevel } from '../types/game';

export const AdminDashboard: React.FC = () => {
  const {
    paused,
    autoSpawn,
    autoCamera,
    cameraMode,
    quality,
    adaptiveQuality,
    profileMetrics,
    fps,
    drawCalls,
    muted,
    masterVolume,
    vertical916,
    obsMode,
    dashboardOpen,
    demoModeEnabled,
    tiktokStatus,
    tiktokRoom,
    tiktokEventLogs,
    pendingGifts,
    togglePause,
    resetRound,
    toggleAutoSpawn,
    toggleAutoCamera,
    setCameraMode,
    setQuality,
    toggleAdaptiveQuality,
    runStressBenchmark,
    toggleMute,
    setMasterVolume,
    toggleVertical916,
    toggleObsMode,
    toggleDashboard,
    toggleDemoMode,
    adminSpawnUnit,
    handleViewerComment,
    handleViewerGift,
  } = useGameStore();

  const [activeTab, setActiveTab] = useState<'SPAWN' | 'GIFTS' | 'TIKTOK' | 'SETTINGS'>('SPAWN');
  const [selectedFaction, setSelectedFaction] = useState<Faction>('K');
  const [giftTeam, setGiftTeam] = useState<Faction>('K');
  const [simUsername, setSimUsername] = useState('Penonton_VIP');
  const [simComment, setSimComment] = useState('KINGDOM');
  const [roomInput, setRoomInput] = useState(tiktokRoom || 'velofit.id');
  const [streakCount, setStreakCount] = useState(1);
  const [qrOpen, setQrOpen] = useState(false);
  const [catVols, setCatVols] = useState<Record<AudioCategory, number>>({
    bgm: audioManager.getCategoryVolume('bgm'),
    combat: audioManager.getCategoryVolume('combat'),
    character: audioManager.getCategoryVolume('character'),
    magic: audioManager.getCategoryVolume('magic'),
    boss: audioManager.getCategoryVolume('boss'),
    gift: audioManager.getCategoryVolume('gift'),
    ambience: audioManager.getCategoryVolume('ambience'),
    ui: audioManager.getCategoryVolume('ui'),
  });

  const handleCatVolChange = (cat: AudioCategory, v: number) => {
    audioManager.setCategoryVolume(cat, v);
    setCatVols((prev) => ({ ...prev, [cat]: v }));
  };

  if (obsMode || !dashboardOpen) return null;

  const displayedUnits = selectedFaction === 'K' ? KINGDOM_UNIT_LIST : MONSTER_UNIT_LIST;
  const cameraModes: CameraMode[] = ['FREE', 'OVERVIEW', 'COMBAT', 'BOSS', 'LEGENDARY', 'SIEGE', 'VICTORY'];
  const qualities: QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

  return (
    <>
      <QrCodeModal open={qrOpen} onClose={() => setQrOpen(false)} />
      <div className="pointer-events-auto absolute right-3 top-28 bottom-14 w-80 sm:w-96 bg-[#130f1ef2] border border-[#d9b25f88] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden z-20 backdrop-blur-md">
      {/* HEADER & QUICK CONTROLS */}
      <div className="p-2.5 bg-[#1b152b] border-b border-[#d9b25f44] flex items-center justify-between gap-1">
        <div className="font-cinzel font-bold text-xs sm:text-sm text-[#f6d88c] flex items-center gap-1.5 truncate">
          <Swords className="w-4 h-4 text-[#d9b25f] shrink-0" />
          <span className="truncate">ADMIN PANEL</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={togglePause}
            className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 border cursor-pointer ${
              paused
                ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                : 'bg-[#28203b] border-[#d9b25f55] text-[#f3ead8] hover:border-[#d9b25f]'
            }`}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? 'Lanjut' : 'Jeda'}
          </button>
          <button
            onClick={resetRound}
            className="px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 bg-[#28203b] border border-[#d9b25f55] text-[#f3ead8] hover:border-[#d9b25f] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={toggleDashboard}
            title="Tutup Admin Panel"
            className="px-2 py-1 rounded text-xs font-bold flex items-center gap-1 bg-red-950/80 hover:bg-red-900 border border-red-500/70 text-red-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Tutup
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="grid grid-cols-4 bg-[#161124] border-b border-[#d9b25f33] text-[11px] font-cinzel font-bold">
        {(
          [
            ['SPAWN', 'Unit (32)'],
            ['GIFTS', 'Gift (29)'],
            ['TIKTOK', 'Sim LIVE'],
            ['SETTINGS', 'Sistem'],
          ] as const
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`py-2 text-center border-b-2 transition cursor-pointer ${
              activeTab === tabKey
                ? 'border-[#d9b25f] text-[#f6d88c] bg-[#221a36]'
                : 'border-transparent text-[#a89c87] hover:text-[#f3ead8]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
        {/* TAB 1: MANUAL UNIT SPAWN (ALL 32 CONFIGURED UNITS) */}
        {activeTab === 'SPAWN' && (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setSelectedFaction('K')}
                className={`py-1.5 rounded font-cinzel font-bold border cursor-pointer ${
                  selectedFaction === 'K'
                    ? 'bg-blue-900/60 border-blue-400 text-blue-200'
                    : 'bg-[#1f1830] border-transparent text-[#a89c87]'
                }`}
              >
                KINGDOM (16)
              </button>
              <button
                onClick={() => setSelectedFaction('M')}
                className={`py-1.5 rounded font-cinzel font-bold border cursor-pointer ${
                  selectedFaction === 'M'
                    ? 'bg-red-900/60 border-red-400 text-red-200'
                    : 'bg-[#1f1830] border-transparent text-[#a89c87]'
                }`}
              >
                MONSTERS (16)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {displayedUnits.map((u) => {
                const defaultBatch = u.tier === 1 ? 5 : u.tier === 2 ? 3 : 1;
                return (
                  <button
                    key={u.id}
                    onClick={() => adminSpawnUnit(u.id, defaultBatch)}
                    className={`p-2 rounded border text-left transition flex flex-col justify-between cursor-pointer ${
                      u.isLegendary
                        ? 'bg-gradient-to-br from-amber-950/60 to-[#241b38] border-amber-500/70 hover:border-amber-300'
                        : u.isBoss
                        ? 'bg-[#291d3d] border-purple-400/60 hover:border-purple-300'
                        : 'bg-[#1e182d] border-[#d9b25f33] hover:border-[#d9b25f]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-[#f6d88c] truncate">{u.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-[#d9b25f]">
                        +{defaultBatch}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[#b5a892] flex items-center justify-between">
                      <span>HP {u.hp}</span>
                      <span>DMG {u.damage}</span>
                      <span>T{u.tier}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: ALL 29 TIKTOK GIFTS SIMULATOR */}
        {activeTab === 'GIFTS' && (
          <div className="space-y-2.5">
            <div className="space-y-1.5 bg-[#1c162b] p-2 rounded border border-[#d9b25f33]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#cfc3ae] font-medium">Nama Pengirim Gift:</span>
                <input
                  type="text"
                  value={simUsername}
                  onChange={(e) => setSimUsername(e.target.value)}
                  placeholder="Nama penonton..."
                  className="w-40 px-2 py-1 rounded bg-[#110d1a] border border-[#d9b25f55] text-[#f6d88c] font-bold text-xs"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[#cfc3ae] font-medium">Kirim Gift Untuk:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setGiftTeam('K')}
                    className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                      giftTeam === 'K'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#2a223d] text-[#a89c87]'
                    }`}
                  >
                    Kingdom
                  </button>
                  <button
                    onClick={() => setGiftTeam('M')}
                    className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                      giftTeam === 'M'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#2a223d] text-[#a89c87]'
                    }`}
                  >
                    Monsters
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {GIFT_CONFIGS.map((g) => (
                <button
                  key={g.id}
                  onClick={() =>
                    handleViewerGift(
                      simUsername.trim() || (giftTeam === 'K' ? 'Sultan_Kingdom' : 'Sultan_Monster'),
                      g.id,
                      giftTeam,
                      1
                    )
                  }
                  className={`p-2 rounded border text-left transition cursor-pointer ${
                    g.tier === 'LEGENDARY'
                      ? 'bg-gradient-to-r from-amber-950/70 to-[#261c3a] border-amber-400/80 hover:border-amber-200'
                      : g.tier === 'BOSS'
                      ? 'bg-[#291d3d] border-purple-400/60 hover:border-purple-300'
                      : 'bg-[#1e182d] border-[#d9b25f33] hover:border-[#d9b25f]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#f6d88c] truncate flex items-center gap-1">
                      <Gift className="w-3 h-3 text-amber-400 shrink-0" />
                      {g.name}
                    </span>
                    <span className="text-[10px] font-mono text-amber-300">{g.coins}c</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[#cfc3ae] truncate">
                    {giftTeam === 'K'
                      ? g.kingdomSpecial ||
                        g.kingdomSpawns.map((s) => `${s.count}x ${s.unitId.replace('k_', '')}`).join(', ')
                      : g.monsterSpecial ||
                        g.monsterSpawns.map((s) => `${s.count}x ${s.unitId.replace('m_', '')}`).join(', ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: TIKTOK LIVE INTERACTION, CONNECTOR & QUEUE TESTER (PHASE 7) */}
        {activeTab === 'TIKTOK' && (
          <div className="space-y-3">
            {/* TIKTOK CONNECTOR & BRIDGE STATUS */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-cinzel font-bold text-[#f6d88c] flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  TikTok LIVE Connector
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    tiktokStatus === 'CONNECTED'
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300'
                      : tiktokStatus === 'CONNECTING'
                      ? 'bg-amber-950/80 border-amber-400 text-amber-300'
                      : 'bg-purple-950/80 border-purple-400 text-purple-200'
                  }`}
                >
                  {tiktokStatus === 'CONNECTED'
                    ? 'BRIDGE ONLINE'
                    : tiktokStatus === 'CONNECTING'
                    ? 'MENGHUBUNGKAN...'
                    : 'DEMO MODE FALLBACK'}
                </span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="@username TikTok LIVE..."
                  className="flex-1 px-2.5 py-1 rounded bg-[#110d1a] border border-[#d9b25f55] text-[#f3ead8] text-xs"
                />
                <button
                  onClick={() => tikTokLiveClient.connectSocket(roomInput)}
                  className="px-2.5 py-1 rounded bg-[#28203b] hover:bg-[#352a4d] border border-[#d9b25f] text-[#f6d88c] font-bold cursor-pointer"
                >
                  Hubungkan
                </button>
              </div>
              <button
                onClick={() => setQrOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500/20 via-[#2a2042] to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-[#d9b25f] text-[#f6d88c] font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span>📱 Tampilkan Kode QR HP (Scan dari Sini)</span>
              </button>
              <div className="flex items-center justify-between pt-1 border-t border-[#d9b25f22]">
                <span className="text-[11px] text-[#cfc3ae]">Auto Demo Streamer:</span>
                <button
                  onClick={toggleDemoMode}
                  className={`px-3 py-0.5 rounded font-bold cursor-pointer ${
                    demoModeEnabled
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#2c2342] text-[#a89c87]'
                  }`}
                >
                  {demoModeEnabled ? 'AKTIF' : 'MATI'}
                </button>
              </div>
            </div>

            {/* INTERACTION SIMULATOR: COMMENT, GIFT ID, COMBO STREAK & LIKES */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-2">
              <div className="font-cinzel font-bold text-[#f6d88c] flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#d9b25f]" />
                Uji Komentar, Likes, Streak & Antrean Gift
              </div>
              <input
                type="text"
                value={simUsername}
                onChange={(e) => setSimUsername(e.target.value)}
                placeholder="Username penonton..."
                className="w-full px-2.5 py-1.5 rounded bg-[#110d1a] border border-[#d9b25f55] text-[#f6d88c] font-bold text-xs"
              />
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={simComment}
                  onChange={(e) => setSimComment(e.target.value)}
                  placeholder="Ketik KINGDOM atau MONSTER"
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#110d1a] border border-[#d9b25f55] text-[#f3ead8] text-xs"
                />
                <button
                  onClick={() =>
                    tikTokLiveClient.processIncomingComment({
                      username: simUsername,
                      comment: simComment,
                    })
                  }
                  className="px-3 py-1.5 rounded bg-[#d9b25f] text-[#110d1a] font-bold cursor-pointer"
                >
                  Kirim
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() =>
                    tikTokLiveClient.processIncomingGift({
                      username: simUsername,
                      giftId: 5655, // Official TikTok Gift ID for Rose
                      diamondCount: 1,
                      repeatCount: 1,
                    })
                  }
                  className="py-1.5 px-2 rounded bg-[#28203b] border border-[#d9b25f44] hover:border-[#d9b25f] text-[#f3ead8] cursor-pointer"
                >
                  Gift ID #5655 (Rose)
                </button>
                <button
                  onClick={() =>
                    tikTokLiveClient.processIncomingGift({
                      username: simUsername,
                      giftId: 5659, // Official TikTok Gift ID for Galaxy
                      diamondCount: 1000,
                      repeatCount: 1,
                    })
                  }
                  className="py-1.5 px-2 rounded bg-[#28203b] border border-[#d9b25f44] hover:border-[#d9b25f] text-[#f6d88c] cursor-pointer"
                >
                  Gift ID #5659 (Galaxy)
                </button>
                <button
                  onClick={() => {
                    const nextStreak = streakCount + 2;
                    setStreakCount(nextStreak);
                    tikTokLiveClient.processIncomingGift({
                      username: simUsername,
                      giftId: 5487, // Finger Heart
                      streakId: 'demo_combo_1',
                      repeatCount: nextStreak,
                      repeatEnd: false,
                    });
                  }}
                  className="py-1.5 px-2 rounded bg-[#28203b] border border-amber-500/50 hover:border-amber-400 text-amber-200 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  Combo Streak (x{streakCount + 2})
                </button>
                <button
                  onClick={() =>
                    tikTokLiveClient.processIncomingLike({
                      username: simUsername,
                      likeCount: 50,
                    })
                  }
                  className="py-1.5 px-2 rounded bg-[#28203b] border border-pink-500/50 hover:border-pink-400 text-pink-200 cursor-pointer flex items-center justify-center gap-1"
                >
                  <Heart className="w-3 h-3 text-pink-400" />
                  Kirim +50 Likes
                </button>
              </div>
              {pendingGifts.length > 0 && (
                <div className="mt-2 p-2 rounded bg-amber-950/50 border border-amber-500/60 text-amber-200 text-[11px]">
                  <strong>Antrean Gift Menunggu Tim ({pendingGifts.length}):</strong>
                  <ul className="mt-1 space-y-0.5">
                    {pendingGifts.map((pg, idx) => (
                      <li key={idx}>
                        • {pg.username}: {pg.giftId} x{pg.repeatCount} (Ketik KINGDOM / MONSTER untuk cairkan)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* LIVE EVENT LOG */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-1.5">
              <div className="font-cinzel font-bold text-[#f6d88c] text-[11px] flex items-center justify-between">
                <span>Log Event TikTok LIVE ({tiktokEventLogs.length})</span>
                <span className="text-[10px] text-[#a89c87] font-sans">Anti-Duplikat & Rate-Limit Aktif</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
                {tiktokEventLogs.length === 0 ? (
                  <div className="text-[#8e8270] italic">Belum ada aktivitas event...</div>
                ) : (
                  tiktokEventLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-1 rounded bg-[#120d1c] border border-[#d9b25f22] flex items-center justify-between gap-1"
                    >
                      <span className="truncate text-[#e6dac6]">
                        <strong className="text-[#f6d88c]">[{log.type}]</strong> {log.username}:{' '}
                        {log.summary}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CAMERA, AUDIO, GRAPHICS & OBS SETTINGS */}
        {activeTab === 'SETTINGS' && (
          <div className="space-y-3">
            {/* CAMERA DIRECTOR */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-cinzel font-bold text-[#f6d88c] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#d9b25f]" />
                  Camera Director
                </span>
                <button
                  onClick={toggleAutoCamera}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                    autoCamera ? 'bg-amber-500 text-black' : 'bg-[#2a223d] text-[#a89c87]'
                  }`}
                >
                  Auto: {autoCamera ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {cameraModes.map((m) => (
                  <button
                    key={m}
                    onClick={() => setCameraMode(m)}
                    className={`py-1 rounded text-[10px] font-bold border cursor-pointer ${
                      cameraMode === m && !autoCamera
                        ? 'bg-[#d9b25f] text-black border-[#d9b25f]'
                        : 'bg-[#141020] text-[#cfc3ae] border-[#d9b25f33]'
                    }`}
                  >
                    {m === 'FREE' ? 'FREE CAM' : m}
                  </button>
                ))}
                <button
                  onClick={() => {
                    const eng = useGameStore.getState().engineRef;
                    if (eng) eng.cameraDirector.resetFreeCamera();
                  }}
                  className="py-1 rounded text-[10px] font-bold border bg-[#261d3a] text-[#f6d88c] border-[#d9b25f66] hover:border-[#d9b25f] cursor-pointer"
                >
                  RESET
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-0.5">
                <button
                  onClick={() => {
                    const eng = useGameStore.getState().engineRef;
                    if (eng) eng.cameraDirector.jumpFreeCameraTo(-34, 18, 28, -0.35, -0.45);
                  }}
                  className="py-1 rounded text-[10px] font-semibold border bg-[#19233d] text-blue-200 border-blue-500/40 hover:border-blue-400 cursor-pointer"
                >
                  Kastil Kingdom
                </button>
                <button
                  onClick={() => {
                    const eng = useGameStore.getState().engineRef;
                    if (eng) eng.cameraDirector.jumpFreeCameraTo(0, 22, 32, 0, -0.52);
                  }}
                  className="py-1 rounded text-[10px] font-semibold border bg-[#231b33] text-[#f6d88c] border-[#d9b25f44] hover:border-[#d9b25f] cursor-pointer"
                >
                  Tengah Arena
                </button>
                <button
                  onClick={() => {
                    const eng = useGameStore.getState().engineRef;
                    if (eng) eng.cameraDirector.jumpFreeCameraTo(34, 18, 28, 0.35, -0.45);
                  }}
                  className="py-1 rounded text-[10px] font-semibold border bg-[#3a1926] text-red-200 border-red-500/40 hover:border-red-400 cursor-pointer"
                >
                  Kastil Monster
                </button>
              </div>
              <div className="text-[10px] text-[#b5a892] bg-[#130e1d] p-1.5 rounded border border-[#d9b25f22] leading-relaxed">
                <strong className="text-[#f6d88c]">Kamera Bebas Penuh (6-DOF Free-Fly, Tanpa Titik Terpaku):</strong>
                <br />• <strong>Klik Kiri + Geser:</strong> Geser posisi kamera bebas ke seluruh peta
                <br />• <strong>Klik Kanan (atau Shift + Klik Kiri) + Geser:</strong> Putar kepala kamera 360° bebas
                <br />• <strong>Scroll Mouse:</strong> Terbang maju / mundur menembus ruang ke arah pandang
                <br />• <strong>W, A, S, D / Panah / Q, E / Spasi:</strong> Terbang 3D bebas (+Shift cepat)
              </div>
            </div>

            {/* AUDIO & ADAPTIVE BGM */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-cinzel font-bold text-[#f6d88c] flex items-center gap-1.5">
                  {muted ? (
                    <VolumeX className="w-3.5 h-3.5 text-red-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-[#d9b25f]" />
                  )}
                  Audio & Musik Adaptif
                </span>
                <button
                  onClick={toggleMute}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                    !muted ? 'bg-emerald-600 text-white' : 'bg-red-800 text-red-200'
                  }`}
                >
                  {muted ? 'MUTED' : 'AKTIF'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#b5a892] w-16">Master:</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-[#d9b25f]"
                />
                <span className="text-[10px] font-mono w-8 text-right">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              {(
                [
                  ['bgm', 'Musik BGM'],
                  ['combat', 'Combat SFX'],
                  ['magic', 'Magic SFX'],
                  ['boss', 'Boss & Gift'],
                ] as const
              ).map(([catKey, label]) => (
                <div key={catKey} className="flex items-center gap-2">
                  <span className="text-[10px] text-[#b5a892] w-16">{label}:</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={catVols[catKey]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      handleCatVolChange(catKey, val);
                      if (catKey === 'boss') handleCatVolChange('gift', val);
                    }}
                    className="flex-1 accent-[#d9b25f]"
                  />
                  <span className="text-[10px] font-mono w-8 text-right">
                    {Math.round(catVols[catKey] * 100)}%
                  </span>
                </div>
              ))}
            </div>

            {/* GRAPHICS QUALITY, ADAPTIVE SCALER & PHASE 8 PROFILER */}
            <div className="p-2.5 rounded-lg bg-[#1c162b] border border-[#d9b25f44] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-cinzel font-bold text-[#f6d88c] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#d9b25f]" />
                  Grafis, LOD & Profiler (Phase 8)
                </span>
                <button
                  onClick={toggleAdaptiveQuality}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    adaptiveQuality ? 'bg-emerald-600 text-white' : 'bg-[#2a223d] text-[#a89c87]'
                  }`}
                >
                  Auto-Scale: {adaptiveQuality ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {qualities.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuality(q)}
                    className={`py-1 rounded text-[10px] font-bold border cursor-pointer ${
                      quality === q
                        ? 'bg-[#d9b25f] text-black border-[#d9b25f]'
                        : 'bg-[#141020] text-[#cfc3ae] border-[#d9b25f33]'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* REAL-TIME PROFILER & BALANCING METRICS */}
              <div className="bg-[#120d1c] border border-[#d9b25f28] rounded p-2 font-mono text-[10px] space-y-1 text-[#d5c8b2]">
                <div className="flex justify-between">
                  <span>FPS / Draw Calls:</span>
                  <span className="text-[#f6d88c]">
                    {fps} FPS · {drawCalls} DC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Sim Step / Anim Time:</span>
                  <span className="text-emerald-300">
                    {profileMetrics.stepTimeMs}ms / {profileMetrics.animTimeMs}ms
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>LOD (Near/Mid/Far/Cull):</span>
                  <span>
                    {profileMetrics.lodNear} / {profileMetrics.lodMid} / {profileMetrics.lodFar} /{' '}
                    {profileMetrics.culledCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Power & Comeback Boost:</span>
                  <span>
                    <strong className="text-blue-300">
                      K:{profileMetrics.powerScoreK} ({profileMetrics.comebackBoostK.toFixed(2)}x)
                    </strong>{' '}
                    |{' '}
                    <strong className="text-red-300">
                      M:{profileMetrics.powerScoreM} ({profileMetrics.comebackBoostM.toFixed(2)}x)
                    </strong>
                  </span>
                </div>
              </div>

              <button
                onClick={() => runStressBenchmark(150)}
                className="w-full py-1.5 px-2 rounded font-bold bg-[#281e3d] hover:bg-[#362852] border border-amber-500/60 text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Benchmark Stress Test (+150 Pasukan Massal)
              </button>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={toggleAutoSpawn}
                  className={`py-1.5 px-2 rounded font-bold border cursor-pointer ${
                    autoSpawn
                      ? 'bg-[#2a213d] border-[#d9b25f] text-[#f6d88c]'
                      : 'bg-[#141020] border-transparent text-[#a89c87]'
                  }`}
                >
                  Auto Wave: {autoSpawn ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={toggleVertical916}
                  className={`py-1.5 px-2 rounded font-bold border flex items-center justify-center gap-1 cursor-pointer ${
                    vertical916
                      ? 'bg-[#2a213d] border-[#d9b25f] text-[#f6d88c]'
                      : 'bg-[#141020] border-transparent text-[#a89c87]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Format 9:16
                </button>
              </div>

              <button
                onClick={toggleObsMode}
                className="w-full py-1.5 px-2 rounded font-bold bg-[#261e38] hover:bg-[#32274a] border border-[#d9b25f66] text-[#f6d88c] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Tv className="w-3.5 h-3.5" />
                Mode OBS Clean Overlay (Tekan ESC untuk kembali)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
