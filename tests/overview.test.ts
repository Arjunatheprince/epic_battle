import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraDirector, mirrorFramingScale } from '../src/engine/CameraDirector';
import { UNIT_CONFIGS } from '../src/config/units';
import type { ActiveUnit } from '../src/types/game';
import { OverviewTracker } from '../src/engine/OverviewTracker';

function unit(uid: number, x: number, z: number): ActiveUnit {
  return { uid, x, y: 0, z, cfg: UNIT_CONFIGS.k_swordsman, dead: false,
    spawnTimer: 0, target: null, attackAnimProgress: 0, hitTimer: 0, isAttackingCastle: false } as ActiveUnit;
}

function lookPoint(camera: THREE.PerspectiveCamera): THREE.Vector3 {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return camera.position.clone().addScaledVector(direction, (1.5 - camera.position.y) / direction.y);
}

function settle(director: CameraDirector, camera: THREE.PerspectiveCamera, units: ActiveUnit[]): void {
  for (let i = 0; i < 240; i++) director.update(1 / 30, camera, units, { K: 100000, M: 100000 }, 100000);
}

for (const aspect of [16 / 9, 9 / 16]) {
  test(`overview follows the largest moving group (${aspect.toFixed(2)})`, () => {
    const camera = new THREE.PerspectiveCamera(aspect < 1 ? 60 : 45, aspect, 0.2, 320);
    const director = new CameraDirector();
    director.setManualMode('OVERVIEW', []);
    const group = Array.from({ length: 8 }, (_, i) => unit(i + 1, -42 + i * 0.5, 14 + i * 0.3));
    const units = [...group, unit(20, 42, -15), unit(21, 40, -16)];
    settle(director, camera, units);
    let focus = lookPoint(camera);
    assert.ok(Math.abs(focus.x + 40.25) < 2, `focus x ${focus.x}`);
    assert.ok(Math.abs(focus.z - 15.05) < 2, `focus z ${focus.z}`);
    for (const u of group) { u.x += 18; u.z -= 8; }
    settle(director, camera, units);
    focus = lookPoint(camera);
    assert.ok(Math.abs(focus.x + 22.25) < 2, `moving focus x ${focus.x}`);
    assert.ok(Math.abs(focus.z - 7.05) < 2, `moving focus z ${focus.z}`);
    camera.updateMatrixWorld();
    for (const u of group) {
      const projected = new THREE.Vector3(u.x, 1.5, u.z).project(camera);
      assert.ok(Math.abs(projected.x) < 0.85 && Math.abs(projected.y) < 0.85, 'selected troops left the frame');
    }
  });
}

test('active battle takes priority over a larger idle army and includes both opponents', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 320);
  const director = new CameraDirector();
  director.setManualMode('OVERVIEW', []);
  const attacker = unit(1, 24, -13);
  const defender = unit(2, 28, -13);
  attacker.target = defender;
  attacker.attackAnimProgress = 0.5;
  const idle = Array.from({ length: 25 }, (_, i) => unit(i + 3, -40 + i * 0.1, 10));
  settle(director, camera, [attacker, defender, ...idle]);
  const focus = lookPoint(camera);
  assert.ok(Math.abs(focus.x - 26) < 2 && Math.abs(focus.z + 13) < 2, JSON.stringify(focus));
  attacker.dead = defender.dead = true;
  settle(director, camera, [attacker, defender, ...idle]);
  assert.ok(lookPoint(camera).x < -35, 'camera kept following a finished battle');
});

test('empty battlefield returns a finite overview', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 320);
  const director = new CameraDirector();
  director.setManualMode('OVERVIEW', []);
  settle(director, camera, []);
  assert.ok([...camera.position.toArray(), ...camera.quaternion.toArray()].every(Number.isFinite));
  assert.ok(Math.abs(lookPoint(camera).x) < 1 && Math.abs(lookPoint(camera).z) < 1);
});

test('battle focus persists between swings and includes a distant ranged target', () => {
  const tracker = new OverviewTracker();
  const archer = unit(1, 20, 0);
  archer.cfg = { ...UNIT_CONFIGS.k_archer, attackRange: 22 };
  const enemy = unit(2, 40, 0);
  archer.target = enemy;
  const idle = Array.from({ length: 20 }, (_, i) => unit(i + 3, -40, 10));
  const focus = tracker.update(1, [archer, enemy, ...idle]);
  assert.equal(focus.x, 30);
  assert.ok(focus.radius >= 12, 'ranged opponent excluded from framing');
});

test('overview resists nearly equal groups but switches to a clearly larger army', () => {
  const tracker = new OverviewTracker();
  const left = Array.from({ length: 10 }, (_, i) => unit(i + 1, -35, 0));
  const right = Array.from({ length: 9 }, (_, i) => unit(i + 20, 35, 0));
  assert.equal(tracker.update(1, [...left, ...right]).x, -35);
  right.push(unit(40, 35, 0), unit(41, 35, 0));
  assert.equal(tracker.update(1, [...left, ...right]).x, -35);
  right.push(unit(42, 35, 0), unit(43, 35, 0));
  assert.equal(tracker.update(1, [...left, ...right]).x, 35);
});

test('siege combat is selected before a larger marching army', () => {
  const tracker = new OverviewTracker();
  const siege = unit(1, 48, 4);
  siege.isAttackingCastle = true;
  const idle = Array.from({ length: 10 }, (_, i) => unit(i + 3, -40, 10));
  assert.equal(tracker.update(1, [siege, ...idle]).x, 48);
});

test('combat camera frames the actual battle instead of the global army average', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 320);
  const director = new CameraDirector();
  director.setManualMode('COMBAT', []);
  const attacker = unit(1, 25, -12), defender = unit(2, 28, -12);
  attacker.target = defender;
  const idle = Array.from({ length: 20 }, (_, i) => unit(10 + i, -40, 10));
  settle(director, camera, [attacker, defender, ...idle]);
  assert.ok(Math.abs(lookPoint(camera).x - 26.5) < 2);
  assert.ok(Math.abs(lookPoint(camera).z + 12) < 2);
});

test('camera lifts its sightline over arena obstacles', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 320);
  const director = new CameraDirector();
  director.setManualMode('OVERVIEW', []);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 3), new THREE.MeshBasicMaterial());
  wall.position.set(0, 10, 10);
  wall.updateMatrixWorld();
  director.setObstacles([wall]);
  settle(director, camera, [unit(1, 0, 0)]);
  const ray = new THREE.Raycaster(camera.position, new THREE.Vector3(0, 1.5, 0).sub(camera.position).normalize(), 0, camera.position.distanceTo(new THREE.Vector3(0, 1.5, 0)) - 1);
  assert.equal(ray.intersectObject(wall).length, 0);
  wall.geometry.dispose();
  (wall.material as THREE.Material).dispose();
});

test('portrait mirror pulls back enough to preserve the host camera subject', () => {
  const scale = mirrorFramingScale(45, 16 / 9, 60, 9 / 16);
  assert.ok(scale > 1 && scale < 1.5);
  assert.equal(mirrorFramingScale(45, 16 / 9, 45, 16 / 9), 1);
});
