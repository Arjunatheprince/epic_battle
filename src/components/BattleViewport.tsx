import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildArenaScene } from '../rendering/ArenaBuilder';
import { VfxManager } from '../engine/VfxManager';
import { CameraDirector, mirrorFramingScale } from '../engine/CameraDirector';
import {
  MAX_CASTLE_HP,
  PREP_DURATION,
  ROUND_DURATION,
  SimulationEngine,
} from '../engine/SimulationEngine';
import { useGameStore } from '../store/useGameStore';
import { audioManager } from '../audio/AudioManager';
import { GIFT_CONFIGS } from '../config/gifts';
import { tikTokLiveClient } from '../services/TikTokLiveClient';

import { FixedStepClock } from '../engine/FixedStepClock';

export const BattleViewport: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quality = useGameStore((s) => s.quality);
  const demoModeEnabled = useGameStore((s) => s.demoModeEnabled);

  const engineInstanceRef = useRef<SimulationEngine | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const searchParams = new URLSearchParams(window.location.search);
    const isSlaveMirror =
      searchParams.has('obs') ||
      searchParams.has('slave') ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSlaveMirror,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSlaveMirror ? 1.0 : 1.5));
    renderer.shadowMap.enabled = !isSlaveMirror;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.prepend(renderer.domElement);
    rendererRef.current = renderer;

    const arena = buildArenaScene();
    if (isSlaveMirror) {
      arena.sunLight.castShadow = false;
    }
    sunLightRef.current = arena.sunLight;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.2, 320);
    const vfx = new VfxManager(arena.scene, 150);
    const cameraDirector = new CameraDirector();
    cameraDirector.setObstacles(arena.cameraObstacles);
    cameraDirector.setOnModeChange((mode, autoEnabled) => {
      useGameStore.setState({ cameraMode: mode, autoCamera: autoEnabled });
    });

    // Interactive Free Camera Mouse / Touch / Wheel / Keyboard Controls
    const activeKeys = new Set<string>();
    let isDragging = false;
    let dragMode: 'PAN' | 'ROTATE' | 'VPAN' = 'PAN';
    let lastPointerX = 0;
    let lastPointerY = 0;

    const domEl = renderer.domElement;
    domEl.style.cursor = 'grab';

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onPointerDown = (e: PointerEvent) => {
      audioManager.unlock();
      isDragging = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      if (e.button === 2 || e.shiftKey) {
        dragMode = 'ROTATE';
      } else if (e.button === 1 || e.altKey) {
        dragMode = 'VPAN';
      } else {
        dragMode = 'PAN';
      }
      domEl.style.cursor = dragMode === 'ROTATE' ? 'crosshair' : 'grabbing';
      domEl.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;

      if (dragMode === 'ROTATE' || e.shiftKey) {
        cameraDirector.handleRotate(dx, dy);
      } else if (dragMode === 'VPAN' || e.altKey) {
        cameraDirector.handleVerticalPan(dx, dy);
      } else {
        cameraDirector.handlePan(dx, dy);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      domEl.style.cursor = 'grab';
      try {
        domEl.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if not captured
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraDirector.handleZoom(e.deltaY);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      activeKeys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      activeKeys.delete(e.code);
    };

    domEl.addEventListener('contextmenu', onContextMenu);
    domEl.addEventListener('pointerdown', onPointerDown);
    domEl.addEventListener('pointermove', onPointerMove);
    domEl.addEventListener('pointerup', onPointerUp);
    domEl.addEventListener('pointercancel', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const store = useGameStore.getState();
    const engine = new SimulationEngine(arena.scene, vfx, cameraDirector, {
      onBanner: (title, sub, dur) => useGameStore.getState().showBanner(title, sub, dur),
      onBossAnnounce: (boss) => useGameStore.getState().setBossAnnouncement(boss),
    });

    engineInstanceRef.current = engine;
    store.setEngineRef(engine);

    let slaveCam: any = null;
    let slavePollTimer: ReturnType<typeof setInterval> | null = null;
    if (isSlaveMirror) {
      useGameStore.setState({ obsMode: true, vertical916: true, demoModeEnabled: false });
      slavePollTimer = setInterval(() => {
        tikTokLiveClient.requestMirrorInit();
      }, 180);
    }

    // Initialize Phase 7 TikTok LIVE Bridge Client (auto-fallbacks to Demo Mode if backend is offline)
    tikTokLiveClient.init({
      onStatusChange: (status, roomUser) => {
        useGameStore.getState().setTikTokConnectionState(status, roomUser);
        if (status === 'CONNECTED' && isSlaveMirror) {
          tikTokLiveClient.requestMirrorInit();
        }
      },
      onComment: (username, comment) => {
        if (!isSlaveMirror) useGameStore.getState().handleViewerComment(username, comment);
      },
      onGift: (username, giftId, deltaRepeat, forcedTeam) => {
        if (!isSlaveMirror) useGameStore.getState().handleViewerGift(username, giftId, forcedTeam, deltaRepeat);
      },
      onLike: (username, likeCount, forcedTeam) => {
        if (!isSlaveMirror) useGameStore.getState().handleViewerLike(username, likeCount, forcedTeam);
      },
      onLog: (type, username, summary, team) =>
        useGameStore.getState().addTikTokLog(type, username, summary, team),
      onCameraSync: (camData) => {
        if (isSlaveMirror && camData) {
          slaveCam = camData;
        }
      },
      onStateSync: (stateData) => {
        if (isSlaveMirror && stateData) {
          if (stateData.bn) {
            useGameStore.setState({ bannerTitle: stateData.bn.title, bannerSubtitle: stateData.bn.subtitle,
              bannerVisible: Boolean(stateData.bn.visible) });
          }
          if (stateData.gg !== undefined) {
            const wantOpen = Boolean(stateData.gg);
            if (useGameStore.getState().giftGuideOpen !== wantOpen) {
              useGameStore.setState({ giftGuideOpen: wantOpen });
            }
          }
          engine.applyMirrorState(stateData);
        }
      },
    });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 1 ? 60 : 45;
      camera.updateProjectionMatrix();
    };

    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);
    handleResize();

    const unlockAudio = () => audioManager.unlock();
    window.addEventListener('pointerdown', unlockAudio, { once: true });

    let animFrameId = 0;
    let lastTime = performance.now();
    const simulationClock = new FixedStepClock();
    let hudSyncTimer = 0;
    let camSyncTimer = 0;
    let stateSyncTimer = 0;
    let frameCounter = 0;
    let fpsClock = 0;
    let currentFps = 60;
    let lowFpsStreak = 0;

    const loop = (now: number) => {
      const elapsed = Math.max(0, (now - lastTime) / 1000);
      const dt = Math.min(0.1, elapsed);
      lastTime = now;

      if (!isSlaveMirror) {
        simulationClock.advance(elapsed, engine.paused, (step) => engine.stepFixed(step));
      } else {
        for (const u of engine.units) {
          u.x += (u.vx - u.x) * Math.min(1, dt * 14);
          u.z += (u.vz - u.z) * Math.min(1, dt * 14);
        }
      }

      // Rotate Spawn Portal Rings & Scale Castles by HP
      arena.kingdomPortalRing.rotation.z += dt * 1.8;
      arena.monsterPortalRing.rotation.z -= dt * 1.8;

      const kRatio = engine.castleHp.K / MAX_CASTLE_HP;
      const mRatio = engine.castleHp.M / MAX_CASTLE_HP;
      arena.kingdomCastle.scale.y = 0.55 + 0.45 * kRatio;
      arena.monsterCastle.scale.y = 0.55 + 0.45 * mRatio;

      engine.updateVisuals(dt, camera, isSlaveMirror);

      if (isSlaveMirror && slaveCam) {
        camera.position.set(slaveCam.px, slaveCam.py, slaveCam.pz);
        if (slaveCam.mode !== 'FREE' && Number.isFinite(slaveCam.fx) && Number.isFinite(slaveCam.fov) && slaveCam.aspect > 0) {
          const scale = mirrorFramingScale(slaveCam.fov, slaveCam.aspect, camera.fov, camera.aspect);
          camera.position.set(
            slaveCam.fx + (slaveCam.px - slaveCam.fx) * scale,
            slaveCam.fy + (slaveCam.py - slaveCam.fy) * scale,
            slaveCam.fz + (slaveCam.pz - slaveCam.fz) * scale
          );
        }
        camera.quaternion.set(slaveCam.qx, slaveCam.qy, slaveCam.qz, slaveCam.qw);
      } else {
        cameraDirector.handleKeyboardMove(dt, activeKeys);
        cameraDirector.update(
          engine.paused && cameraDirector.getMode() !== 'FREE' ? 0 : dt,
          camera,
          engine.units,
          engine.castleHp,
          MAX_CASTLE_HP
        );
      }

      if (document.visibilityState === 'visible') renderer.render(arena.scene, camera);

      if (!isSlaveMirror) {
        camSyncTimer -= dt;
        stateSyncTimer -= dt;
        if (camSyncTimer <= 0 || stateSyncTimer <= 0) {
          const camPayload = {
            page: window.location.pathname,
            ...cameraDirector.getFramingSnapshot(),
            fov: camera.fov,
            aspect: camera.aspect,
            px: Number(camera.position.x.toFixed(2)),
            py: Number(camera.position.y.toFixed(2)),
            pz: Number(camera.position.z.toFixed(2)),
            qx: Number(camera.quaternion.x.toFixed(4)),
            qy: Number(camera.quaternion.y.toFixed(4)),
            qz: Number(camera.quaternion.z.toFixed(4)),
            qw: Number(camera.quaternion.w.toFixed(4)),
          };
          let statePayload: any = undefined;
          if (stateSyncTimer <= 0) {
            stateSyncTimer = 0.075;
            statePayload = {
              page: window.location.pathname,
              gg: useGameStore.getState().giftGuideOpen ? 1 : 0,
              bn: { title: useGameStore.getState().bannerTitle, subtitle: useGameStore.getState().bannerSubtitle,
                visible: useGameStore.getState().bannerVisible },
              ...engine.serializeMirrorState(),
            };
          }
          camSyncTimer = 0.04;
          tikTokLiveClient.emitMasterSync(camPayload, statePayload);
        }
      }

      frameCounter++;
      fpsClock += dt;
      if (fpsClock >= 1.0) {
        currentFps = frameCounter;
        frameCounter = 0;
        fpsClock = 0;

        // Phase 8 Adaptive Quality Auto-Scaler
        const st = useGameStore.getState();
        if (st.adaptiveQuality && !st.paused && document.visibilityState === 'visible') {
          if (currentFps < 38 && st.quality !== 'LOW') {
            lowFpsStreak++;
            if (lowFpsStreak >= 3) {
              lowFpsStreak = 0;
              const nextQ =
                st.quality === 'ULTRA' ? 'HIGH' : st.quality === 'HIGH' ? 'MEDIUM' : 'LOW';
              st.setQuality(nextQ);
            }
          } else {
            lowFpsStreak = 0;
          }
        }
      }

      hudSyncTimer -= dt;
      if (hudSyncTimer <= 0) {
        hudSyncTimer = 0.14;

        const timeRemainingSec =
          engine.phase === 'PREPARATION'
            ? Math.max(0, PREP_DURATION - engine.roundClock)
            : engine.phase === 'VICTORY_KINGDOM' || engine.phase === 'VICTORY_MONSTERS'
            ? 0
            : Math.max(0, ROUND_DURATION - engine.roundClock);

        // Find live boss HP if any boss is active
        const activeBoss = engine.units.find((u) => !u.dead && (u.cfg.isBoss || u.cfg.isLegendary));
        const currentBossState = useGameStore.getState().bossAnnouncement;
        const updatedBoss = activeBoss
          ? {
              unitName: activeBoss.cfg.name,
              team: activeBoss.team,
              senderName: activeBoss.summonerName || (activeBoss.team === 'K' ? 'Kingdom' : 'Monsters'),
              hp: Math.ceil(activeBoss.hp),
              maxHp: activeBoss.maxHp,
              isLegendary: !!activeBoss.cfg.isLegendary,
            }
          : currentBossState && engine.units.length === 0
          ? null
          : null;

        useGameStore.getState().syncTelemetry({
          kingdomHp: Math.ceil(engine.castleHp.K),
          monsterHp: Math.ceil(engine.castleHp.M),
          kingdomUnits: engine.activeCount.K,
          monsterUnits: engine.activeCount.M,
          unitCap: engine.unitCap,
          phase: engine.phase,
          timeRemainingSec,
          fps: currentFps,
          drawCalls: renderer.info.render.calls,
          cameraMode: cameraDirector.getMode(),
          bossAnnouncement: updatedBoss,
          profileMetrics: engine.profileMetrics,
        });
      }
    };

    const animate = (now: number) => {
      if (document.visibilityState === 'visible') loop(now);
      animFrameId = requestAnimationFrame(animate);
    };
    const ticker = new Worker(new URL('../engine/battleTicker.worker.ts', import.meta.url), { type: 'module' });
    ticker.onmessage = () => {
      if (document.visibilityState !== 'visible') loop(performance.now());
      ticker.postMessage('ack');
    };
    const onVisibilityChange = () => {
      activeKeys.clear();
      // Consume the transition once; both clocks share lastTime to avoid double steps.
      loop(performance.now());
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    animFrameId = requestAnimationFrame(animate);

    return () => {
      ticker.terminate();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(animFrameId);
      if (slavePollTimer) clearInterval(slavePollTimer);
      tikTokLiveClient.disconnect();
      resizeObs.disconnect();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      domEl.removeEventListener('contextmenu', onContextMenu);
      domEl.removeEventListener('pointerdown', onPointerDown);
      domEl.removeEventListener('pointermove', onPointerMove);
      domEl.removeEventListener('pointerup', onPointerUp);
      domEl.removeEventListener('pointercancel', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);
      store.setEngineRef(null);
      vfx.dispose();
      arena.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Respond to quality changes dynamically
  useEffect(() => {
    if (engineInstanceRef.current && sunLightRef.current && rendererRef.current) {
      engineInstanceRef.current.setQuality(quality, sunLightRef.current, rendererRef.current);
    }
  }, [quality]);

  // Automated Demo Viewer / Gift Simulator Loop when Demo Mode is toggled ON
  useEffect(() => {
    if (!demoModeEnabled) return;
    const demoNames = [
      'Rizky_Gaming',
      'Putri_Celestial',
      'NagaBiru_ID',
      'Lord_Abyss',
      'Bima_Sakura',
      'Garuda_Knight',
      'MonsterHunterX',
      'KingSlayer99',
    ];
    const timer = window.setInterval(() => {
      const st = useGameStore.getState();
      if (st.paused) return;
      const user = demoNames[Math.floor(Math.random() * demoNames.length)];
      const team = Math.random() < 0.5 ? 'K' : 'M';
      if (Math.random() < 0.35) {
        st.handleViewerComment(user, team === 'K' ? 'KINGDOM' : 'MONSTER');
      } else {
        // Weighted gift choice (mostly basic/elite, occasional boss/legendary)
        const roll = Math.random();
        const pool =
          roll < 0.65
            ? GIFT_CONFIGS.filter((g) => g.tier === 'BASIC')
            : roll < 0.9
            ? GIFT_CONFIGS.filter((g) => g.tier === 'ELITE')
            : GIFT_CONFIGS.filter((g) => g.tier === 'BOSS' || g.tier === 'LEGENDARY');
        const chosen = pool[Math.floor(Math.random() * pool.length)] || GIFT_CONFIGS[0];
        st.handleViewerGift(user, chosen.id, team, 1);
      }
    }, 3200);

    return () => window.clearInterval(timer);
  }, [demoModeEnabled]);

  return <div ref={containerRef} className="w-full h-full relative overflow-hidden" />;
};
