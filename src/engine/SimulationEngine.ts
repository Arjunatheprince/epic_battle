import * as THREE from 'three';
import type {
  ActiveUnit,
  BattlePhase,
  BossAnnouncement,
  Faction,
  PerformanceProfileMetrics,
  QualityLevel,
  SpecialGiftEffect,
} from '../types/game';
import { attackWindupSeconds } from '../config/combat';
import { UNIT_CONFIGS } from '../config/units';
import {
  buildProceduralCharacter,
  getBasicMat,
  getOrCreateNameTagMaterial,
} from '../rendering/ProceduralCharacterBuilder';
import { CASTLE_POS_X } from '../rendering/ArenaBuilder';
import { transitionUnitState, updateUnitAnimation } from './AnimationStateMachine';
import { VfxManager } from './VfxManager';
import { CameraDirector } from './CameraDirector';
import { audioManager } from '../audio/AudioManager';

interface PooledProjectile {
  mesh: THREE.Mesh;
  active: boolean;
  attacker: ActiveUnit | null;
  target: ActiveUnit | null;
  targetX: number;
  targetZ: number;
  speed: number;
  isAoe: boolean;
  aoeRadius: number;
  color: number;
  trailTick: number;
}

interface QueuedSpawn {
  unitId: string;
  summonerName?: string;
}

export const QUALITY_UNIT_CAPS: Record<QualityLevel, number> = {
  LOW: 90,
  MEDIUM: 170,
  HIGH: 280,
  ULTRA: 450,
};

export const MAX_CASTLE_HP = 100000;
export const PREP_DURATION = 15;
export const ROUND_DURATION = 1800; // 30 minutes for 100k HP battles
export const FINAL_CLASH_THRESHOLD = 60; // Last 60 seconds

export class SimulationEngine {
  public scene: THREE.Scene;
  public vfx: VfxManager;
  public cameraDirector: CameraDirector;

  public units: ActiveUnit[] = [];
  private unitPools: Record<string, ActiveUnit[]> = {};
  private projectiles: PooledProjectile[] = [];
  private spawnQueue: QueuedSpawn[] = [];

  private pendingStrikes: Array<{ attacker: ActiveUnit; target: ActiveUnit; attackerId: number; targetId: number; delay: number; special: boolean }> = [];
  private mirrorStream = '';
  private mirrorSnapshotTime = -1;
  private impactFeedbackCooldown = 0;
  private nextUid = 1;
  private spawnCooldown = 0;
  public unitCap = QUALITY_UNIT_CAPS.MEDIUM;

  public phase: BattlePhase = 'PREPARATION';
  public roundClock = 0;
  public autoSpawnTimer = 0;
  public autoSpawnEnabled = true;
  public paused = false;
  private endRoundTimer = 0;
  private waveNumber = 0;

  public castleHp: { K: number; M: number } = { K: MAX_CASTLE_HP, M: MAX_CASTLE_HP };
  public activeCount: { K: number; M: number } = { K: 0, M: 0 };

  // Phase 8 Profiling, LOD & Frustum Culling Reusable Objects
  public profileMetrics: PerformanceProfileMetrics = {
    stepTimeMs: 0,
    animTimeMs: 0,
    lodNear: 0,
    lodMid: 0,
    lodFar: 0,
    culledCount: 0,
    powerScoreK: 0,
    powerScoreM: 0,
    comebackBoostK: 1,
    comebackBoostM: 1,
  };
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private boundingSphere = new THREE.Sphere();
  private visualFrameTick = 0;

  // Spatial Hash Grid
  private spatialGrid = new Map<number, ActiveUnit[]>();
  private readonly cellSize = 6;

  // Callbacks to UI / Store
  private onBanner?: (text: string, subtext?: string, durationMs?: number) => void;
  private onBossAnnounce?: (boss: BossAnnouncement | null) => void;
  private projGeo = new THREE.BoxGeometry(0.14, 0.14, 0.95);
  private magicProjGeo = new THREE.OctahedronGeometry(0.28, 1);

  constructor(
    scene: THREE.Scene,
    vfx: VfxManager,
    cameraDirector: CameraDirector,
    callbacks?: {
      onBanner?: (text: string, subtext?: string, durationMs?: number) => void;
      onBossAnnounce?: (boss: BossAnnouncement | null) => void;
    }
  ) {
    this.scene = scene;
    this.vfx = vfx;
    this.cameraDirector = cameraDirector;
    this.onBanner = callbacks?.onBanner;
    this.onBossAnnounce = callbacks?.onBossAnnounce;

    for (const id of Object.keys(UNIT_CONFIGS)) {
      this.unitPools[id] = [];
    }

    // Initialize Projectile Pool (70 projectiles)
    const defaultProjMat = getBasicMat(0xfef08a);
    for (let i = 0; i < 70; i++) {
      const mesh = new THREE.Mesh(this.projGeo, defaultProjMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        active: false,
        attacker: null,
        target: null,
        targetX: 0,
        targetZ: 0,
        speed: 24,
        isAoe: false,
        aoeRadius: 0,
        color: 0xfef08a,
        trailTick: 0,
      });
    }

    this.resetRound();
  }

  public setQuality(level: QualityLevel, sunLight: THREE.DirectionalLight, renderer: THREE.WebGLRenderer): void {
    this.unitCap = QUALITY_UNIT_CAPS[level];
    sunLight.castShadow = level !== 'LOW';
    const maxDpr = level === 'ULTRA' ? 2 : level === 'HIGH' ? 1.75 : level === 'MEDIUM' ? 1.35 : 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  }

  public enqueueSpawn(unitId: string, count = 1, summonerName?: string): void {
    if (!UNIT_CONFIGS[unitId]) return;
    for (let i = 0; i < count; i++) {
      this.spawnQueue.push({ unitId, summonerName });
    }
  }

  private spawnImmediate(unitId: string, summonerName?: string, customPos?: { x: number; z: number }): ActiveUnit | null {
    const cfg = UNIT_CONFIGS[unitId];
    if (!cfg) return null;

    const totalAlive = this.activeCount.K + this.activeCount.M;
    if (totalAlive >= this.unitCap && !cfg.isBoss && !cfg.isLegendary) {
      return null;
    }

    const pool = this.unitPools[unitId];
    let unit = pool.pop();
    if (!unit) {
      const rig = buildProceduralCharacter(cfg);
      this.scene.add(rig.root);
      unit = {
        uid: this.nextUid++,
        typeId: unitId,
        cfg,
        team: cfg.faction,
        hp: cfg.hp,
        maxHp: cfg.maxHp,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vz: 0,
        ry: 0,
        animState: 'SPAWN',
        prevAnimState: 'IDLE',
        stateTime: 0,
        blendWeight: 1,
        animPhase: Math.random() * 6.28,
        attackCooldown: Math.random() * 0.4,
        abilityCooldown: cfg.cooldown * (0.5 + Math.random() * 0.5),
        attackAnimProgress: 0,
        lastStrikeSpecial: false,
        chargeTimer: 0,
        hitTimer: 0,
        heavyStaggerTimer: 0,
        stunTimer: 0,
        spawnTimer: 0.55,
        stepDustTimer: 0,
        dead: false,
        deadTimer: 0,
        rebirthUsed: false,
        target: null,
        retargetTimer: 0,
        isMoving: false,
        isAttackingCastle: false,
        rig,
      };
    }

    const isK = cfg.faction === 'K';
    const spawnX = customPos ? customPos.x : CASTLE_POS_X[cfg.faction] + (isK ? 9.2 : -9.2) + (Math.random() - 0.5) * 3.2;
    const spawnZ = customPos ? customPos.z : (Math.random() - 0.5) * 23;

    unit.uid = this.nextUid++;
    unit.hp = cfg.hp;
    unit.maxHp = cfg.maxHp;
    unit.x = spawnX;
    unit.y = 0;
    unit.z = spawnZ;
    unit.vx = 0;
    unit.vz = 0;
    unit.ry = isK ? Math.PI * 0.5 : -Math.PI * 0.5;
    unit.animState = 'SPAWN';
    unit.prevAnimState = 'IDLE';
    unit.stateTime = 0;
    unit.blendWeight = 1;
    unit.attackCooldown = 0.25 + Math.random() * 0.35;
    unit.abilityCooldown = cfg.cooldown * 0.6;
    unit.attackAnimProgress = 0;
    unit.lastStrikeSpecial = false;
    unit.chargeTimer = 0;
    unit.hitTimer = 0;
    unit.heavyStaggerTimer = 0;
    unit.stunTimer = 0;
    unit.spawnTimer = 0.55;
    unit.stepDustTimer = 0.4;
    unit.dead = false;
    unit.deadTimer = 0;
    unit.rebirthUsed = false;
    unit.target = null;
    unit.retargetTimer = 0;
    unit.isMoving = false;
    unit.isAttackingCastle = false;
    unit.summonerName = summonerName;

    if (unit.rig.nameTagSprite) {
      if (summonerName) {
        unit.rig.nameTagSprite.material = getOrCreateNameTagMaterial(summonerName, cfg.faction);
        unit.rig.nameTagSprite.visible = true;
      } else {
        unit.rig.nameTagSprite.visible = false;
      }
    }

    unit.rig.root.visible = true;
    unit.rig.root.position.set(spawnX, 0, spawnZ);
    unit.rig.root.scale.setScalar(0.02);

    this.units.push(unit);
    this.activeCount[cfg.faction]++;

    // Phase 3 Spawn Portal Vortex & Sound
    this.vfx.emitSpawnPortal(
      spawnX,
      spawnZ,
      cfg.vfxConfig.spawnColor,
      cfg.modelConfig.scale,
      !!(cfg.isBoss || cfg.isLegendary)
    );

    if (cfg.isBoss || cfg.isLegendary) {
      this.cameraDirector.triggerBossOrLegendaryFocus(unit, !!cfg.isLegendary);
      this.cameraDirector.addShake(cfg.isLegendary ? 0.55 : 0.3);
      audioManager.playSpawn(cfg.soundConfig.spawnPitch, true);

      const senderLabel = summonerName || (isK ? 'Komandan Kingdom' : 'Panglima Monster');
      if (cfg.isLegendary) {
        this.onBanner?.(
          `⚡ ${cfg.name.toUpperCase()} ⚡`,
          `LEGENDARY SUMMON oleh ${senderLabel} — ${cfg.ability.name}`,
          5200
        );
      } else {
        this.onBanner?.(
          `🔥 ${cfg.name.toUpperCase()} 🔥`,
          `BOSS SUMMON oleh ${senderLabel}`,
          3400
        );
      }

      this.onBossAnnounce?.({
        unitName: cfg.name,
        team: cfg.faction,
        senderName: senderLabel,
        hp: unit.hp,
        maxHp: unit.maxHp,
        isLegendary: !!cfg.isLegendary,
        abilityName: cfg.ability.name,
      });
    } else {
      audioManager.playSpawn(cfg.soundConfig.spawnPitch, false);
    }

    return unit;
  }

  public triggerSpecialGiftEffect(effect: SpecialGiftEffect, senderName = 'Penonton LIVE'): void {
    const isKingdomAttack = effect === 'METEOR_KINGDOM' || effect === 'FIRESTORM';
    const targetFaction: Faction = isKingdomAttack ? 'M' : 'K';
    const color = isKingdomAttack ? 0xf59e0b : 0xa855f7;

    this.onBanner?.(
      effect === 'METEOR_KINGDOM'
        ? 'METEOR STRIKE!'
        : effect === 'METEOR_MONSTERS'
          ? 'DARK METEOR!'
          : effect === 'FIRESTORM'
            ? 'SACRED FIRESTORM!'
            : 'INFERNAL HELLFIRE!',
      `Dikirim oleh ${senderName}`,
      3000
    );

    audioManager.playWarHorn(isKingdomAttack ? 180 : 120);
    this.cameraDirector.addShake(0.75);

    for (let i = 0; i < 6; i++) {
      const strikeX = (targetFaction === 'M' ? 12 : -12) + (Math.random() - 0.5) * 30;
      const strikeZ = (Math.random() - 0.5) * 24;
      window.setTimeout(() => {
        audioManager.playAttack('fire', 260);
        this.vfx.emitMeteorStrike(strikeX, strikeZ, color, () => {
          this.cameraDirector.addShake(0.42);
          audioManager.playGroundSmash();
          for (const u of this.units) {
            if (!u.dead && u.team === targetFaction) {
              const d = Math.hypot(u.x - strikeX, u.z - strikeZ);
              if (d <= 7.0) {
                this.applyRawDamage(u, 155 * (1 - d / 9.5), strikeX);
              }
            }
          }
        });
      }, i * 190);
    }
  }

  private getCellKey(x: number, z: number): number {
    const cx = Math.floor(x / this.cellSize) + 50;
    const cz = Math.floor(z / this.cellSize) + 50;
    return cx * 200 + cz;
  }

  private queryNearby(x: number, z: number, radius: number, cb: (other: ActiveUnit) => void): void {
    const cx = Math.floor(x / this.cellSize) + 50;
    const cz = Math.floor(z / this.cellSize) + 50;
    const span = Math.ceil(radius / this.cellSize);

    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        const bucket = this.spatialGrid.get((cx + i) * 200 + (cz + j));
        if (bucket) {
          for (let k = 0; k < bucket.length; k++) {
            cb(bucket[k]);
          }
        }
      }
    }
  }

  private fireProjectile(attacker: ActiveUnit, target: ActiveUnit, isAoe = false, aoeRadius = 0): void {
    const proj = this.projectiles.find((p) => !p.active);
    if (!proj) {
      this.applyCombatDamage(target, attacker, 1.0);
      return;
    }

    const col = attacker.cfg.vfxConfig.projectileColor ?? (attacker.team === 'K' ? 0x60a5fa : 0xc084fc);
    proj.active = true;
    proj.attacker = attacker;
    proj.target = target;
    proj.targetX = target.x;
    proj.targetZ = target.z;
    proj.speed = attacker.cfg.modelConfig.weapon === 'bow' ? 16 : 12.5;
    proj.isAoe = isAoe;
    proj.aoeRadius = aoeRadius;
    proj.color = col;
    proj.trailTick = 0;

    proj.mesh.material = getBasicMat(col);
    const isArrow = attacker.cfg.modelConfig.weapon === 'bow';
    proj.mesh.geometry = isArrow ? this.projGeo : this.magicProjGeo;
    proj.mesh.position.set(attacker.x, 1.65 * attacker.cfg.modelConfig.scale, attacker.z);
    const projectileScale = isArrow ? 1 : Math.min(2.5, attacker.cfg.modelConfig.scale);
    proj.mesh.scale.set(projectileScale, projectileScale, isArrow ? 1.5 : projectileScale);
    proj.mesh.visible = true;
  }

  private stepProjectiles(dt: number, mirrorOnly = false): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const t = p.target;
      const tx = t && !t.dead ? t.x : p.targetX;
      const tz = t && !t.dead ? t.z : p.targetZ;
      const ty = 1.3;

      const dx = tx - p.mesh.position.x;
      const dy = ty - p.mesh.position.y;
      const dz = tz - p.mesh.position.z;
      const dist = Math.hypot(dx, dy, dz);
      const stepDist = p.speed * dt;

      // Phase 3 Arrow / Magic Projectile Trail Particle
      p.trailTick += dt;
      if (!mirrorOnly && p.trailTick >= 0.045) {
        p.trailTick = 0;
        this.vfx.emitBurst(
          p.mesh.position.x,
          p.mesh.position.y,
          p.mesh.position.z,
          1,
          p.color,
          0.8,
          p.isAoe ? 0.85 : 0.48,
          2
        );
      }

      if (dist <= stepDist + 0.45) {
        if (!mirrorOnly && p.attacker) {
          if (p.isAoe && p.aoeRadius > 0) {
            this.vfx.emitShockwaveRing(tx, 0.15, tz, p.color, 0.5, p.aoeRadius, 0.45);
            this.vfx.emitBurst(tx, 1.2, tz, 10, p.color, 5.5, 1.1);
            this.queryNearby(tx, tz, p.aoeRadius, (other) => {
              if (!other.dead && other.team !== p.attacker!.team) {
                const od = Math.hypot(other.x - tx, other.z - tz);
                if (od <= p.aoeRadius) {
                  this.applyCombatDamage(other, p.attacker!, 1.15);
                }
              }
            });
          } else if (t && !t.dead) {
            this.applyCombatDamage(t, p.attacker, 1.0);
          }
        }
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.mesh.position.x += (dx / dist) * stepDist;
        p.mesh.position.y += (dy / dist) * stepDist;
        p.mesh.position.z += (dz / dist) * stepDist;
        p.mesh.lookAt(tx, ty, tz);
      }
    }
  }

  private applyRawDamage(target: ActiveUnit, rawDmg: number, sourceX: number): void {
    if (target.dead) return;
    const mitigated = rawDmg * (1 - target.cfg.armor);
    target.hp -= mitigated;
    target.hitTimer = 0.24;

    const pushSign = Math.sign(target.x - sourceX) || (target.team === 'K' ? -1 : 1);
    const kb = target.cfg.isBoss ? 0.6 : 2.2;
    target.vx += pushSign * kb;

    this.vfx.emitHitImpact(target.x, 1.3, target.z, target.cfg.vfxConfig.hitColor, false, true);
    audioManager.playHit(target.cfg.soundConfig.hitPitch, false, true);

    this.checkUnitDeathOrRebirth(target);
  }

  private applyCombatDamage(target: ActiveUnit, attacker: ActiveUnit, multiplier = 1.0): void {
    if (target.dead) return;
    const atkBoost =
      attacker.team === 'K' ? this.profileMetrics.comebackBoostK : this.profileMetrics.comebackBoostM;
    const defBoost =
      target.team === 'K' ? this.profileMetrics.comebackBoostK : this.profileMetrics.comebackBoostM;
    const raw = (attacker.cfg.damage * multiplier * atkBoost) / Math.sqrt(defBoost);
    const isBlocked = !!target.cfg.animationConfig.hasShieldBlock && Math.random() < 0.35;
    const isHeavy = raw >= 45 || attacker.cfg.tier >= 4;

    const blockBonus = isBlocked ? 0.25 : 0;
    const mitigated = raw * Math.max(0.15, 1 - target.cfg.armor - blockBonus);
    target.hp -= mitigated;
    target.hitTimer = 0.24;

    // Phase 4 Heavy Stagger for Knight / Orc Warrior when struck by powerful blows
    if (isHeavy && (target.cfg.tier === 3 || target.cfg.animationConfig.archetype === 'orc_warrior')) {
      target.heavyStaggerTimer = 0.42;
    }

    if (isBlocked && target.attackAnimProgress <= 0) {
      transitionUnitState(target, 'BLOCK');
    } else if (target.attackAnimProgress <= 0) {
      transitionUnitState(target, 'HIT');
    }

    const dx = target.x - attacker.x, dz = target.z - attacker.z;
    const length = Math.hypot(dx, dz) || 1;
    const kb = (target.cfg.isBoss ? 0.45 : isHeavy ? 3.4 : 2.1) * (isBlocked ? 0.5 : 1);
    target.vx += (dx / length) * kb;
    target.vz += (dz / length) * kb;
    if (isHeavy && this.impactFeedbackCooldown <= 0) {
      this.cameraDirector.addShake(0.13);
      this.impactFeedbackCooldown = 0.18;
    }

    this.vfx.emitHitImpact(
      target.x,
      1.3 * target.cfg.modelConfig.scale,
      target.z,
      attacker.cfg.vfxConfig.hitColor,
      isBlocked,
      isHeavy
    );
    audioManager.playHit(target.cfg.soundConfig.hitPitch, isBlocked, isHeavy);

    this.checkUnitDeathOrRebirth(target);
    this.vfx.emitDamageNumber(target.x, 2.3 * target.cfg.modelConfig.scale, target.z,
      mitigated, isBlocked, isHeavy, target.dead);
  }

  private checkUnitDeathOrRebirth(target: ActiveUnit): void {
    if (target.hp > 0 || target.dead) return;

    // Phoenix Rebirth Mechanic
    if (target.cfg.ability.type === 'REBIRTH' && !target.rebirthUsed) {
      target.rebirthUsed = true;
      target.hp = target.maxHp * target.cfg.ability.value;
      this.vfx.emitSkyBeam(target.x, target.z, target.cfg.vfxConfig.spawnColor, 2.0, 0.7);
      audioManager.playSpawn(target.cfg.soundConfig.spawnPitch, true);
      return;
    }

    if (target.cfg.isBoss || target.cfg.isLegendary) {
      this.onBanner?.(`${target.cfg.name.toUpperCase()} TUMBANG!`,
        target.team === 'K' ? 'MONSTERS MENEMBUS PERTAHANAN!' : 'KINGDOM MEMBALAS SERANGAN!', 2400);
      this.cameraDirector.addShake(0.22);
    }
    target.dead = true;
    target.deadTimer = 0;
    transitionUnitState(target, 'DEATH', true);
    this.activeCount[target.team] = Math.max(0, this.activeCount[target.team] - 1);

    const isStone = !!target.cfg.modelConfig.isStoneGolem;
    const isBone = !!target.cfg.modelConfig.isSkeleton;
    audioManager.playDeath(target.cfg.soundConfig.deathPitch, isStone || isBone);

    const debrisColor = isStone ? 0x78716c : isBone ? 0xe7e5e4 : undefined;
    this.vfx.emitDeathDissolve(
      target.x,
      target.z,
      target.team === 'K' ? 0x60a5fa : 0xef4444,
      target.cfg.modelConfig.scale,
      debrisColor
    );
  }

  private executeUnitAttackOrAbility(u: ActiveUnit, target: ActiveUnit): void {
    const cfg = u.cfg;
    const useSpecial = u.abilityCooldown <= 0;
    u.lastStrikeSpecial = useSpecial;

    if (useSpecial) {
      u.abilityCooldown = cfg.cooldown;
      transitionUnitState(u, 'SPECIAL_ABILITY', true);
    } else {
      transitionUnitState(u, 'ATTACK', true);
    }

    u.attackAnimProgress = 1.0;

    this.pendingStrikes.push({ attacker: u, target, attackerId: u.uid, targetId: target.uid,
      delay: attackWindupSeconds(cfg), special: useSpecial });
  }

  private resolveStrike(u: ActiveUnit, target: ActiveUnit, useSpecial: boolean): void {
    const cfg = u.cfg;
    audioManager.playAttack(cfg.soundConfig.attackType, cfg.soundConfig.attackPitch);
    this.vfx.emitCharacterStrike(cfg, u.x, 1.35 * cfg.modelConfig.scale, u.z, u.ry, target.x, target.z, useSpecial);

    if (useSpecial) {
      const ab = cfg.ability;
      switch (ab.type) {
        case 'HEAL_AURA': {
          const rad = ab.radius || 5.5;
          this.vfx.emitHealParticles(u.x, u.z, 0xfef08a, rad);
          this.queryNearby(u.x, u.z, rad, (ally) => {
            if (!ally.dead && ally.team === u.team) {
              ally.hp = Math.min(ally.maxHp, ally.hp + ab.value);
            }
          });
          this.applyCombatDamage(target, u, 1.15);
          return;
        }
        case 'SUMMON_SKELETON': {
          this.spawnImmediate('m_skeleton_guard', u.summonerName, {
            x: u.x - 2.2,
            z: u.z + (Math.random() - 0.5) * 2.5,
          });
          this.fireProjectile(u, target, true, ab.radius || 3.2);
          return;
        }
        case 'LIFESTEAL': {
          this.applyCombatDamage(target, u, 1.45);
          u.hp = Math.min(u.maxHp, u.hp + cfg.damage * ab.value);
          this.vfx.emitShockwaveRing(u.x, 0.2, u.z, 0xa855f7, 0.4, 2.4, 0.4);
          return;
        }
        case 'REGENERATION': {
          // Phase 4 Troll Regeneration + Ground Club Smash
          u.hp = Math.min(u.maxHp, u.hp + ab.value);
          this.vfx.emitHealParticles(u.x, u.z, 0x4ade80, 2.8);
          audioManager.playGroundSmash();
          const rad = ab.radius || 3.8;
          this.vfx.emitShockwaveRing(target.x, 0.15, target.z, cfg.vfxConfig.slashColor, 0.5, rad, 0.5);
          this.cameraDirector.addShake(0.22);
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team) {
              this.applyCombatDamage(enemy, u, 1.25);
            }
          });
          return;
        }
        case 'CHARGE': {
          // Phase 6 Royal Cavalry Lance Charge & Warg Rider Wolf Leap
          u.chargeTimer = 0.55;
          u.vx += Math.sin(u.ry) * 8.5;
          u.vz += Math.cos(u.ry) * 8.5;
          this.vfx.emitShockwaveRing(u.x, 0.15, u.z, cfg.vfxConfig.slashColor, 0.5, 2.8, 0.45);
          const rad = ab.radius || 2.4;
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team) {
              this.applyCombatDamage(enemy, u, ab.value);
            }
          });
          return;
        }
        case 'CHAIN_LIGHTNING': {
          // Phase 6 Thunder God & Storm Demon Multi-Target 3D Chain Lightning
          const rad = ab.radius || 6.5;
          const chainPoints: Array<{ x: number; y: number; z: number }> = [
            { x: u.x, y: 2.8, z: u.z },
            { x: target.x, y: 1.5, z: target.z },
          ];
          this.applyCombatDamage(target, u, ab.value);
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team && enemy !== target && chainPoints.length < 6) {
              chainPoints.push({ x: enemy.x, y: 1.5, z: enemy.z });
              this.applyCombatDamage(enemy, u, ab.value * 0.8);
            }
          });
          this.vfx.emitChainLightning(chainPoints, cfg.vfxConfig.slashColor);
          this.vfx.emitSkyBeam(target.x, target.z, cfg.vfxConfig.slashColor, 1.4, 0.45);
          this.cameraDirector.addShake(0.32);
          return;
        }
        case 'DRAGON_BREATH': {
          // Phase 6 Celestial Dragon & Abyssal Dragon Cone Breath
          const rad = ab.radius || 5.0;
          this.vfx.emitDragonBreath(
            u.x,
            2.6,
            u.z,
            u.ry,
            cfg.vfxConfig.slashColor,
            cfg.vfxConfig.hitColor
          );
          this.vfx.emitShockwaveRing(target.x, 0.15, target.z, cfg.vfxConfig.slashColor, 0.6, rad, 0.55);
          this.cameraDirector.addShake(0.28);
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team) {
              this.applyCombatDamage(enemy, u, ab.value);
            }
          });
          return;
        }
        case 'ULTIMATE_BEAM': {
          // Phase 6 Celestial Emperor & Abyssal Emperor Triple-Pillar Cataclysm
          const rad = ab.radius || 7.5;
          this.vfx.emitSkyBeam(target.x, target.z, cfg.vfxConfig.slashColor, 2.4, 0.75);
          this.vfx.emitSkyBeam(target.x + 3.2, target.z - 2.5, cfg.vfxConfig.hitColor, 1.5, 0.6);
          this.vfx.emitSkyBeam(target.x - 3.2, target.z + 2.5, cfg.vfxConfig.hitColor, 1.5, 0.6);
          this.cameraDirector.addShake(0.55);
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team) {
              this.applyCombatDamage(enemy, u, ab.value);
            }
          });
          return;
        }
        case 'GROUND_SMASH':
        case 'HOLY_BEAM': {
          const rad = ab.radius || 4.5;
          if (ab.type === 'HOLY_BEAM') {
            this.vfx.emitSkyBeam(target.x, target.z, cfg.vfxConfig.slashColor, rad * 0.35, 0.55);
            // Angel Guardian also heals nearby allies when casting Holy Beam
            if (u.team === 'K') {
              this.vfx.emitHealParticles(u.x, u.z, 0xfef08a, 4.5);
              this.queryNearby(u.x, u.z, 4.5, (ally) => {
                if (!ally.dead && ally.team === 'K') {
                  ally.hp = Math.min(ally.maxHp, ally.hp + 45);
                }
              });
            }
          } else {
            audioManager.playGroundSmash();
            this.vfx.emitShockwaveRing(target.x, 0.15, target.z, cfg.vfxConfig.slashColor, 0.7, rad, 0.55);
            this.vfx.emitBurst(target.x, 0.6, target.z, 14, cfg.vfxConfig.hitColor, 6.8, 1.25);
          }
          this.cameraDirector.addShake(cfg.isLegendary ? 0.35 : 0.22);
          this.queryNearby(target.x, target.z, rad, (enemy) => {
            if (!enemy.dead && enemy.team !== u.team) {
              const d = Math.hypot(enemy.x - target.x, enemy.z - target.z);
              if (d <= rad) {
                this.applyCombatDamage(enemy, u, enemy === target ? ab.value : ab.value * 0.65);
              }
            }
          });
          return;
        }
        case 'SHIELD_BASH': {
          this.applyCombatDamage(target, u, ab.value);
          target.stunTimer = 0.65;
          const push = Math.sign(target.x - u.x) || 1;
          target.vx += push * 5.2;
          return;
        }
        default:
          break;
      }
    }

    // Standard Attack Execution
    if (cfg.isRanged) {
      const aoeRad = cfg.vfxConfig.aoeRadius || 0;
      this.fireProjectile(u, target, aoeRad > 0, aoeRad);
    } else {
      this.applyCombatDamage(target, u, useSpecial ? cfg.ability.value : 1.0);
      const aoeRad = cfg.vfxConfig.aoeRadius || 0;
      if (aoeRad > 0) {
        this.queryNearby(target.x, target.z, aoeRad, (other) => {
          if (!other.dead && other.team !== u.team && other !== target) {
            const d = Math.hypot(other.x - target.x, other.z - target.z);
            if (d <= aoeRad) {
              this.applyCombatDamage(other, u, 0.55);
            }
          }
        });
      }
    }
  }

  public stepFixed(dt: number): void {
    if (this.paused) return;
    const t0 = performance.now();
    this.impactFeedbackCooldown = Math.max(0, this.impactFeedbackCooldown - dt);

    // Calculate subtle comeback resilience boost when a castle is significantly behind in HP
    const hpDiff = (this.castleHp.M - this.castleHp.K) / MAX_CASTLE_HP;
    this.profileMetrics.comebackBoostK = hpDiff > 0.12 ? Math.min(1.22, 1 + hpDiff * 0.35) : 1.0;
    this.profileMetrics.comebackBoostM = hpDiff < -0.12 ? Math.min(1.22, 1 + Math.abs(hpDiff) * 0.35) : 1.0;

    for (const u of this.units) {
      u.attackAnimProgress = Math.max(0, u.attackAnimProgress - dt * u.cfg.attackSpeed * 2.15);
    }
    for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
      const strike = this.pendingStrikes[i];
      strike.delay -= dt;
      if (strike.delay > 0) continue;
      this.pendingStrikes.splice(i, 1);
      if (strike.attacker.uid === strike.attackerId && strike.target.uid === strike.targetId &&
          !strike.attacker.dead && !strike.target.dead && strike.attacker.stunTimer <= 0) {
        this.resolveStrike(strike.attacker, strike.target, strike.special);
      }
    }
    this.roundClock += dt;
    this.stepProjectiles(dt);

    // Phase Progression
    if (this.phase === 'PREPARATION' && this.roundClock >= PREP_DURATION) {
      this.phase = 'NORMAL_BATTLE';
      this.roundClock = 0;
      audioManager.setPhase('NORMAL_BATTLE');
      audioManager.playWarHorn(110);
      this.onBanner?.('PERTEMPURAN DIMULAI!', 'Kingdom vs Monsters', 2600);
    } else if (
      this.phase === 'NORMAL_BATTLE' &&
      (this.roundClock >= ROUND_DURATION * 0.5 ||
        this.castleHp.K < MAX_CASTLE_HP * 0.55 ||
        this.castleHp.M < MAX_CASTLE_HP * 0.55)
    ) {
      this.phase = 'INTENSE_BATTLE';
      audioManager.setPhase('INTENSE_BATTLE');
    } else if (
      (this.phase === 'NORMAL_BATTLE' || this.phase === 'INTENSE_BATTLE') &&
      this.roundClock >= ROUND_DURATION - FINAL_CLASH_THRESHOLD
    ) {
      this.phase = 'FINAL_CLASH';
      audioManager.setPhase('FINAL_CLASH');
      this.onBanner?.('FINAL CLASH!', '60 Detik Terakhir — Serangan Penuh!', 3200);
    }

    const isFighting =
      this.phase === 'NORMAL_BATTLE' ||
      this.phase === 'INTENSE_BATTLE' ||
      this.phase === 'FINAL_CLASH';

    if (isFighting) {
      if (this.roundClock >= ROUND_DURATION) {
        const winner: Faction = this.castleHp.K >= this.castleHp.M ? 'K' : 'M';
        this.finishRound(winner, true);
        return;
      }

      // Auto Spawn Loop: Basic troops only & small numbers so viewers are curious to send Gifts!
      this.autoSpawnTimer -= dt;
      if (this.autoSpawnEnabled && this.autoSpawnTimer <= 0) {
        this.autoSpawnTimer = this.phase === 'FINAL_CLASH' ? 5.5 : 8.0;
        this.waveNumber++;

        const kUnderdog = this.activeCount.K < this.activeCount.M * 0.4 ? 1 : 0;
        const mUnderdog = this.activeCount.M < this.activeCount.K * 0.8 ? 1 : 0;

        this.enqueueSpawn('k_swordsman', 1 + kUnderdog);
        this.enqueueSpawn('m_goblin', 2 + mUnderdog);

        if (this.waveNumber % 4 === 0) {
          this.enqueueSpawn('k_shield_guard', 1);
          this.enqueueSpawn('m_skeleton_guard', 1);
        }
      }
    }

    // Drain Spawn Queue smoothly (max 2 per step to avoid frame spikes on large spawns)
    this.spawnCooldown -= dt;
    if (this.spawnQueue.length > 0 && this.spawnCooldown <= 0) {
      for (let i = 0; i < 2 && this.spawnQueue.length > 0; i++) {
        const next = this.spawnQueue.shift()!;
        this.spawnImmediate(next.unitId, next.summonerName);
      }
      this.spawnCooldown = 0.04;
    }

    // Rebuild Spatial Hash Grid & Compute Live Army Power Score
    this.spatialGrid.clear();
    let pScoreK = 0;
    let pScoreM = 0;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (!u.dead) {
        const k = this.getCellKey(u.x, u.z);
        let bucket = this.spatialGrid.get(k);
        if (!bucket) {
          bucket = [];
          this.spatialGrid.set(k, bucket);
        }
        bucket.push(u);
        const unitPower = Math.ceil((u.hp / u.maxHp) * u.cfg.spawnCost * 10);
        if (u.team === 'K') pScoreK += unitPower;
        else pScoreM += unitPower;
      }
    }
    this.profileMetrics.powerScoreK = pScoreK;
    this.profileMetrics.powerScoreM = pScoreM;

    // Update Active Units
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      if (u.dead) continue;

      const cfg = u.cfg;
      u.isMoving = false;
      u.isAttackingCastle = false;
      u.hitTimer = Math.max(0, u.hitTimer - dt);
      u.heavyStaggerTimer = Math.max(0, u.heavyStaggerTimer - dt);
      u.chargeTimer = Math.max(0, u.chargeTimer - dt);
      u.stunTimer = Math.max(0, u.stunTimer - dt);
      u.attackCooldown = Math.max(0, u.attackCooldown - dt);
      u.abilityCooldown = Math.max(0, u.abilityCooldown - dt);

      if (u.spawnTimer > 0) {
        u.spawnTimer -= dt;
        if (u.spawnTimer <= 0) {
          transitionUnitState(u, 'IDLE');
        }
        continue;
      }

      if (u.stunTimer > 0) {
        transitionUnitState(u, 'STUN');
        continue;
      }

      let moveX = 0;
      let moveZ = 0;

      if (isFighting) {
        u.retargetTimer -= dt;
        if (!u.target || u.target.dead || u.retargetTimer <= 0) {
          u.retargetTimer = 0.3 + Math.random() * 0.2;
          let bestTarget: ActiveUnit | null = null;
          let bestScore = Infinity;

          this.queryNearby(u.x, u.z, 26, (other) => {
            if (other.team !== u.team && !other.dead) {
              const distSq = (other.x - u.x) ** 2 + (other.z - u.z) ** 2;
              let score = distSq;
              if (cfg.targetPriority === 'LOWEST_HP') {
                score = distSq * 0.5 + (other.hp / other.maxHp) * 120;
              } else if (cfg.targetPriority === 'RANGED_FIRST' && other.cfg.isRanged) {
                score = distSq * 0.35;
              }
              if (score < bestScore) {
                bestScore = score;
                bestTarget = other;
              }
            }
          });
          u.target = bestTarget;
        }

        const t = u.target;
        if (t && !t.dead) {
          const ex = t.x - u.x;
          const ez = t.z - u.z;
          const dist = Math.hypot(ex, ez) || 0.01;
          const surfaceGap = dist - cfg.collisionRadius - t.cfg.collisionRadius;
          u.ry = Math.atan2(ex, ez);

          // Phase 4 Archer & Skeleton Archer Distance Kiting: step back if melee enemy closes in
          if (cfg.isRanged && surfaceGap < 3.4 && Math.abs(u.x) < 36) {
            moveX = -(ex / dist) * 0.68;
            moveZ = -(ez / dist) * 0.42;
          }

          if (surfaceGap <= cfg.attackRange) {
            if (u.attackCooldown <= 0) {
              u.attackCooldown = 1 / cfg.attackSpeed;
              this.executeUnitAttackOrAbility(u, t);
            }
          } else {
            moveX = ex / dist;
            moveZ = ez / dist;
          }
        } else {
          // March toward Enemy Castle
          const enemyTeam: Faction = u.team === 'K' ? 'M' : 'K';
          const castleX = CASTLE_POS_X[enemyTeam];
          const ex = castleX - u.x;

          if (Math.abs(ex) > 9.5 + cfg.collisionRadius) {
            moveX = Math.sign(ex);
            moveZ = -u.z * 0.045;
            u.ry = Math.atan2(moveX, moveZ);
          } else {
            u.isAttackingCastle = true;
            u.ry = Math.atan2(ex, 0);
            if (u.attackCooldown <= 0) {
              u.attackCooldown = 1 / cfg.attackSpeed;
              u.attackAnimProgress = 1.0;
              transitionUnitState(u, 'ATTACK', true);
              const siegeDmg = cfg.damage * 0.72;
              this.castleHp[enemyTeam] = Math.max(0, this.castleHp[enemyTeam] - siegeDmg);
              this.cameraDirector.addShake(cfg.isBoss ? 0.2 : 0.05);
              this.vfx.emitHitImpact(
                castleX + (enemyTeam === 'K' ? 7.5 : -7.5),
                2.2,
                u.z,
                cfg.vfxConfig.hitColor,
                false,
                cfg.tier >= 4
              );
              audioManager.playHit(190, false, cfg.tier >= 4);

              if (this.castleHp[enemyTeam] <= 0) {
                this.finishRound(u.team, false);
                return;
              }
            }
          }
        }
      }

      // Soft Collision Avoidance
      let pushX = 0;
      let pushZ = 0;
      this.queryNearby(u.x, u.z, cfg.collisionRadius * 2.2, (other) => {
        if (other !== u && !other.dead) {
          const ox = u.x - other.x;
          const oz = u.z - other.z;
          const d = Math.hypot(ox, oz) || 0.01;
          const minSep = cfg.collisionRadius + other.cfg.collisionRadius;
          if (d < minSep) {
            const overlap = (minSep - d) / minSep;
            pushX += (ox / d) * overlap * 1.6;
            pushZ += (oz / d) * overlap * 1.6;
          }
        }
      });

      u.x += moveX * cfg.moveSpeed * dt + pushX * dt * 4.2 + u.vx * dt;
      u.z += moveZ * cfg.moveSpeed * dt + pushZ * dt * 4.2 + u.vz * dt;
      u.vx *= 0.88;
      u.vz *= 0.88;

      u.x = Math.max(CASTLE_POS_X.K + 6.5, Math.min(CASTLE_POS_X.M - 6.5, u.x));
      u.z = Math.max(-16.5, Math.min(16.5, u.z));

      u.isMoving = Math.abs(moveX) > 0.01 || Math.abs(moveZ) > 0.01;

      // Phase 4 Heavy Footstep Dust Puffs for Golem, Troll, Titans
      if (u.isMoving && cfg.tier >= 4 && !cfg.isFlying) {
        u.stepDustTimer -= dt;
        if (u.stepDustTimer <= 0) {
          u.stepDustTimer = 0.65;
          this.vfx.emitShockwaveRing(u.x, 0.06, u.z, 0xa8a29e, 0.3, 1.4, 0.3);
        }
      }

      if (u.attackAnimProgress <= 0 && u.hitTimer <= 0) {
        transitionUnitState(u, u.isMoving ? 'RUN' : 'IDLE');
      }
    }

    if (this.phase === 'VICTORY_KINGDOM' || this.phase === 'VICTORY_MONSTERS') {
      this.endRoundTimer -= dt;
      if (this.endRoundTimer <= 0) {
        this.resetRound();
      }
    }

    this.profileMetrics.stepTimeMs = Number((performance.now() - t0).toFixed(2));
  }

  public updateVisuals(dt: number, camera: THREE.PerspectiveCamera, mirror = false): void {
    const t0 = performance.now();
    const animDt = this.paused ? 0 : dt;
    if (mirror && !this.paused) this.stepProjectiles(dt, true);
    const cameraPos = camera.position;
    this.visualFrameTick++;

    // Update Frustum Planes once per frame for fast sphere culling
    camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    let lodNear = 0;
    let lodMid = 0;
    let lodFar = 0;
    let culledCount = 0;

    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (mirror) u.attackAnimProgress = Math.max(0, u.attackAnimProgress - animDt * u.cfg.attackSpeed * 2.15);
      if (u.dead) {
        u.deadTimer += animDt;
      }

      const maxDeathTime = (u.cfg.animationConfig.deathDuration || 1.2) + 0.75;
      if (u.dead && u.deadTimer >= maxDeathTime) {
        u.rig.root.visible = false;
        this.unitPools[u.typeId].push(u);
        this.units.splice(i, 1);
        continue;
      }

      // Frustum & 3-Tier Distance LOD Classification
      this.boundingSphere.center.set(u.x, u.y + 1.4, u.z);
      this.boundingSphere.radius = Math.max(2.2, u.cfg.collisionRadius * 2.8);
      const inFrustum = this.frustum.intersectsSphere(this.boundingSphere);

      if (!inFrustum && !u.dead && u.spawnTimer <= 0) {
        culledCount++;
        updateUnitAnimation(u, animDt, cameraPos, 2);
        continue;
      }

      const dx = u.x - cameraPos.x;
      const dy = u.y - cameraPos.y;
      const dz = u.z - cameraPos.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      let lodTier: 0 | 1 | 2 = 0;
      if (u.cfg.isBoss || u.cfg.isLegendary || distSq < 46 * 46) {
        lodTier = 0;
        lodNear++;
      } else if (distSq < 88 * 88) {
        lodTier = 1;
        lodMid++;
        // Half-rate limb update for mid-distance units
        if (!u.dead && u.spawnTimer <= 0 && (u.uid + this.visualFrameTick) % 2 !== 0) {
          u.rig.root.position.set(u.x, u.y, u.z);
          continue;
        }
      } else {
        lodTier = 2;
        lodFar++;
      }

      updateUnitAnimation(u, lodTier === 1 ? animDt * 2 : animDt, cameraPos, lodTier);
    }

    if (!this.paused) {
      this.vfx.update(dt);
    }

    this.profileMetrics.lodNear = lodNear;
    this.profileMetrics.lodMid = lodMid;
    this.profileMetrics.lodFar = lodFar;
    this.profileMetrics.culledCount = culledCount;
    this.profileMetrics.animTimeMs = Number((performance.now() - t0).toFixed(2));
  }

  public runStressBenchmark(targetCount = 160): void {
    const needed = Math.max(20, Math.min(this.unitCap - (this.activeCount.K + this.activeCount.M), targetCount));
    const pairs = Math.floor(needed / 3);
    for (let i = 0; i < pairs; i++) {
      this.enqueueSpawn(i % 5 === 0 ? 'k_archer' : i % 4 === 0 ? 'k_shield_guard' : 'k_swordsman', 1);
      this.enqueueSpawn(i % 5 === 0 ? 'm_skeleton_archer' : i % 4 === 0 ? 'm_skeleton_guard' : 'm_goblin', 2);
    }
    this.onBanner?.('STRESS BENCHMARK AKTIF', `Memunculkan +${pairs * 3} pasukan untuk uji performa & LOD`, 2800);
  }

  public finishRound(winner: Faction, byTimeout: boolean): void {
    if (this.phase === 'VICTORY_KINGDOM' || this.phase === 'VICTORY_MONSTERS') return;

    this.phase = winner === 'K' ? 'VICTORY_KINGDOM' : 'VICTORY_MONSTERS';
    this.endRoundTimer = 9.0;
    audioManager.setPhase(this.phase);
    this.cameraDirector.triggerVictoryFocus(winner);

    const title = winner === 'K' ? 'KINGDOM VICTORY!' : 'MONSTERS VICTORY!';
    const sub = byTimeout
      ? 'Waktu habis — Benteng dengan HP tertinggi menang!'
      : winner === 'K'
        ? 'Benteng Kegelapan Monsters telah dihancurkan!'
        : 'Benteng Kerajaan Kingdom telah runtuh!';

    this.onBanner?.(title, sub, 8500);

    for (const u of this.units) {
      if (!u.dead && u.team !== winner) {
        u.hp = 0;
        this.checkUnitDeathOrRebirth(u);
      }
    }
  }

  public resetRound(): void {
    this.pendingStrikes.length = 0;

    this.impactFeedbackCooldown = 0;
    for (const u of this.units) {
      u.rig.root.visible = false;
      this.unitPools[u.typeId].push(u);
    }
    this.units.length = 0;
    this.activeCount.K = 0;
    this.activeCount.M = 0;
    this.spawnQueue.length = 0;
    this.castleHp.K = MAX_CASTLE_HP;
    this.castleHp.M = MAX_CASTLE_HP;
    this.waveNumber = 0;

    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }

    this.phase = 'PREPARATION';
    this.roundClock = 0;
    this.autoSpawnTimer = 0;
    audioManager.setPhase('PREPARATION');
    this.onBossAnnounce?.(null);
    this.onBanner?.('PERSIAPAN PASUKAN', 'Ketik KINGDOM atau MONSTER di kolom komentar!', 3500);

    // Initial Basic Vanguard (Small & simple so viewers send Gifts for stronger troops)
    this.enqueueSpawn('k_swordsman', 2);
    this.enqueueSpawn('m_goblin', 4);
  }

  public serializeMirrorState(): any {
    return {
      fx: this.vfx.serializeVisualEvents(),
      p: this.projectiles.flatMap((p, id) => p.active ? [[id,
        Number(p.mesh.position.x.toFixed(3)), Number(p.mesh.position.y.toFixed(3)), Number(p.mesh.position.z.toFixed(3)),
        p.target && !p.target.dead ? p.target.x : p.targetX, p.target && !p.target.dead ? p.target.z : p.targetZ,
        p.color, p.speed, p.mesh.scale.x, p.mesh.scale.z, p.attacker?.cfg.modelConfig.weapon === 'bow' ? 1 : 0]] : []),
      kHP: this.castleHp.K,
      mHP: this.castleHp.M,
      ph: this.phase,
      clk: Number(this.roundClock.toFixed(2)),
      pa: this.paused ? 1 : 0,
      u: this.units.map((u) => [
        u.uid,
        u.typeId,
        Number(u.x.toFixed(2)),
        Number(u.z.toFixed(2)),
        Number(u.ry.toFixed(2)),
        Math.ceil(u.hp),
        u.dead ? 1 : 0,
        Number(u.deadTimer.toFixed(2)),
        Number(u.spawnTimer.toFixed(2)),
        u.isMoving ? 1 : 0,
        u.animState,
        Number(u.attackAnimProgress.toFixed(2)),
        Number(u.hitTimer.toFixed(2)),
        u.summonerName || '',
        u.lastStrikeSpecial ? 1 : 0,
      ]),
    };
  }

  public applyMirrorState(s: any): void {
    if (!s || !Array.isArray(s.u)) return;
    if (s.fx) {
      this.vfx.applyVisualEvents(s.fx);
      if (this.mirrorStream === s.fx.stream && s.fx.now < this.mirrorSnapshotTime) return;
      if (this.mirrorStream !== s.fx.stream) {
        for (const unit of this.units) { unit.rig.root.visible = false; this.unitPools[unit.typeId].push(unit); }
        this.units.length = 0;
        this.mirrorStream = s.fx.stream;
      }
      this.mirrorSnapshotTime = s.fx.now;
    }
    const activeProjectiles = new Set<number>();
    for (const row of s.p || []) {
      const [id, x, y, z, tx, tz, color, speed, scale, length, arrow] = row;
      const p = this.projectiles[id];
      if (!p) continue;
      activeProjectiles.add(id);
      p.active = true;
      p.attacker = p.target = null;
      p.targetX = tx; p.targetZ = tz; p.speed = speed;
      p.mesh.geometry = arrow ? this.projGeo : this.magicProjGeo;
      p.mesh.material = getBasicMat(color);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.set(scale, scale, length);
      p.mesh.lookAt(tx, 1.3, tz);
      p.mesh.visible = true;
    }
    this.projectiles.forEach((p, id) => {
      if (!activeProjectiles.has(id)) { p.active = false; p.mesh.visible = false; }
    });
    this.castleHp.K = s.kHP;
    this.castleHp.M = s.mHP;
    if (this.phase !== s.ph) {
      this.phase = s.ph;
      audioManager.setPhase(s.ph);
    }
    this.roundClock = s.clk;
    this.paused = Boolean(s.pa);

    const existingByUid = new Map<number, ActiveUnit>();
    for (let i = 0; i < this.units.length; i++) {
      existingByUid.set(this.units[i].uid, this.units[i]);
    }

    const seen = new Set<number>();
    let countK = 0;
    let countM = 0;
    let newBuildsThisTick = 0;

    for (const row of s.u) {
      const [
        uid,
        typeId,
        x,
        z,
        ry,
        hp,
        dead,
        deadTimer,
        spawnTimer,
        isMoving,
        animState,
        attackAnimProgress,
        hitTimer,
        summonerName,
        lastStrikeSpecial,
      ] = row;
      const cfg = UNIT_CONFIGS[typeId];
      if (!cfg) continue;

      seen.add(uid);
      let unit = existingByUid.get(uid);
      if (!unit) {
        const pool = this.unitPools[typeId] || (this.unitPools[typeId] = []);
        unit = pool.pop();
        if (!unit) {
          // Stagger procedural mesh creation on HP Mirror to prevent frame freeze when 30+ units spawn at once
          if (newBuildsThisTick >= 4) {
            if (!dead) {
              if (cfg.faction === 'K') countK++;
              else countM++;
            }
            continue;
          }
          newBuildsThisTick++;
          const rig = buildProceduralCharacter(cfg);
          this.scene.add(rig.root);
          unit = {
            uid,
            typeId,
            cfg,
            team: cfg.faction,
            hp,
            maxHp: cfg.maxHp,
            x,
            y: 0,
            z,
            vx: x,
            vz: z,
            ry,
            animState,
            prevAnimState: 'IDLE',
            stateTime: 0,
            blendWeight: 1,
            animPhase: Math.random() * 6.28,
            attackCooldown: 0,
            abilityCooldown: 0,
            attackAnimProgress,
            lastStrikeSpecial: false,
            chargeTimer: 0,
            hitTimer,
            heavyStaggerTimer: 0,
            stunTimer: 0,
            spawnTimer,
            stepDustTimer: 0,
            dead: Boolean(dead),
            deadTimer,
            rebirthUsed: false,
            target: null,
            retargetTimer: 0,
            isMoving: Boolean(isMoving),
            isAttackingCastle: false,
            rig,
          };
        } else {
          unit.uid = uid;
          unit.x = x;
          unit.z = z;
          unit.ry = ry;
        }
        unit.rig.root.visible = true;
        unit.rig.root.position.set(x, 0, z);
        unit.rig.root.scale.setScalar(cfg.modelConfig.scale);
        this.units.push(unit);
        existingByUid.set(uid, unit);
        audioManager.playSpawn(
          cfg.soundConfig.spawnPitch,
          Boolean(cfg.isBoss || cfg.isLegendary)
        );
      } else {
        if (unit.hp > hp && !unit.dead) {
          audioManager.playHit(
            cfg.soundConfig.hitPitch,
            Boolean(cfg.modelConfig.hasShield),
            cfg.tier >= 4
          );
        }
        if (!unit.dead && Boolean(dead)) {
          audioManager.playDeath(
            cfg.soundConfig.deathPitch,
            Boolean(cfg.modelConfig.isSkeleton || cfg.modelConfig.isStoneGolem)
          );
        }
      }

      unit.vx = x; // Store target x in vx for smooth frame interpolation in mirror mode
      unit.vz = z; // Store target z in vz for smooth frame interpolation in mirror mode
      unit.ry = ry;
      unit.hp = hp;
      unit.dead = Boolean(dead);
      unit.deadTimer = deadTimer;
      unit.spawnTimer = spawnTimer;
      unit.isMoving = Boolean(isMoving);
      if (unit.animState !== animState) {
        if (animState === 'ATTACK' || animState === 'SPECIAL_ABILITY') {
          audioManager.playAttack(cfg.soundConfig.attackType, cfg.soundConfig.attackPitch);
        }
        transitionUnitState(unit, animState, true);
      }
      unit.lastStrikeSpecial = Boolean(lastStrikeSpecial);
      unit.attackAnimProgress = attackAnimProgress;
      unit.hitTimer = hitTimer;
      unit.summonerName = summonerName || undefined;

      if (unit.rig.nameTagSprite) {
        if (unit.summonerName && !unit.dead) {
          unit.rig.nameTagSprite.material = getOrCreateNameTagMaterial(unit.summonerName, cfg.faction);
          unit.rig.nameTagSprite.visible = true;
        } else {
          unit.rig.nameTagSprite.visible = false;
        }
      }

      if (!unit.dead) {
        if (unit.team === 'K') countK++;
        else countM++;
      }
    }

    this.activeCount.K = countK;
    this.activeCount.M = countM;

    for (let i = this.units.length - 1; i >= 0; i--) {
      if (!seen.has(this.units[i].uid)) {
        const u = this.units[i];
        u.rig.root.visible = false;
        this.unitPools[u.typeId].push(u);
        this.units.splice(i, 1);
      }
    }


  }
}
