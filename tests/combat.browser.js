// Run against the dev server with agent-browser eval (see README).
(async () => {
  const storeUrl = performance.getEntriesByType('resource').find((e) => e.name.includes('/src/store/useGameStore.ts')).name;
  const { useGameStore } = await import(storeUrl);
  const engine = useGameStore.getState().engineRef;
  const configUrl = performance.getEntriesByType('resource').find((e) => e.name.includes('/src/config/units.ts')).name;
  const { UNIT_CONFIGS } = await import(configUrl);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wasAutoSpawn = engine.autoSpawnEnabled;
  const wasPaused = engine.paused;
  const results = [];
  try {
    engine.paused = false;
    engine.autoSpawnEnabled = false;
    for (const cfg of Object.values(UNIT_CONFIGS)) {
      for (const special of [false, true]) {
        engine.resetRound();
        engine.spawnQueue.length = 0;
        engine.phase = 'NORMAL_BATTLE';
        const attacker = engine.spawnImmediate(cfg.id, undefined, { x: 0, z: 0 });
        const target = engine.spawnImmediate(cfg.faction === 'K' ? 'm_troll' : 'k_stone_golem', undefined, { x: 2, z: 0 });
        attacker.spawnTimer = target.spawnTimer = 0;
        attacker.attackCooldown = target.attackCooldown = 99;
        attacker.abilityCooldown = special ? 0 : 99;
        const hp = target.hp;
        engine.executeUnitAttackOrAbility(attacker, target);
        assert(target.hp === hp, cfg.id + ': damage happened before windup');
        for (let i = 0; i < 45; i++) engine.stepFixed(1 / 30);
        assert(Number.isFinite(target.hp), cfg.id + ': invalid HP');
        assert(engine.pendingStrikes.length === 0, cfg.id + ': unresolved strike');
        assert(target.hp < hp, cfg.id + ': attack never landed');
      }
      results.push(cfg.id);
    }
    engine.resetRound();
    engine.spawnQueue.length = 0;
    engine.phase = 'NORMAL_BATTLE';
    const cancelledAttacker = engine.spawnImmediate('k_swordsman', undefined, { x: 0, z: 0 });
    const cancelledTarget = engine.spawnImmediate('m_troll', undefined, { x: 2, z: 0 });
    cancelledAttacker.abilityCooldown = 99;
    cancelledTarget.attackCooldown = 99;
    const originalHp = cancelledTarget.hp;
    engine.executeUnitAttackOrAbility(cancelledAttacker, cancelledTarget);
    cancelledAttacker.dead = true;
    for (let i = 0; i < 30; i++) engine.stepFixed(1 / 30);
    assert(cancelledTarget.hp === originalHp, 'dead attacker landed a queued strike');
    engine.paused = true;
    const before = engine.roundClock;
    engine.stepFixed(1);
    assert(engine.roundClock === before, 'pause advanced the round');
    for (let i = 0; i < 100; i++) engine.vfx.emitDamageNumber(0, 3, 0, 100, false, true, true);
    assert(engine.vfx.labels.length <= 24, 'damage label pool grew without a bound');
    engine.vfx.update(2);
    assert(engine.vfx.labels.every((label) => !label.sprite.visible), 'expired damage labels stayed visible');
    return { testedCharacters: results.length, attackVariants: results.length * 2, cancelledStrike: 'passed', pause: 'passed', damageLabels: 'bounded and expire' };
  } finally {
    engine.resetRound();
    engine.paused = wasPaused;
    engine.autoSpawnEnabled = wasAutoSpawn;
  }
})()
