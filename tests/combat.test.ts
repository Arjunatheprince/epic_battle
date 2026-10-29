import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FixedStepClock } from '../src/engine/FixedStepClock';
import { UNIT_CONFIGS } from '../src/config/units';
import { COMBAT_SIGNATURES, attackWindupSeconds } from '../src/config/combat';
import { VfxManager } from '../src/engine/VfxManager';

test('delayed background callbacks preserve every simulation second', () => {
  const clock = new FixedStepClock();
  let simulated = 0;
  const tick = (dt: number) => { simulated += dt; };
  assert.equal(clock.advance(10, false, tick), 120);
  clock.advance(0, false, tick);
  clock.advance(0, false, tick);
  assert.ok(Math.abs(simulated - 10) < 1e-8);
});

test('pause discards elapsed time and switching callback sources does not double count', () => {
  const clock = new FixedStepClock();
  let steps = 0;
  const tick = () => { steps++; };
  clock.advance(60, true, tick);
  clock.advance(1, false, tick);
  clock.advance(0, false, tick);
  assert.equal(steps, 30);
});

test('all 32 characters have distinct signatures and release before their next attack', () => {
  assert.deepEqual(Object.keys(COMBAT_SIGNATURES).sort(), Object.keys(UNIT_CONFIGS).sort());
  const signatures = Object.values(COMBAT_SIGNATURES).map((s) => JSON.stringify(s));
  assert.equal(new Set(signatures).size, 32);
  for (const cfg of Object.values(UNIT_CONFIGS)) {
    const delay = attackWindupSeconds(cfg);
    assert.ok(delay > 0 && delay < 1 / cfg.attackSpeed, cfg.id);
    if (cfg.modelConfig.weapon === 'bow') assert.ok(Math.abs(delay * cfg.attackSpeed * 2.15 - 0.68) < 1e-8);
  }
});

test('every character emits finite pooled effects and effects expire', () => {
  const scene = new THREE.Scene();
  const vfx = new VfxManager(scene, 150);
  for (const cfg of Object.values(UNIT_CONFIGS)) {
    for (const special of [false, true]) {
      vfx.emitCharacterStrike(cfg, 0, 1.5, 0, Math.PI / 2, 3, 0, special);
      assert.ok(scene.children.some((mesh) => mesh.visible), cfg.id);
      for (const mesh of scene.children) {
        assert.ok([...mesh.position.toArray(), ...mesh.scale.toArray(), ...mesh.quaternion.toArray()].every(Number.isFinite), cfg.id);
      }
      vfx.update(2);
      assert.ok(scene.children.every((mesh) => !mesh.visible), cfg.id);
    }
  }
  vfx.dispose();
});

test('overlapping effects fade independently without changing shared materials', () => {
  const scene = new THREE.Scene();
  const vfx = new VfxManager(scene, 10);
  vfx.emitShockwaveRing(0, 0, 0, 0x60a5fa);
  vfx.update(0.15);
  const first = scene.children.find((o) => o.visible) as THREE.Mesh;
  vfx.emitShockwaveRing(3, 0, 0, 0x60a5fa);
  vfx.update(0.05);
  const second = scene.children.find((o) => o.visible && o !== first) as THREE.Mesh;
  assert.notEqual(first.material, second.material);
  assert.ok((first.material as THREE.MeshBasicMaterial).opacity < (second.material as THREE.MeshBasicMaterial).opacity);
  vfx.dispose();
});
