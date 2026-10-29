import * as THREE from 'three';
import type { ActiveUnit, AnimationState } from '../types/game';
import { HIT_FLASH_MAT_K, HIT_FLASH_MAT_M } from '../rendering/ProceduralCharacterBuilder';

const STATE_PRIORITY: Record<AnimationState, number> = {
  DEATH: 100,
  SPAWN: 90,
  STUN: 80,
  SPECIAL_ABILITY: 75,
  HIT: 65,
  CAST: 60,
  ATTACK: 55,
  BLOCK: 50,
  CHARGE: 45,
  FLY: 35,
  RUN: 30,
  WALK: 20,
  IDLE: 10,
};

export function transitionUnitState(
  unit: ActiveUnit,
  nextState: AnimationState,
  force = false
): void {
  if (unit.animState === 'DEATH' && !force) return;
  if (unit.animState === nextState) return;

  if (!force) {
    const curPrio = STATE_PRIORITY[unit.animState] ?? 0;
    const nextPrio = STATE_PRIORITY[nextState] ?? 0;
    if (unit.animState === 'SPAWN' && unit.spawnTimer > 0) return;
    if (
      (unit.animState === 'ATTACK' || unit.animState === 'SPECIAL_ABILITY' || unit.animState === 'CAST') &&
      unit.attackAnimProgress > 0 &&
      nextPrio < curPrio
    ) {
      return;
    }
  }

  unit.prevAnimState = unit.animState;
  unit.animState = nextState;
  unit.stateTime = 0;
  unit.blendWeight = 0;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyHitFlashMaterial(unit: ActiveUnit, active: boolean): void {
  const meshes = unit.rig.hitFlashMeshes;
  const origs = unit.rig.origMaterials;
  const flashMat = unit.team === 'K' ? HIT_FLASH_MAT_K : HIT_FLASH_MAT_M;
  for (let i = 0; i < meshes.length; i++) {
    const targetMat = active ? flashMat : origs[i];
    if (meshes[i].material !== targetMat) {
      meshes[i].material = targetMat;
    }
  }
}

export function updateUnitAnimation(
  unit: ActiveUnit,
  dt: number,
  cameraPos?: THREE.Vector3,
  lodTier: 0 | 1 | 2 = 0
): void {
  const rig = unit.rig;
  const cfg = unit.cfg;
  const animCfg = cfg.animationConfig;
  const modelScale = cfg.modelConfig.scale;

  unit.stateTime += dt;
  unit.blendWeight = Math.min(1, unit.blendWeight + dt * 9.0);

  // Hit Flash Material Pulse (Phase 3)
  const shouldFlash = !unit.dead && unit.hitTimer > 0.14;
  applyHitFlashMaterial(unit, shouldFlash);

  // Smooth world position & rotation
  const hoverBase = animCfg.hoverHeight ?? 0;
  rig.root.position.set(unit.x, unit.y, unit.z);

  let angleDiff = unit.ry - rig.root.rotation.y;
  angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
  rig.root.rotation.y += angleDiff * Math.min(1, dt * 11);

  // Show / Hide Overhead Gifter Name Tag
  if (rig.nameTagSprite) {
    rig.nameTagSprite.visible = !unit.dead && !!unit.summonerName && lodTier < 2;
  }

  // LOD 1/2 detail visibility optimization
  if (rig.quiverMesh) {
    rig.quiverMesh.visible = lodTier === 0;
  }

  // Update overhead HP bar orientation & fill
  if (rig.hpBarBg && rig.hpBarFill) {
    const showHp =
      !unit.dead &&
      lodTier < 2 &&
      (cfg.isBoss || unit.hp < unit.maxHp || !!unit.summonerName);
    rig.hpBarBg.visible = showHp;
    rig.hpBarFill.visible = showHp;
    if (showHp) {
      const ratio = Math.max(0, Math.min(1, unit.hp / unit.maxHp));
      const fullW = (cfg.isBoss ? 1.8 : 1.05) - 0.04;
      rig.hpBarFill.scale.x = Math.max(0.01, fullW * ratio);
      rig.hpBarFill.position.x = -(fullW * (1 - ratio)) * 0.5;
      if (cameraPos) {
        rig.hpBarBg.lookAt(cameraPos);
        rig.hpBarFill.lookAt(cameraPos);
      }
    }
  }

  // LOD 2 (Far distance): skip inner limb trigonometry when alive and already spawned
  if (lodTier === 2 && !unit.dead && unit.spawnTimer <= 0) {
    rig.root.scale.setScalar(modelScale);
    rig.body.position.set(0, hoverBase, 0);
    return;
  }

  // Rotate ground aura slowly
  if (rig.auraMesh) {
    rig.auraMesh.rotation.z += dt * 1.4;
    const pulse = 1 + Math.sin(unit.animPhase * 2) * 0.08;
    rig.auraMesh.scale.setScalar(cfg.collisionRadius * 1.15 * pulse);
  }

  // Rotate Sovereign Halo Ring if present (Phase 6)
  if (rig.haloMesh) {
    rig.haloMesh.rotation.z += dt * 2.2;
  }

  // =========================================================================
  // 1. DEATH STATE ANIMATION
  // =========================================================================
  if (unit.dead || unit.animState === 'DEATH') {
    applyHitFlashMaterial(unit, false);
    if (rig.nockedArrowMesh) rig.nockedArrowMesh.visible = false;

    const deathDur = animCfg.deathDuration || 1.15;
    const p = Math.min(1, unit.deadTimer / deathDur);

    if (cfg.modelConfig.isStoneGolem) {
      // STONE GOLEM DEATH (Phase 4): Body crumbles & collapses vertically into a pile of boulders
      rig.body.position.y = lerp(0, -0.78, p * p);
      rig.torso.rotation.x = lerp(0, 0.55, p);
      rig.torso.rotation.z = lerp(0, 0.35, p);
      rig.head.position.y = lerp(1.13, 0.25, p);
      rig.head.rotation.z = lerp(0, -0.8, p);
      rig.shoulderL.position.y = lerp(0.88, 0.15, p);
      rig.shoulderR.position.y = lerp(0.88, 0.15, p);
      rig.armL.rotation.z = lerp(0, 0.9, p);
      rig.armR.rotation.z = lerp(0, -0.9, p);
    } else if (cfg.modelConfig.isSkeleton) {
      // SKELETON GUARD / SKELETON ARCHER DEATH (Phase 4): Bones collapse & scatter rapidly
      rig.body.position.y = lerp(0, -0.72, p);
      rig.body.rotation.x = lerp(0, -1.25, p);
      rig.head.rotation.y = lerp(0, 1.1, p);
      rig.armL.rotation.z = lerp(0, 1.3, p);
      rig.armR.rotation.z = lerp(0, -1.3, p);
    } else if (animCfg.archetype === 'swordsman' || cfg.faction === 'K') {
      // KINGDOM HEROIC DEATH: Kneels first, then falls forward
      if (p < 0.45) {
        const kp = p / 0.45;
        rig.body.position.y = lerp(hoverBase, -0.38, kp);
        rig.torso.rotation.x = lerp(0, 0.35, kp);
        rig.head.rotation.x = lerp(0, 0.45, kp);
        rig.thighL.rotation.x = lerp(0, -0.75, kp);
        rig.calfL.rotation.x = lerp(0, 1.45, kp);
        rig.thighR.rotation.x = lerp(0, -0.65, kp);
        rig.calfR.rotation.x = lerp(0, 1.35, kp);
        rig.armL.rotation.x = lerp(0, 0.4, kp);
        rig.armR.rotation.x = lerp(0, 0.5, kp);
      } else {
        const fp = (p - 0.45) / 0.55;
        rig.body.position.y = lerp(-0.38, -0.68, fp);
        rig.body.rotation.x = lerp(0, 1.42, fp);
        rig.armR.rotation.z = lerp(0, -0.6, fp);
        rig.armL.rotation.z = lerp(0, 0.5, fp);
      }
    } else if (animCfg.archetype === 'goblin') {
      // GOBLIN DEATH: Knocked backward flip onto its back
      rig.body.rotation.x = lerp(0.3, -1.48, p);
      rig.body.position.y = Math.sin(p * Math.PI) * 0.45 - p * 0.55;
      rig.armL.rotation.x = lerp(0, -2.3, p);
      rig.armR.rotation.x = lerp(0, -2.1, p);
      rig.thighL.rotation.x = lerp(0, -0.8, p);
      rig.thighR.rotation.x = lerp(0, -0.5, p);
    } else {
      // ORC / TROLL / MONSTER HEAVY COLLAPSE
      rig.body.rotation.x = lerp(0, -1.38, p);
      rig.body.position.y = lerp(hoverBase, -0.68, p);
      rig.armL.rotation.x = -p * 1.6;
      rig.armR.rotation.x = -p * 1.6;
    }

    if (unit.deadTimer > deathDur) {
      const sink = Math.min(1, (unit.deadTimer - deathDur) / 0.7);
      rig.root.scale.setScalar(Math.max(0.01, modelScale * (1 - sink * 0.85)));
      rig.body.position.y -= sink * 0.9;
    }
    return;
  }

  // Restore Stone Golem detached joint offsets if recycled from pool
  if (cfg.modelConfig.isStoneGolem) {
    rig.head.position.y = 1.13;
    rig.shoulderL.position.y = 0.88;
    rig.shoulderR.position.y = 0.88;
  }

  // =========================================================================
  // 2. SPAWN STATE ANIMATION
  // =========================================================================
  if (unit.spawnTimer > 0) {
    const sp = 1 - Math.min(1, unit.spawnTimer / 0.55);
    const easeOutBack = 1 + 1.7 * Math.pow(sp - 1, 3) + 0.7 * Math.pow(sp - 1, 2);
    rig.root.scale.setScalar(Math.max(0.02, modelScale * Math.min(1.08, easeOutBack)));
    rig.body.position.y = hoverBase + (1 - sp) * (animCfg.archetype === 'goblin' ? 0.9 : 0.45);
  } else {
    const recoil = Math.max(0, unit.hitTimer / 0.24);
    // A short squash gives contact weight without pausing battle simulation.
    rig.root.scale.set(modelScale * (1 + recoil * 0.055), modelScale * (1 - recoil * 0.075), modelScale * (1 + recoil * 0.055));
  }

  const cycleSpeed = unit.isMoving ? animCfg.runCycleSpeed : 2.2;
  unit.animPhase += dt * cycleSpeed;
  const ph = unit.animPhase;
  // Skeletons use a slightly quantized/jerky phase for authentic undead stiffness!
  const qPh = cfg.modelConfig.isSkeleton ? Math.floor(ph * 3.5) / 3.5 : ph;
  const sinP = Math.sin(qPh);
  const cosP = Math.cos(qPh);

  const isGob = animCfg.archetype === 'goblin';
  const isTroll = animCfg.archetype === 'troll';
  const isOrc = animCfg.archetype === 'orc_warrior';
  const isGolem = !!cfg.modelConfig.isStoneGolem;
  const baseForwardLean = isGob
    ? 0.34
    : isTroll
    ? 0.26
    : isOrc
    ? 0.18
    : unit.isMoving
    ? 0.14
    : 0.03;

  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, hoverBase, 0);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(baseForwardLean, 0, 0);
  rig.head.rotation.set(isGob || isTroll ? -0.18 : 0, 0, 0);
  if (rig.jawMesh) rig.jawMesh.rotation.set(0, 0, 0);
  rig.shoulderL.rotation.set(0, 0, 0);
  rig.shoulderR.rotation.set(0, 0, 0);
  rig.armL.rotation.set(0, 0, 0);
  rig.forearmL.rotation.set(0, 0, 0);
  rig.armR.rotation.set(0, 0, 0);
  rig.forearmR.rotation.set(0, 0, 0);
  rig.thighL.rotation.set(0, 0, 0);
  rig.calfL.rotation.set(0, 0, 0);
  rig.thighR.rotation.set(0, 0, 0);
  rig.calfR.rotation.set(0, 0, 0);

  if (rig.nockedArrowMesh) {
    rig.nockedArrowMesh.visible = false;
  }

  // Wing flapping if winged
  if (rig.wingL && rig.wingR) {
    const flapSpeed = unit.isMoving ? 9.5 : 6.0;
    const flap = Math.sin(unit.stateTime * flapSpeed) * 0.55;
    rig.wingL.rotation.y = flap;
    rig.wingR.rotation.y = -flap;
    rig.body.position.y = hoverBase + Math.sin(unit.stateTime * flapSpeed) * 0.18;
  }

  // Tail sway if tailed
  if (rig.tail) {
    rig.tail.rotation.y = Math.sin(ph * 0.8) * 0.38;
  }

  // =========================================================================
  // 3. LOCOMOTION (IDLE vs WALK / RUN / CHARGE)
  // =========================================================================
  if (unit.isMoving) {
    if (isGob) {
      // GOBLIN RUN: Hunched, erratic scurrying
      const erratic = Math.sin(ph * 2.0) * 0.12;
      rig.body.position.y = hoverBase + Math.abs(sinP) * 0.16;
      rig.body.rotation.z = sinP * 0.14 + erratic;
      rig.torso.rotation.x = 0.42 + Math.abs(cosP) * 0.1;
      rig.torso.rotation.y = -sinP * 0.28;
      rig.head.rotation.y = sinP * 0.32;

      rig.thighL.rotation.x = sinP * 1.05 - 0.2;
      rig.calfL.rotation.x = Math.max(0.15, -cosP * 0.95);
      rig.thighR.rotation.x = -sinP * 1.05 - 0.2;
      rig.calfR.rotation.x = Math.max(0.15, cosP * 0.95);

      rig.armL.rotation.x = -sinP * 0.85 - 0.3;
      rig.forearmL.rotation.x = -0.65;
      rig.armR.rotation.x = sinP * 0.85 - 0.25;
      rig.forearmR.rotation.x = -0.55;
    } else if (animCfg.archetype === 'swordsman' || animCfg.archetype === 'shield_infantry') {
      // SWORDSMAN / SHIELD GUARD RUN
      rig.body.position.y = hoverBase + Math.abs(sinP) * 0.11;
      rig.pelvis.rotation.y = sinP * 0.12;
      rig.torso.rotation.y = -sinP * 0.15;

      rig.thighL.rotation.x = sinP * 0.82;
      rig.calfL.rotation.x = Math.max(0, -cosP * 0.78);
      rig.thighR.rotation.x = -sinP * 0.82;
      rig.calfR.rotation.x = Math.max(0, cosP * 0.78);

      rig.armL.rotation.x = -0.55 + cosP * 0.12;
      rig.armL.rotation.y = 0.42;
      rig.forearmL.rotation.x = -0.55;

      rig.armR.rotation.x = sinP * 0.55 - 0.2;
      rig.forearmR.rotation.x = -0.45;
    } else if (isOrc) {
      // ORC WARRIOR AGGRESSIVE RUN (Phase 4): Wide berserker shoulder roll & axe carry
      rig.body.position.y = hoverBase + Math.abs(sinP) * 0.14;
      rig.body.rotation.z = sinP * 0.08;
      rig.torso.rotation.x = 0.25 + Math.abs(cosP) * 0.08;
      rig.torso.rotation.y = -sinP * 0.24;
      rig.thighL.rotation.x = sinP * 0.88;
      rig.calfL.rotation.x = Math.max(0, -cosP * 0.82);
      rig.thighR.rotation.x = -sinP * 0.88;
      rig.calfR.rotation.x = Math.max(0, cosP * 0.82);
      rig.armL.rotation.x = -sinP * 0.7 - 0.35;
      rig.forearmL.rotation.x = -0.6;
      rig.armR.rotation.x = sinP * 0.65 - 0.45;
      rig.forearmR.rotation.x = -0.55;
    } else if (isGolem || isTroll) {
      // STONE GOLEM / TROLL LUMBERING HEAVY WALK (Phase 4)
      rig.body.position.y = hoverBase + Math.abs(sinP) * 0.09;
      rig.body.rotation.z = sinP * 0.11;
      rig.torso.rotation.y = -sinP * 0.18;
      rig.thighL.rotation.x = sinP * 0.62;
      rig.calfL.rotation.x = Math.max(0, -cosP * 0.55);
      rig.thighR.rotation.x = -sinP * 0.62;
      rig.calfR.rotation.x = Math.max(0, cosP * 0.55);
      rig.armL.rotation.x = -sinP * 0.48 - 0.25;
      rig.armR.rotation.x = sinP * 0.48 - 0.25;
      rig.forearmL.rotation.x = -0.4;
      rig.forearmR.rotation.x = -0.4;
    } else if (animCfg.hasMount && rig.mount) {
      // CAVALRY / WARG RIDER GALLOP & LEAP (Phase 6)
      rig.mount.position.y = Math.abs(sinP) * 0.18;
      rig.mount.rotation.x = cosP * 0.12;
      if (rig.mountLegs && rig.mountLegs.length === 4) {
        rig.mountLegs[0].rotation.x = sinP * 0.85;
        rig.mountLegs[1].rotation.x = Math.sin(qPh + 0.6) * 0.85;
        rig.mountLegs[2].rotation.x = -sinP * 0.85;
        rig.mountLegs[3].rotation.x = -Math.sin(qPh + 0.6) * 0.85;
      }
      if (unit.chargeTimer > 0) {
        const cp = 1 - unit.chargeTimer / 0.55;
        rig.body.position.y = hoverBase + Math.sin(cp * Math.PI) * (cfg.faction === 'M' ? 1.25 : 0.45);
        rig.mount.rotation.x = Math.sin(cp * Math.PI * 2) * 0.28;
      }
      rig.torso.rotation.x = 0.24 + sinP * 0.08;
      rig.armR.rotation.x = -1.05;
      rig.armL.rotation.x = -0.55;
    } else {
      // KNIGHT / ARCHER / SPEARMAN / BOSS STRIDE
      const stride = cfg.tier >= 3 ? 0.66 : 0.76;
      rig.body.position.y = hoverBase + Math.abs(sinP) * 0.1;
      rig.torso.rotation.y = -sinP * 0.14;
      rig.thighL.rotation.x = sinP * stride;
      rig.calfL.rotation.x = Math.max(0, -cosP * stride * 0.85);
      rig.thighR.rotation.x = -sinP * stride;
      rig.calfR.rotation.x = Math.max(0, cosP * stride * 0.85);
      rig.armL.rotation.x = -sinP * 0.5 - 0.2;
      rig.armR.rotation.x = sinP * 0.5 - 0.2;
      rig.forearmL.rotation.x = -0.35;
      rig.forearmR.rotation.x = -0.35;
    }
  } else {
    // IDLE BREATHING & COMBAT STANCE
    const breath = Math.sin(qPh) * 0.04;
    rig.body.position.y = hoverBase + Math.abs(breath);
    rig.torso.rotation.x = baseForwardLean + breath;

    if (isGob) {
      rig.head.rotation.y = Math.sin(ph * 0.9) * 0.35;
      rig.thighL.rotation.x = -0.25;
      rig.calfL.rotation.x = 0.45;
      rig.thighR.rotation.x = -0.25;
      rig.calfR.rotation.x = 0.45;
      rig.armR.rotation.x = -0.45 + Math.sin(ph * 2) * 0.12;
      rig.forearmR.rotation.x = -0.55;
    } else if (animCfg.hasShieldBlock) {
      rig.armL.rotation.x = -0.5;
      rig.armL.rotation.y = 0.38;
      rig.forearmL.rotation.x = -0.5;
      rig.armR.rotation.x = -0.3 + breath * 2;
      rig.forearmR.rotation.x = -0.45;
    } else if (cfg.modelConfig.weapon === 'bow') {
      rig.armL.rotation.x = -0.65;
      rig.armR.rotation.x = -0.45;
      if (cfg.modelConfig.isSkeleton && rig.jawMesh) {
        rig.jawMesh.rotation.x = Math.max(0, Math.sin(qPh * 2) * 0.18);
      }
    } else {
      rig.armL.rotation.x = -0.18 + breath;
      rig.armR.rotation.x = -0.25 - breath;
      rig.forearmR.rotation.x = -0.35;
    }
  }

  // =========================================================================
  // 4. ATTACK & SPECIAL ABILITY ANIMATION OVERLAY (PHASE 2 & PHASE 4)
  // =========================================================================
  if (unit.attackAnimProgress > 0) {
    const p = 1 - unit.attackAnimProgress; // 0 -> 1 over attack cycle

    if (animCfg.archetype === 'swordsman') {
      // SWORDSMAN HORIZONTAL / DIAGONAL SWORD SLASH
      if (p < 0.32) {
        const w = p / 0.32;
        rig.torso.rotation.y = lerp(0, -0.55, w);
        rig.shoulderR.rotation.y = lerp(0, -0.6, w);
        rig.armR.rotation.x = lerp(-0.3, -1.55, w);
        rig.armR.rotation.z = lerp(0, -0.75, w);
        rig.forearmR.rotation.x = lerp(-0.4, -0.85, w);
        rig.armL.rotation.x = -0.65;
        rig.armL.rotation.y = 0.55;
      } else if (p < 0.78) {
        const s = (p - 0.32) / 0.46;
        const ease = 1 - Math.pow(1 - s, 3);
        rig.torso.rotation.y = lerp(-0.55, 0.68, ease);
        rig.torso.rotation.x = 0.26;
        rig.shoulderR.rotation.y = lerp(-0.6, 0.75, ease);
        rig.armR.rotation.x = lerp(-1.55, -1.1, ease);
        rig.armR.rotation.y = lerp(-0.4, 1.15, ease);
        rig.armR.rotation.z = lerp(-0.75, 0.35, ease);
        rig.forearmR.rotation.x = -0.25;
        rig.thighR.rotation.x = -0.55 * Math.sin(s * Math.PI);
        rig.calfR.rotation.x = 0.55 * Math.sin(s * Math.PI);
      } else {
        const r = (p - 0.78) / 0.22;
        rig.torso.rotation.y = lerp(0.68, 0, r);
        rig.armR.rotation.x = lerp(-1.1, -0.3, r);
        rig.armR.rotation.y = lerp(1.15, 0, r);
      }
    } else if (animCfg.archetype === 'shield_infantry') {
      const drive = Math.sin(p * Math.PI);
      rig.torso.rotation.x = drive * 0.4;
      rig.torso.rotation.y = (cfg.faction === 'K' ? 1 : -1) * drive * 0.35;
      rig.armL.rotation.x = -0.9 - drive * 0.7;
      rig.armL.rotation.y = drive * 0.65;
      rig.armR.rotation.x = -0.5 - Math.sin(p * Math.PI * 2) * 0.9;
      rig.forearmR.rotation.x = -0.35;
      rig.thighR.rotation.x = -drive * 0.6;
      rig.body.position.z += drive * (unit.lastStrikeSpecial ? 0.5 : 0.2);
    } else if (isGob) {
      // GOBLIN RAPID DAGGER FLURRY
      const stabWave = Math.sin(p * Math.PI * 2);
      rig.body.position.y = hoverBase + Math.sin(p * Math.PI) * 0.28;
      rig.torso.rotation.x = 0.52 + Math.sin(p * Math.PI) * 0.25;
      rig.torso.rotation.y = stabWave * 0.45;
      rig.armR.rotation.x = -1.75 + stabWave * 0.65;
      rig.forearmR.rotation.x = -0.2 + Math.max(0, -stabWave) * 0.5;
      rig.armL.rotation.x = -1.1 - stabWave * 0.4;
    } else if (cfg.modelConfig.weapon === 'bow') {
      // ARCHER & SKELETON ARCHER BOW DRAW, AIM, & NOCKED ARROW RELEASE (Phase 4)
      rig.torso.rotation.y = -0.48;
      rig.head.rotation.y = 0.45;
      rig.armL.rotation.x = -1.54;
      rig.armL.rotation.y = 0.38;
      if (p < 0.68) {
        const draw = p / 0.68;
        if (rig.nockedArrowMesh) {
          rig.nockedArrowMesh.visible = true;
          rig.nockedArrowMesh.position.z = lerp(0.22, -0.26, draw);
        }
        rig.armR.rotation.x = lerp(-1.1, -1.54, draw);
        rig.forearmR.rotation.x = lerp(-0.35, -1.15, draw);
      } else {
        const rel = (p - 0.68) / 0.32;
        if (rig.nockedArrowMesh) {
          rig.nockedArrowMesh.visible = false;
        }
        rig.armL.rotation.x = -1.62 + rel * 0.12; // Bow release kick
        rig.armR.rotation.x = lerp(-1.68, -0.75, rel);
        rig.forearmR.rotation.x = lerp(-1.25, -0.2, rel);
      }
    } else if (isOrc) {
      // ORC WARRIOR HEAVY AXE SWING & WAR CRY (Phase 4)
      if (unit.lastStrikeSpecial && p < 0.38) {
        // War Cry Roar before Cleave!
        const w = p / 0.38;
        rig.torso.rotation.x = lerp(0.15, -0.32, w);
        rig.head.rotation.x = lerp(0, -0.45, w);
        if (rig.jawMesh) rig.jawMesh.rotation.x = 0.52 * Math.sin(w * Math.PI);
        rig.armL.rotation.x = lerp(-0.3, -2.1, w);
        rig.armL.rotation.z = lerp(0, 0.65, w);
        rig.armR.rotation.x = lerp(-0.3, -2.6, w);
        rig.armR.rotation.z = lerp(0, -0.5, w);
      } else if (p < 0.38) {
        const w = p / 0.38;
        rig.torso.rotation.x = lerp(0.15, -0.24, w);
        rig.torso.rotation.y = lerp(0, -0.55, w);
        rig.armR.rotation.x = lerp(-0.4, -2.7, w);
      } else {
        const s = (p - 0.38) / 0.62;
        const ease = 1 - Math.pow(1 - s, 3);
        rig.torso.rotation.x = lerp(-0.24, 0.42, ease);
        rig.torso.rotation.y = lerp(-0.55, 0.6, ease);
        rig.armR.rotation.x = lerp(-2.7, -0.45, ease);
        rig.thighR.rotation.x = -0.45 * Math.sin(s * Math.PI);
      }
    } else if (isGolem) {
      // STONE GOLEM TWO-HANDED GROUND SMASH (Phase 4)
      if (p < 0.45) {
        const lift = p / 0.45;
        rig.torso.rotation.x = lerp(0.05, -0.42, lift);
        rig.armR.rotation.x = lerp(-0.3, -2.85, lift);
        rig.armL.rotation.x = lerp(-0.3, -2.85, lift);
      } else {
        const slam = (p - 0.45) / 0.55;
        const ease = Math.min(1, slam * 2.2);
        rig.body.position.y = lerp(0, -0.22 * Math.sin(slam * Math.PI), ease);
        rig.torso.rotation.x = lerp(-0.42, 0.62, ease);
        rig.armR.rotation.x = lerp(-2.85, -0.5, ease);
        rig.armL.rotation.x = lerp(-2.85, -0.5, ease);
      }
    } else if (isTroll) {
      // TROLL GIANT CLUB SWING & REGENERATION ROAR (Phase 4)
      if (p < 0.42) {
        const w = p / 0.42;
        rig.torso.rotation.y = lerp(0, -0.65, w);
        rig.torso.rotation.x = lerp(0.25, -0.28, w);
        rig.armR.rotation.x = lerp(-0.3, -2.75, w);
        if (unit.lastStrikeSpecial && rig.jawMesh) {
          rig.jawMesh.rotation.x = 0.48 * Math.sin(w * Math.PI);
        }
      } else {
        const s = (p - 0.42) / 0.58;
        const ease = 1 - Math.pow(1 - s, 3);
        rig.torso.rotation.y = lerp(-0.65, 0.55, ease);
        rig.torso.rotation.x = lerp(-0.28, 0.52, ease);
        rig.armR.rotation.x = lerp(-2.75, -0.48, ease);
      }
    } else if (cfg.modelConfig.weapon === 'spear' || cfg.modelConfig.weapon === 'lance') {
      // SPEARMAN / LIZARD SPEARMAN / CAVALRY THRUST & REPTILIAN TAIL WHIP (Phase 6)
      const thrust = Math.sin(p * Math.PI);
      if (unit.lastStrikeSpecial && rig.tail) {
        // Lizard Spearman 360-degree Tail Whip Spin!
        rig.body.rotation.y = p * Math.PI * 2;
        rig.tail.rotation.y = Math.sin(p * Math.PI * 4) * 1.1;
      } else {
        rig.torso.rotation.y = thrust * 0.38;
      }
      rig.torso.rotation.x = 0.22 + thrust * 0.18;
      rig.armR.rotation.x = -1.35 - thrust * 0.42;
      rig.forearmR.rotation.x = -0.65 + thrust * 0.58;
      if (rig.tail && p > 0.4) {
        rig.tail.rotation.y = Math.sin((p - 0.4) * Math.PI * 3) * 0.85;
      }
    } else if (animCfg.archetype === 'dragon' || animCfg.archetype === 'phoenix') {
      // DRAGON & PHOENIX SWOOP DIVE & BREATH ATTACK (Phase 6)
      const swoop = Math.sin(p * Math.PI);
      rig.body.position.y = hoverBase - swoop * 0.55;
      rig.body.rotation.x = swoop * 0.48;
      if (rig.jawMesh) {
        rig.jawMesh.rotation.x = swoop * 0.65;
      }
      if (rig.wingL && rig.wingR) {
        rig.wingL.rotation.z = swoop * 0.45;
        rig.wingR.rotation.z = -swoop * 0.45;
      }
    } else if (animCfg.archetype === 'emperor' || animCfg.archetype === 'winged_boss') {
      // ANGEL GUARDIAN / DEMON LORD / EMPEROR ASCENSION & DIVINE SLASH (Phase 6)
      const arc = Math.sin(p * Math.PI);
      if (unit.lastStrikeSpecial) {
        rig.body.position.y = hoverBase + arc * 1.1;
        rig.armL.rotation.x = -2.4 * arc;
        rig.armR.rotation.x = -2.75 * arc;
      } else if (p < 0.36) {
        const w = p / 0.36;
        rig.torso.rotation.y = lerp(0, -0.55, w);
        rig.armR.rotation.x = lerp(-0.4, -2.7, w);
      } else {
        const s = (p - 0.36) / 0.64;
        rig.torso.rotation.y = lerp(-0.55, 0.58, s);
        rig.armR.rotation.x = lerp(-2.7, -0.45, s);
      }
    } else if (cfg.modelConfig.weapon === 'staff') {
      // BATTLE MAGE / NECROMANCER MAGIC CAST
      const castArc = Math.sin(p * Math.PI);
      rig.armR.rotation.x = -2.2 * castArc - 0.4;
      rig.armL.rotation.x = -1.8 * castArc - 0.3;
      rig.body.position.y = hoverBase + castArc * 0.22;
    } else {
      // KNIGHT / PALADIN / BOSS OVERHEAD GREATSWORD SLASH
      if (p < 0.38) {
        const w = p / 0.38;
        rig.torso.rotation.x = lerp(0, -0.28, w);
        rig.torso.rotation.y = lerp(0, -0.48, w);
        rig.armR.rotation.x = lerp(-0.4, -2.75, w);
        rig.forearmR.rotation.x = lerp(-0.4, -0.7, w);
      } else {
        const s = (p - 0.38) / 0.62;
        const ease = 1 - Math.pow(1 - s, 3);
        rig.torso.rotation.x = lerp(-0.28, 0.38, ease);
        rig.torso.rotation.y = lerp(-0.48, 0.54, ease);
        rig.armR.rotation.x = lerp(-2.75, -0.52, ease);
        rig.forearmR.rotation.x = -0.2;
      }
    }
  }

  // =========================================================================
  // 5. HIT REACTION / HEAVY STAGGER / BLOCK OVERLAY
  // =========================================================================
  if (unit.heavyStaggerTimer > 0) {
    // Heavy Stagger for Knight / Orc Warrior when struck by powerful blows (Phase 4)
    const st = unit.heavyStaggerTimer / 0.42;
    rig.body.position.y = hoverBase - st * 0.22;
    rig.torso.rotation.x = -st * 0.45;
    rig.thighL.rotation.x = -st * 0.55;
    rig.calfL.rotation.x = st * 0.85;
    rig.armL.rotation.x = -0.95;
    rig.armL.rotation.y = 0.65;
  } else if (unit.hitTimer > 0) {
    const h = unit.hitTimer / 0.25;
    if (animCfg.hasShieldBlock) {
      rig.armL.rotation.x = -0.85;
      rig.armL.rotation.y = 0.68;
      rig.torso.rotation.x -= h * 0.22;
    } else {
      rig.torso.rotation.x -= h * 0.32;
      rig.torso.rotation.z += Math.sin(unit.hitTimer * 45) * 0.2;
      rig.head.rotation.x -= h * 0.28;
    }
  }
}
