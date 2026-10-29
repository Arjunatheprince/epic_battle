// Run on the host dev page with agent-browser eval (see README).
(async () => {
  const moduleUrl = (name) => performance.getEntriesByType('resource').find((e) => e.name.includes(name)).name;
  const { useGameStore } = await import(moduleUrl('/src/store/useGameStore.ts'));
  const { UNIT_CONFIGS } = await import(moduleUrl('/src/config/units.ts'));
  const { SimulationEngine } = await import(moduleUrl('/src/engine/SimulationEngine.ts'));
  const { VfxManager } = await import(moduleUrl('/src/engine/VfxManager.ts'));
  const { CameraDirector } = await import(moduleUrl('/src/engine/CameraDirector.ts'));
  const THREE = await import(moduleUrl('/deps/three.js'));
  const host = useGameStore.getState().engineRef;
  const scene = new THREE.Scene();
  const effects = new VfxManager(scene, 150);
  const mirror = new SimulationEngine(scene, effects, new CameraDirector());
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const played = new Set();
  const types = new Set();
  const replay = effects.replayVisualEvent.bind(effects);
  effects.replayVisualEvent = (event) => {
    assert(!played.has(event.id), 'effect replayed twice');
    played.add(event.id); types.add(event.type);
    replay(event);
  };
  const wasAuto = host.autoSpawnEnabled, wasPaused = host.paused;
  let variants = 0;
  try {
    host.autoSpawnEnabled = false; host.paused = false;
    for (const cfg of Object.values(UNIT_CONFIGS)) {
      for (const special of [false, true]) {
        host.resetRound(); host.spawnQueue.length = 0; host.phase = 'NORMAL_BATTLE';
        const a = host.spawnImmediate(cfg.id, undefined, { x: 0, z: 0 });
        const b = host.spawnImmediate(cfg.faction === 'K' ? 'm_troll' : 'k_stone_golem', undefined, { x: 2, z: 0 });
        a.spawnTimer = b.spawnTimer = 0;
        a.attackCooldown = b.attackCooldown = 999;
        a.abilityCooldown = special ? 0 : 999;
        host.executeUnitAttackOrAbility(a, b);
        // Deliberately skip every intermediate animation snapshot.
        for (let i = 0; i < 45; i++) host.stepFixed(1 / 30);
        const state = JSON.parse(JSON.stringify(host.serializeMirrorState()));
        mirror.applyMirrorState(state);
        assert(mirror.units.some((u) => u.uid === b.uid && u.hp === Math.ceil(b.hp)), cfg.id + ': mirror HP mismatch');
        const before = played.size;
        mirror.applyMirrorState(state);
        assert(played.size === before, cfg.id + ': polling duplicated an effect');
        variants++;
      }
    }
    host.resetRound(); host.spawnQueue.length = 0;
    const archer = host.spawnImmediate('k_archer', undefined, { x: -15, z: 0 });
    const target = host.spawnImmediate('m_troll', undefined, { x: 15, z: 0 });
    host.fireProjectile(archer, target);
    mirror.applyMirrorState(JSON.parse(JSON.stringify(host.serializeMirrorState())));
    assert(mirror.projectiles.some((p) => p.active && p.mesh.visible), 'arrow missing from mirror');
    const mage = host.spawnImmediate('k_battle_mage', undefined, { x: -15, z: 2 });
    host.fireProjectile(mage, target);
    mirror.applyMirrorState(JSON.parse(JSON.stringify(host.serializeMirrorState())));
    assert(mirror.projectiles.filter((p) => p.active).length === 2, 'magic projectile missing from mirror');
    host.vfx.emitMeteorStrike(0, 0, 0xffaa00);
    mirror.applyMirrorState(JSON.parse(JSON.stringify(host.serializeMirrorState())));
    assert(effects.meteors.some((m) => m.active), 'gift meteor missing');
    host.vfx.update(1);
    mirror.applyMirrorState(JSON.parse(JSON.stringify(host.serializeMirrorState())));
    assert(types.has('emitSkyBeam'), 'meteor impact/beam missing');
    return { mirroredAttackVariants: variants, uniqueEffects: played.size, duplicateEffects: 0,
      arrows: 'visible', magicProjectiles: 'visible', meteors: 'visible' };
  } finally {
    effects.dispose(); scene.clear();
    host.resetRound(); host.autoSpawnEnabled = wasAuto; host.paused = wasPaused;
  }
})()
