import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VfxManager } from '../src/engine/VfxManager';
import { UNIT_CONFIGS } from '../src/config/units';
import { VisualEventJournal, VisualEventReceiver, mergeVisualBatches } from '../src/engine/MirrorEffects';

test('all 32 character effects replay on mirror without requiring animation snapshots', () => {
  for (const cfg of Object.values(UNIT_CONFIGS)) {
    const host = new VfxManager(new THREE.Scene(), 50);
    const scene = new THREE.Scene();
    const mirror = new VfxManager(scene, 50);
    host.emitCharacterStrike(cfg, 0, 2, 0, Math.PI / 2, 3, 0, true);
    const batch = JSON.parse(JSON.stringify(host.serializeVisualEvents()));
    assert.equal(batch.events.length, 1, cfg.id + ': nested effects were duplicated');
    assert.equal(mirror.applyVisualEvents(batch), 1, cfg.id);
    assert.ok(scene.children.some((o) => o.visible), cfg.id + ': no mirror effect');
    assert.equal(mirror.applyVisualEvents(batch), 0, cfg.id + ': duplicate snapshot replayed');
    assert.equal(mirror.serializeVisualEvents().events.length, 0, 'mirror echoed effects');
    host.dispose(); mirror.dispose();
  }
});

test('meteor callbacks stay on host; beams, healing, death and impact replay', () => {
  const host = new VfxManager(new THREE.Scene(), 50);
  const mirror = new VfxManager(new THREE.Scene(), 50);
  let impacts = 0;
  host.emitMeteorStrike(3, 0, 0xffaa00, () => { impacts++; });
  host.emitSkyBeam(3, 0, 0xffffff);
  host.emitHealParticles(0, 0, 0x00ff00);
  host.emitDeathDissolve(1, 0, 0xff0000);
  host.emitHitImpact(2, 1, 0, 0xffffff, true, true);
  const batch = JSON.parse(JSON.stringify(host.serializeVisualEvents()));
  assert.equal(batch.events.length, 5);
  assert.equal(mirror.applyVisualEvents(batch), 5);
  mirror.update(2);
  assert.equal(impacts, 0, 'mirror executed gameplay callback');
  host.update(2);
  assert.equal(impacts, 1);
  host.dispose(); mirror.dispose();
});

test('bridge history recovers skipped snapshots and receiver rejects repeats', () => {
  const journal = new VisualEventJournal();
  journal.record('emitSkyBeam', [1, 2, 0xffffff]);
  const first = journal.snapshot();
  journal.record('emitHealParticles', [3, 4, 0x00ff00]);
  const second = journal.snapshot();
  const merged = mergeVisualBatches(first, { ...second, events: second.events.slice(1) });
  const receiver = new VisualEventReceiver();
  const played: number[] = [];
  assert.equal(receiver.consume(merged, (event) => played.push(event.id)), 2);
  assert.equal(receiver.consume(first, () => assert.fail('old snapshot replayed')), 0);
  assert.deepEqual(played, [1, 2]);
});

test('late polling recovers earlier unseen effects even after a newer SSE event', () => {
  const journal = new VisualEventJournal();
  journal.record('emitSkyBeam', [1, 2, 0xffffff]);
  journal.record('emitHealParticles', [3, 4, 0x00ff00]);
  const batch = journal.snapshot();
  const receiver = new VisualEventReceiver();
  const played: number[] = [];
  receiver.consume({ ...batch, events: batch.events.slice(1) }, (event) => played.push(event.id));
  receiver.consume(batch, (event) => played.push(event.id));
  assert.deepEqual(played, [2, 1]);
});

test('optional effect arguments survive JSON without becoming null', () => {
  const host = new VfxManager(new THREE.Scene(), 10);
  host.emitDeathDissolve(0, 0, 0xffffff, 1, undefined);
  const batch = JSON.parse(JSON.stringify(host.serializeVisualEvents()));
  assert.deepEqual(batch.events[0].args, [0, 0, 0xffffff, 1]);
  host.dispose();
});
