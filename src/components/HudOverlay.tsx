import React, { useState } from 'react';
import { Shield, Skull, Crown, Flame, Sparkles, Video, Sliders, QrCode } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { QrCodeModal } from './QrCodeModal';
import { GiftGuideOverlay } from './GiftGuideOverlay';

const PHASE_LABELS: Record<string, string> = {
  PREPARATION: 'PERSIAPAN',
  NORMAL_BATTLE: 'PERTEMPURAN',
  INTENSE_BATTLE: 'PERTEMPURAN SENGIT',
  FINAL_CLASH: 'FINAL CLASH!',
  VICTORY_KINGDOM: 'KINGDOM MENANG!',
  VICTORY_MONSTERS: 'MONSTERS MENANG!',
};

export const HudOverlay: React.FC = () => {
  const {
    kingdomHp,
    monsterHp,
    maxCastleHp,
    kingdomUnits,
    monsterUnits,
    unitCap,
    phase,
    timeRemainingSec,
    fps,
    drawCalls,
    cameraMode,
    bannerTitle,
    bannerSubtitle,
    bannerVisible,
    bossAnnouncement,
    eventFeed,
    viewers,
    paused,
    obsMode,
    dashboardOpen,
    toggleDashboard,
    giftGuideOpen,
    setGiftGuideOpen,
  } = useGameStore();

  const kPct = Math.max(0, Math.min(100, (kingdomHp / maxCastleHp) * 100));
  const mPct = Math.max(0, Math.min(100, (monsterHp / maxCastleHp) * 100));

  const mins = Math.floor(timeRemainingSec / 60);
  const secs = Math.floor(timeRemainingSec % 60);
  const formattedTime = `${mins}:${String(secs).padStart(2, '0')}`;

  const topContributors = Object.values(viewers)
    .sort((a, b) => b.totalCoins - a.totalCoins)
    .slice(0, 4);

  const [qrOpen, setQrOpen] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 z-10">
      <QrCodeModal open={qrOpen} onClose={() => setQrOpen(false)} />
      {/* TOP BAR: KINGDOM HP | TIMER & PHASE | MONSTERS HP */}
      <div className="w-full flex flex-col gap-2">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2.5 items-start bg-[#110d1ae6] border border-[#d9b25f66] rounded-lg px-3 py-2 shadow-2xl backdrop-blur-sm">
          {/* KINGDOM SIDE */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs sm:text-sm font-cinzel font-bold">
              <span className="flex items-center gap-1.5 text-blue-300">
                <Shield className="w-4 h-4 text-[#d9b25f]" />
                KINGDOM
              </span>
              <span className="text-[#f3ead8] font-sans text-xs">
                {kingdomHp.toLocaleString('id-ID')} HP · <strong className="text-blue-400">{kingdomUnits}</strong> Pasukan
              </span>
            </div>
            <div className="h-3.5 w-full bg-black/75 border border-[#d9b25f] rounded overflow-hidden p-0.5">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-blue-700 via-blue-500 to-sky-300 transition-all duration-300"
                style={{ width: `${kPct}%` }}
              />
            </div>
          </div>

          {/* CENTER CLOCK & PHASE */}
          <div className="flex flex-col items-center px-2 min-w-[110px]">
            <div className="font-cinzel font-extrabold text-xl sm:text-2xl text-[#f6d88c] tracking-wider leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              {formattedTime}
            </div>
            <div
              className={`mt-1 px-2 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-widest uppercase border ${
                phase === 'FINAL_CLASH'
                  ? 'bg-red-950/90 text-red-300 border-red-500 animate-pulse'
                  : 'bg-[#1f192d] text-[#d9b25f] border-[#d9b25f55]'
              }`}
            >
              {PHASE_LABELS[phase] || phase}
              {paused ? ' (JEDA)' : ''}
            </div>
          </div>

          {/* MONSTERS SIDE */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs sm:text-sm font-cinzel font-bold">
              <span className="text-[#f3ead8] font-sans text-xs">
                <strong className="text-red-400">{monsterUnits}</strong> Pasukan · {monsterHp.toLocaleString('id-ID')} HP
              </span>
              <span className="flex items-center gap-1.5 text-red-300">
                MONSTERS
                <Skull className="w-4 h-4 text-red-400" />
              </span>
            </div>
            <div className="h-3.5 w-full bg-black/75 border border-[#d9b25f] rounded overflow-hidden p-0.5 flex justify-end">
              <div
                className="h-full rounded-sm bg-gradient-to-l from-red-800 via-red-500 to-purple-400 transition-all duration-300"
                style={{ width: `${mPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* BOSS / LEGENDARY HEALTH BAR */}
        {bossAnnouncement && (
          <div className="mx-auto w-full max-w-md bg-[#160f24eb] border-2 border-[#d9b25f] rounded-lg px-3.5 py-2 shadow-[0_0_25px_rgba(217,178,95,0.3)] transition-all">
            <div className="flex items-center justify-between text-xs font-cinzel font-bold mb-1">
              <span className="flex items-center gap-1.5 text-[#f6d88c]">
                {bossAnnouncement.isLegendary ? (
                  <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4 text-orange-400" />
                )}
                {bossAnnouncement.unitName}
              </span>
              <span className="text-[11px] font-sans text-amber-200/90">
                Summoner: <strong>{bossAnnouncement.senderName}</strong>
              </span>
            </div>
            <div className="h-2.5 w-full bg-black/80 border border-amber-500/60 rounded overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  bossAnnouncement.team === 'K'
                    ? 'bg-gradient-to-r from-blue-500 via-sky-300 to-amber-300'
                    : 'bg-gradient-to-r from-purple-700 via-red-600 to-orange-400'
                }`}
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (bossAnnouncement.hp / bossAnnouncement.maxHp) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* LIVE VISUAL GIFT STRIP & INTERACTIVE GIFT GUIDE MODAL */}
        <GiftGuideOverlay
          guideOpen={giftGuideOpen}
          onToggleGuide={(next) => setGiftGuideOpen(next !== undefined ? next : !giftGuideOpen)}
        />

        {/* SUB-BAR: JOIN INSTRUCTIONS & ADMIN BUTTON */}
        <div className="flex items-center justify-between gap-2">
          <div className="bg-[#120e1be0] border border-[#d9b25f44] rounded-md px-2.5 py-1 text-[10px] sm:text-[11px] flex items-center gap-2 text-[#e2d6c1]">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              Komentar <strong className="text-blue-400">KINGDOM</strong> /{' '}
              <strong className="text-red-400">MONSTER</strong> (pilih tim) · Ketik{' '}
              <strong className="text-amber-300">GIFT</strong> (buka tabel gift)
            </span>
          </div>

          {!obsMode && (
            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                onClick={() => setQrOpen(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-[#2c2146] to-[#1b1528] hover:from-[#3d2e61] hover:to-[#2a203d] text-[#f6d88c] border border-[#d9b25f] rounded-md px-3 py-1.5 text-xs font-cinzel font-bold shadow-lg transition cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                Kode QR HP
              </button>
              <button
                onClick={toggleDashboard}
                className="flex items-center gap-1.5 bg-[#1b1528] hover:bg-[#2a203d] text-[#f6d88c] border border-[#d9b25f] rounded-md px-3 py-1.5 text-xs font-cinzel font-bold shadow-lg transition cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                {dashboardOpen ? 'Tutup Panel' : 'Admin Panel'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Announcements sit above the action instead of covering the combat center. */}
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!bannerVisible}
        className={`absolute top-[25%] left-1/2 -translate-x-1/2 w-max max-w-[90%] text-center rounded-xl transition-all duration-500 transform ${
          bannerVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {bannerTitle && (
          <div className="bg-gradient-to-b from-[#171124dd] to-[#0b0812dd] border-y border-[#d9b25f] px-4 py-2 rounded-lg shadow-lg">
            <h2 className="font-cinzel font-black text-lg sm:text-2xl text-[#f6d88c] tracking-wider drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
              {bannerTitle}
            </h2>
            {bannerSubtitle && (
              <p className="mt-1.5 text-xs sm:text-sm text-[#e5d5b5] font-medium">
                {bannerSubtitle}
              </p>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM SECTION: GIFT EVENT FEED & TOP SUPPORTERS + METRICS */}
      <div className="w-full flex items-end justify-between gap-3">
        {/* RECENT GIFT & BATTLE FEED */}
        <div className="flex flex-col gap-1.5 max-w-[62%] sm:max-w-sm">
          {eventFeed.map((ev) => (
            <div
              key={ev.id}
              className={`bg-[#100c18e6] border-l-4 rounded-r-md px-3 py-1.5 shadow-md backdrop-blur-xs transition-all ${
                ev.isLegendary
                  ? 'border-amber-400 bg-gradient-to-r from-amber-950/80 to-[#100c18e6]'
                  : ev.team === 'K'
                  ? 'border-blue-400'
                  : ev.team === 'M'
                  ? 'border-red-500'
                  : 'border-[#d9b25f]'
              }`}
            >
              <div className="text-xs font-bold text-[#f6d88c] leading-snug">{ev.title}</div>
              <div className="text-[11px] text-[#cfc3ae] leading-tight">{ev.detail}</div>
            </div>
          ))}
        </div>

        {/* RIGHT COLUMN: LEADERBOARD & TELEMETRY */}
        <div className="flex flex-col items-end gap-1.5">
          {topContributors.length > 0 && (
            <div className="bg-[#120e1ce6] border border-[#d9b25f55] rounded-lg p-2.5 w-48 shadow-lg">
              <div className="flex items-center gap-1.5 text-[11px] font-cinzel font-bold text-[#d9b25f] mb-1.5 border-b border-[#d9b25f33] pb-1">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                TOP SUPPORTERS
              </div>
              <div className="flex flex-col gap-1">
                {topContributors.map((v, i) => (
                  <div key={v.username} className="flex items-center justify-between text-[11px]">
                    <span className="truncate max-w-[115px] text-[#f3ead8]">
                      {i + 1}.{' '}
                      <span
                        className={
                          v.team === 'K'
                            ? 'text-blue-300 font-semibold'
                            : v.team === 'M'
                            ? 'text-red-300 font-semibold'
                            : ''
                        }
                      >
                        {v.username}
                      </span>
                    </span>
                    <span className="text-amber-300 font-mono text-[10px]">{v.totalCoins}c</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PERFORMANCE & CAMERA TELEMETRY (Hidden on HP Mirror / OBS Broadcast) */}
          {!obsMode && (
            <div className="bg-[#0e0b16cc] border border-[#d9b25f33] rounded px-2.5 py-1 text-[10px] text-[#a89c87] flex items-center gap-2 font-mono">
              <Video className="w-3 h-3 text-[#d9b25f]" />
              <span>CAM: {cameraMode}</span>
              <span>|</span>
              <span className={fps >= 50 ? 'text-emerald-400' : 'text-amber-400'}>{fps} FPS</span>
              <span>|</span>
              <span>
                {kingdomUnits + monsterUnits}/{unitCap} UNIT
              </span>
              <span>|</span>
              <span>{drawCalls} DC</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
