import React, { useEffect, useState, useCallback } from 'react';
import { BattleViewport } from './components/BattleViewport';
import { HudOverlay } from './components/HudOverlay';
import { AdminDashboard } from './components/AdminDashboard';
import { useGameStore } from './store/useGameStore';
import { audioManager } from './audio/AudioManager';

const isMobileDevice =
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const App: React.FC = () => {
  const vertical916 = useGameStore((s) => s.vertical916);
  const obsMode = useGameStore((s) => s.obsMode);
  const toggleObsMode = useGameStore((s) => s.toggleObsMode);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const [dismissedPrompt, setDismissedPrompt] = useState(false);

  const enterFullscreen = useCallback(async () => {
    audioManager.unlock();
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
      }
      setIsFullscreen(Boolean(document.fullscreenElement));
    } catch {
      // Ignore if blocked before gesture
    }
    try {
      if ('wakeLock' in navigator) {
        await (navigator as any).wakeLock.request('screen');
      }
    } catch {
      // Ignore wakeLock error
    }
  }, []);

  const openTikTokAndFullscreen = useCallback(
    async (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      await enterFullscreen();
      setDismissedPrompt(true);
      // Deep-link to TikTok app (Indonesia package com.ss.android.ugc.trill)
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        window.location.href =
          'intent://live#Intent;scheme=snssdk1180;package=com.ss.android.ugc.trill;S.browser_fallback_url=https%3A%2F%2Fwww.tiktok.com%2F%40velofit.id%2Flive;end';
      } else {
        window.location.href = 'tiktok://live';
      }
    },
    [enterFullscreen]
  );

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    // Attempt auto-fullscreen on load (works if launched as installed PWA or allowed by browser)
    if (isMobileDevice || obsMode) {
      enterFullscreen();
    }

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, [enterFullscreen, obsMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useGameStore.getState().obsMode && !isMobileDevice) {
        toggleObsMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleObsMode]);

  return (
    <div
      onClick={() => {
        if ((isMobileDevice || obsMode) && !document.fullscreenElement) {
          enterFullscreen();
        }
      }}
      className="w-screen h-[100dvh] bg-[#07050b] flex items-center justify-center overflow-hidden relative"
    >
      <div
        className={`relative h-full overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.95)] ${
          vertical916 && !isMobileDevice
            ? 'aspect-[9/16] w-auto max-w-full border-x border-[#d9b25f44]'
            : 'w-full h-full'
        }`}
      >
        <BattleViewport />
        <HudOverlay />
        <AdminDashboard />

        {/* MOBILE / MIRROR FULLSCREEN & TIKTOK LIVE LAUNCHER (Auto-hides 100% once in Fullscreen!) */}
        {(isMobileDevice || obsMode) && !isFullscreen && !dismissedPrompt && (
          <div
            onClick={() => enterFullscreen()}
            className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-5 text-center"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs bg-[#151021] border-2 border-[#d9b25f] rounded-2xl p-5 shadow-[0_0_50px_rgba(0,0,0,0.95)] flex flex-col gap-3"
            >
              <div className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/70 border border-emerald-500/40 rounded-full px-3 py-1 mx-auto">
                🟢 Layar Siaran HP Terhubung
              </div>
              <h3 className="font-cinzel font-extrabold text-lg text-[#f6d88c] leading-snug">
                Mode Siaran Fullscreen
              </h3>
              <p className="text-xs text-[#d8ccb8] leading-relaxed">
                Hilangkan bar browser Chrome agar tampilan game <strong>100% Fullscreen Penuh</strong> untuk disiarkan ke TikTok LIVE:
              </p>

              <button
                onClick={() => enterFullscreen()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-cinzel font-extrabold text-sm shadow-lg border border-emerald-300/50 active:scale-95 transition cursor-pointer"
              >
                📺 TAMPILKAN GAME FULLSCREEN PENUH
              </button>

              <button
                onClick={openTikTokAndFullscreen}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#ff0050] to-[#d60043] hover:opacity-95 text-white font-bold text-xs shadow-lg border border-pink-400/50 active:scale-95 transition cursor-pointer"
              >
                🔴 BUKA APLIKASI TIKTOK LIVE + FULLSCREEN
              </button>

              <div className="text-[10px] text-[#a89c87] leading-tight pt-1">
                Tips: Setelah mulai LIVE Game Seluler di aplikasi TikTok, kembali ke layar ini lalu <strong>ketuk layar 1x di mana saja</strong> untuk langsung Fullscreen bersih.
              </div>
            </div>
          </div>
        )}

        {/* If user exited fullscreen temporarily by switching apps, show a tiny 1-tap restore bar at the very top */}
        {(isMobileDevice || obsMode) && !isFullscreen && dismissedPrompt && (
          <div
            onClick={() => enterFullscreen()}
            className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-emerald-950/90 border border-emerald-400 text-emerald-200 px-3.5 py-1.5 rounded-full text-[11px] font-bold shadow-xl whitespace-nowrap cursor-pointer animate-bounce"
          >
            👆 Ketuk Layar 1x untuk Fullscreen Penuh (Hilangkan Bar Browser)
          </div>
        )}

        {obsMode && !isMobileDevice && (
          <button
            onClick={toggleObsMode}
            title="Keluar dari Mode OBS"
            className="absolute top-2 right-2 z-30 opacity-0 hover:opacity-100 bg-black/80 text-[#f6d88c] border border-[#d9b25f] px-2 py-1 rounded text-[10px] transition cursor-pointer"
          >
            Keluar Mode OBS
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
