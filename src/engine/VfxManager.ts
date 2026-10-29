import * as THREE from 'three';
import { getBasicMat, getStandardMat } from '../rendering/ProceduralCharacterBuilder';
import type { UnitConfig } from '../types/game';
import { UNIT_CONFIGS } from '../config/units';
import { VisualEventJournal, VisualEventReceiver, type VisualArguments, type VisualBatch, type VisualEvent } from './MirrorEffects';
import { COMBAT_SIGNATURES } from '../config/combat';

interface PooledSpark {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  rotSpeed: number;
}

interface PooledRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface PooledSlashArc {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  spinSpeed: number;
}

interface PooledBeam {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface PooledMeteor {
  group: THREE.Group;
  active: boolean;
  startX: number;
  startY: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  progress: number;
  duration: number;
  color: number;
  onImpact?: () => void;
  mirrored?: boolean;
}

interface PooledLightningSegment {
  mesh: THREE.Mesh;
  life: number;
}

interface CombatLabel {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  life: number;
  maxLife: number;
}

export class VfxManager {
  private scene: THREE.Scene;
  private visualJournal = new VisualEventJournal();
  private visualReceiver = new VisualEventReceiver();
  private captureDepth = 0;
  private replaying = false;

  private capture<K extends keyof VisualArguments, A extends unknown[]>(type: K, emit: (...args: A) => void,
    encode: (...args: A) => VisualArguments[K]): (...args: A) => void {
    return (...args: A) => {
      if (this.captureDepth === 0 && !this.replaying) this.visualJournal.record(type, encode(...args));
      this.captureDepth++;
      try { emit.apply(this, args); } finally { this.captureDepth--; }
    };
  }

  public serializeVisualEvents(): VisualBatch { return this.visualJournal.snapshot(); }

  public applyVisualEvents(batch: VisualBatch): number {
    this.replaying = true;
    try { return this.visualReceiver.consume(batch, (event) => this.replayVisualEvent(event)); }
    finally { this.replaying = false; }
  }

  private replayVisualEvent(event: VisualEvent): void {
    switch (event.type) {
      case 'emitCharacterStrike': {
        const [id, ...args] = event.args;
        const cfg = UNIT_CONFIGS[id];
        if (cfg) this.emitCharacterStrike(cfg, ...args);
        break;
      }
      case 'emitDamageNumber': this.emitDamageNumber(...event.args); break;
      case 'emitBurst': this.emitBurst(...event.args); break;
      case 'emitDragonBreath': this.emitDragonBreath(...event.args); break;
      case 'emitChainLightning': this.emitChainLightning(...event.args); break;
      case 'emitMeteorStrike': this.emitMeteorStrike(...event.args); break;
      case 'emitSpawnPortal': this.emitSpawnPortal(...event.args); break;
      case 'emitHitImpact': this.emitHitImpact(...event.args); break;
      case 'emitDeathDissolve': this.emitDeathDissolve(...event.args); break;
      case 'emitHealParticles': this.emitHealParticles(...event.args); break;
      case 'emitShockwaveRing': this.emitShockwaveRing(...event.args); break;
      case 'emitSlashTrail': this.emitSlashTrail(...event.args); break;
      case 'emitSkyBeam': this.emitSkyBeam(...event.args); break;
    }
  }

  private labels: CombatLabel[] = [];
  private labelIdx = 0;
  private labelCooldown = 0;
  private effectMaterials: THREE.MeshBasicMaterial[] = [];

  private effectMaterial(): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    this.effectMaterials.push(material);
    return material;
  }

  private tint(mesh: THREE.Mesh, color: number, opacity = 1): void {
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.setHex(color);
    material.opacity = opacity;
  }

  private sparks: PooledSpark[] = [];
  private rings: PooledRing[] = [];
  private slashes: PooledSlashArc[] = [];
  private beams: PooledBeam[] = [];
  private meteors: PooledMeteor[] = [];
  private lightningSegments: PooledLightningSegment[] = [];

  private sparkIdx = 0;
  private ringIdx = 0;
  private slashIdx = 0;
  private beamIdx = 0;
  private meteorIdx = 0;
  private lightningIdx = 0;

  private sphGeo = new THREE.OctahedronGeometry(0.16, 0);
  private ringGeo = new THREE.RingGeometry(0.38, 0.64, 24);
  private slashGeo = new THREE.TorusGeometry(0.9, 0.075, 6, 18, Math.PI * 0.92);
  private beamGeo = new THREE.CylinderGeometry(0.75, 0.75, 24, 14);
  private meteorRockGeo = new THREE.DodecahedronGeometry(1.15, 0);
  private boltGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 6);

  constructor(scene: THREE.Scene, maxParticles = 220) {
    this.scene = scene;


    // Pool of Sparks / Debris / Rising Embers
    for (let i = 0; i < maxParticles; i++) {
      const mesh = new THREE.Mesh(this.sphGeo, this.effectMaterial());
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        life: 0,
        maxLife: 0.5,
        vx: 0,
        vy: 0,
        vz: 0,
        gravity: 11,
        rotSpeed: 4,
      });
    }

    // Pool of Shockwave / Spawn Portal / Dust Rings
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(this.ringGeo, this.effectMaterial());
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 0.6, startScale: 0.5, endScale: 4.0 });
    }

    // Pool of Weapon Slash Trails
    for (let i = 0; i < 44; i++) {
      const mesh = new THREE.Mesh(this.slashGeo, this.effectMaterial());
      mesh.visible = false;
      this.scene.add(mesh);
      this.slashes.push({ mesh, life: 0, maxLife: 0.22, spinSpeed: 12 });
    }

    // Pool of Vertical Pillars / Beams
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(this.beamGeo, this.effectMaterial());
      mesh.visible = false;
      this.scene.add(mesh);
      this.beams.push({ mesh, life: 0, maxLife: 0.55 });
    }

    // Pool of 3D Falling Meteors (Phase 5)
    for (let i = 0; i < 12; i++) {
      const group = new THREE.Group();
      const rock = new THREE.Mesh(
        this.meteorRockGeo,
        getStandardMat(0x292524, 0.7, 0.2, 0xf97316, 0.65)
      );
      const aura = new THREE.Mesh(this.meteorRockGeo, getBasicMat(0xf59e0b, 0.55));
      aura.scale.setScalar(1.35);
      group.add(rock);
      group.add(aura);
      group.visible = false;
      this.scene.add(group);
      this.meteors.push({
        group,
        active: false,
        startX: 0,
        startY: 32,
        startZ: 0,
        targetX: 0,
        targetZ: 0,
        progress: 0,
        duration: 0.52,
        color: 0xf59e0b,
      });
    }

    // Pool of 3D Chain Lightning Segments (Phase 6)
    for (let i = 0; i < 96; i++) {
      const mesh = new THREE.Mesh(this.boltGeo, this.effectMaterial());
      mesh.visible = false;
      this.scene.add(mesh);
      this.lightningSegments.push({ mesh, life: 0 });
    }
    this.emitCharacterStrike = this.capture('emitCharacterStrike', this.emitCharacterStrike, (cfg, ...args) => [cfg.id, ...args]);
    this.emitDamageNumber = this.capture('emitDamageNumber', this.emitDamageNumber, (...args) => args);
    this.emitBurst = this.capture('emitBurst', this.emitBurst, (...args) => args);
    this.emitDragonBreath = this.capture('emitDragonBreath', this.emitDragonBreath, (...args) => args);
    this.emitChainLightning = this.capture('emitChainLightning', this.emitChainLightning, (...args) => args);
    this.emitSpawnPortal = this.capture('emitSpawnPortal', this.emitSpawnPortal, (...args) => args);
    this.emitHitImpact = this.capture('emitHitImpact', this.emitHitImpact, (...args) => args);
    this.emitDeathDissolve = this.capture('emitDeathDissolve', this.emitDeathDissolve, (...args) => args);
    this.emitHealParticles = this.capture('emitHealParticles', this.emitHealParticles, (...args) => args);
    this.emitShockwaveRing = this.capture('emitShockwaveRing', this.emitShockwaveRing, (...args) => args);
    this.emitSlashTrail = this.capture('emitSlashTrail', this.emitSlashTrail, (...args) => args);
    this.emitSkyBeam = this.capture('emitSkyBeam', this.emitSkyBeam, (...args) => args);
    this.emitMeteorStrike = this.capture('emitMeteorStrike', this.emitMeteorStrike, (x, z, color) => [x, z, color]);
  }

  /** Short directional streak, shared by thrusts, feathers, runes and ground cracks. */
  private emitStreak(x: number, y: number, z: number, tx: number, ty: number, tz: number, color: number, width = 1): void {
    const seg = this.lightningSegments[this.lightningIdx++ % this.lightningSegments.length];
    this.tint(seg.mesh, color, 0.9);
    seg.mesh.position.set((x + tx) / 2, (y + ty) / 2, (z + tz) / 2);
    const direction = new THREE.Vector3(tx - x, ty - y, tz - z);
    seg.mesh.scale.set(width, direction.length(), width);
    seg.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    seg.life = 0.2;
    seg.mesh.visible = true;
  }

  public emitCharacterStrike(cfg: UnitConfig, x: number, y: number, z: number, ry: number, tx: number, tz: number, special: boolean): void {
    const sig = COMBAT_SIGNATURES[cfg.id];
    if (!sig) return;
    const color = cfg.vfxConfig.slashColor;
    const accent = cfg.vfxConfig.hitColor;
    const scale = cfg.modelConfig.scale * (special ? 1.3 : 1);
    const count = sig.count;
    const radius = sig.spread * scale;
    const fx = Math.sin(ry), fz = Math.cos(ry);
    const arc = (tilt: number, size = scale) => this.emitSlashTrail(x, y, z, ry, color, size, special, tilt);
    const ring = (size: number, tint = color) => this.emitShockwaveRing(tx, 0.12, tz, tint, 0.12, size, 0.35);
    const radial = (ground: boolean) => {
      for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count;
        this.emitStreak(tx, ground ? 0.12 : y, tz,
          tx + Math.cos(a) * radius, ground ? 0.14 : y + 0.7,
          tz + Math.sin(a) * radius, i % 2 ? accent : color, ground ? 0.65 : 1);
      }
    };
    switch (sig.style) {
      case 'slash': arc(-0.35); break;
      case 'cleave':
        for (let i = 0; i < count; i++) arc(i % 2 ? 0.75 : -0.75, scale * sig.spread);
        ring(radius); break;
      case 'claw':
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * 0.24 * scale;
          this.emitStreak(tx - fz * offset - fx * 0.55, y + 0.6, tz + fx * offset - fz * 0.55,
            tx - fz * offset + fx * 0.55, y - 0.45, tz + fx * offset + fz * 0.55, color, 0.65);
        }
        break;
      case 'bash':
      case 'bone':
        ring(radius + 0.6, accent);
        this.emitBurst(tx, y, tz, count * 2, sig.style === 'bone' ? 0xe7e5e4 : color, 3.5, 0.8);
        if (sig.style === 'bone') arc(0.6); break;
      case 'arrow':
        // Muzzle glint at release; the existing projectile supplies flight and impact.
        this.emitBurst(x + fx, y, z + fz, count + 1, color, 1.4, 0.45);
        break;
      case 'pierce':
      case 'charge':
      case 'venom':
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * sig.spread;
          this.emitStreak(x - fz * offset, y, z + fx * offset,
            tx + fx * 0.6 - fz * offset, y, tz + fz * 0.6 + fx * offset, color, 0.65);
        }
        if (sig.style === 'venom') this.emitBurst(tx, y, tz, 5, 0x84cc16, 2.4, 0.65, -2);
        if (sig.style === 'charge') this.emitShockwaveRing(x, 0.1, z, accent, 0.2, scale * 1.5, 0.3);
        break;
      case 'rune':
      case 'soul':
        for (let i = 0; i < count; i++) {
          const a = i * Math.PI * 2 / count;
          const b = (i + 2) * Math.PI * 2 / count;
          this.emitStreak(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius,
            x + Math.cos(b) * radius, y, z + Math.sin(b) * radius, color, 0.5);
        }
        if (sig.style === 'soul') this.emitHealParticles(x, z, 0x4ade80, radius);
        break;
      case 'holy':
        this.emitStreak(tx - radius, y, tz, tx + radius, y, tz, accent);
        this.emitStreak(tx, 0.2, tz, tx, y + radius, tz, color);
        ring(radius); break;
      case 'drain':
        arc(0.7); ring(radius);
        this.emitStreak(tx, y, tz, x, y + 0.5, z, color);
        this.emitBurst(x, y, z, count, 0xd946ef, 1.8, 0.7, -3); break;
      case 'slam':
      case 'eruption':
        radial(true); ring(radius);
        this.emitBurst(tx, 0.2, tz, count * 2, accent, 4.5, scale * 0.7);
        if (sig.style === 'eruption') {
          for (let i = 0; i < Math.min(count, 5); i++) {
            const a = i * Math.PI * 2 / count;
            this.emitStreak(tx + Math.cos(a) * radius * 0.6, 0.1, tz + Math.sin(a) * radius * 0.6,
              tx + Math.cos(a) * radius * 0.6, y + 1, tz + Math.sin(a) * radius * 0.6, color, 1.4);
          }
        }
        break;
      case 'wing':
        arc(-0.65); arc(0.65);
        radial(false); break;
      case 'breath':
        this.emitDragonBreath(x, y, z, ry, color, accent); break;
      case 'phoenix':
        radial(false); ring(radius);
        this.emitBurst(tx, y, tz, count, color, 4, 0.8, -4); break;
      case 'lightning':
        this.emitChainLightning([{ x, y, z }, { x: tx, y: y + radius, z: tz }, { x: tx, y: 0.3, z: tz }], color);
        ring(radius, accent); break;
      case 'crown':
        radial(true);
        for (let i = 0; i < count; i++) {
          const a = i * Math.PI * 2 / count;
          const px = tx + Math.cos(a) * radius, pz = tz + Math.sin(a) * radius;
          this.emitStreak(px, 0.15, pz, tx, y + 1, tz, color, 0.65);
        }
        ring(radius, accent); break;
    }
  }

  public emitDamageNumber(x: number, y: number, z: number, damage: number, blocked: boolean, heavy: boolean, knockout: boolean): void {
    if (typeof document === 'undefined' || (!knockout && this.labelCooldown > 0)) return;
    this.labelCooldown = heavy ? 0.07 : 0.14;
    if (this.labels.length < 24) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 96;
      const context = canvas.getContext('2d');
      if (!context) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
      sprite.visible = false;
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      this.labels.push({ sprite, canvas, context, texture, life: 0, maxLife: 0.8 });
    }
    const label = this.labels[this.labelIdx++ % this.labels.length];
    const ctx = label.context;
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = `900 ${knockout ? 48 : 58}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#100b18';
    ctx.fillStyle = knockout ? '#fbbf24' : blocked ? '#93c5fd' : heavy ? '#ffe399' : '#ffffff';
    const text = knockout ? `KO ${Math.round(damage)}` : blocked ? `BLOCK ${Math.round(damage)}` : `${Math.round(damage)}`;
    ctx.strokeText(text, 128, 48);
    ctx.fillText(text, 128, 48);
    label.texture.needsUpdate = true;
    label.sprite.position.set(x, y + 0.7, z);
    label.sprite.scale.set(heavy || knockout ? 4.0 : 3, heavy || knockout ? 1.5 : 1.12, 1);
    label.life = label.maxLife = knockout ? 1 : 0.8;
    label.sprite.material.opacity = 1;
    label.sprite.visible = true;
  }

  public emitBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    color: number,
    speed = 4.2,
    scale = 1.0,
    gravity = 11
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.sparks[this.sparkIdx++ % this.sparks.length];
      this.tint(p.mesh, color);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
      p.vx = (Math.random() - 0.5) * speed * 1.45;
      p.vy = Math.random() * speed * 0.95 + (gravity > 0 ? 1.4 : 0.6);
      p.vz = (Math.random() - 0.5) * speed * 1.45;
      p.gravity = gravity;
      p.rotSpeed = (Math.random() - 0.5) * 14;
      p.maxLife = 0.38 + Math.random() * 0.28;
      p.life = p.maxLife;
      p.mesh.visible = true;
    }
  }

  public emitDragonBreath(
    x: number,
    y: number,
    z: number,
    ry: number,
    color: number,
    secondaryColor: number
  ): void {
    const dirX = Math.sin(ry);
    const dirZ = Math.cos(ry);
    for (let i = 0; i < 18; i++) {
      const p = this.sparks[this.sparkIdx++ % this.sparks.length];
      this.tint(p.mesh, i % 2 === 0 ? color : secondaryColor);
      p.mesh.position.set(x + dirX * 1.4, y, z + dirZ * 1.4);
      p.mesh.scale.setScalar(1.3 + Math.random() * 0.8);
      const spread = 3.2;
      p.vx = dirX * (11 + Math.random() * 5) + (Math.random() - 0.5) * spread;
      p.vy = -1.5 + (Math.random() - 0.5) * 2.2;
      p.vz = dirZ * (11 + Math.random() * 5) + (Math.random() - 0.5) * spread;
      p.gravity = 1.5;
      p.rotSpeed = 12;
      p.maxLife = 0.42 + Math.random() * 0.2;
      p.life = p.maxLife;
      p.mesh.visible = true;
    }
  }

  public emitChainLightning(
    points: Array<{ x: number; y: number; z: number }>,
    color: number
  ): void {
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      // Split each link into 2 jagged sub-segments for authentic lightning zig-zag
      const midX = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * 1.2;
      const midY = (a.y + b.y) * 0.5 + 0.6 + Math.random() * 0.8;
      const midZ = (a.z + b.z) * 0.5 + (Math.random() - 0.5) * 1.2;

      const subPairs: Array<[{ x: number; y: number; z: number }, { x: number; y: number; z: number }]> = [
        [a, { x: midX, y: midY, z: midZ }],
        [{ x: midX, y: midY, z: midZ }, b],
      ];

      for (const [p1, p2] of subPairs) {
        const seg = this.lightningSegments[this.lightningIdx++ % this.lightningSegments.length];
        const v1 = new THREE.Vector3(p1.x, p1.y, p1.z);
        const v2 = new THREE.Vector3(p2.x, p2.y, p2.z);
        const diff = new THREE.Vector3().subVectors(v2, v1);
        const len = diff.length();

        this.tint(seg.mesh, color, 0.95);
        seg.mesh.position.copy(v1).addScaledVector(diff, 0.5);
        seg.mesh.scale.set(1.2, len, 1.2);
        seg.mesh.quaternion.setFromUnitVectors(up, diff.normalize());
        seg.life = 0.26;
        seg.mesh.visible = true;
      }

      this.emitBurst(b.x, b.y, b.z, 6, color, 5.0, 1.1, 6);
    }
  }

  public emitMeteorStrike(
    targetX: number,
    targetZ: number,
    color: number,
    onImpact?: () => void
  ): void {
    const m = this.meteors[this.meteorIdx++ % this.meteors.length];
    m.active = true;
    m.targetX = targetX;
    m.targetZ = targetZ;
    m.startX = targetX + (Math.random() - 0.5) * 16 - 10;
    m.startY = 32;
    m.startZ = targetZ + (Math.random() - 0.5) * 10;
    m.progress = 0;
    m.duration = 0.52;
    m.color = color;
    m.onImpact = onImpact;
    m.mirrored = this.replaying;

    // Warning ring on ground before meteor hits
    this.emitShockwaveRing(targetX, 0.1, targetZ, color, 5.5, 0.8, 0.5);

    const auraMesh = m.group.children[1] as THREE.Mesh | undefined;
    if (auraMesh) {
      auraMesh.material = getBasicMat(color, 0.65);
    }
    m.group.position.set(m.startX, m.startY, m.startZ);
    m.group.visible = true;
  }

  public emitSpawnPortal(
    x: number,
    z: number,
    color: number,
    scale = 1.0,
    isBoss = false
  ): void {
    this.emitShockwaveRing(
      x,
      0.08,
      z,
      color,
      0.3 * scale,
      (isBoss ? 5.2 : 2.1) * scale,
      isBoss ? 0.85 : 0.48
    );

    this.emitBurst(
      x,
      0.2,
      z,
      isBoss ? 22 : 6,
      color,
      isBoss ? 4.5 : 2.4,
      isBoss ? 1.35 : 0.85,
      -3.5
    );

    if (isBoss) {
      this.emitSkyBeam(x, z, color, 1.5 * scale, 0.7);
    }
  }

  public emitHitImpact(
    x: number,
    y: number,
    z: number,
    color: number,
    isBlocked = false,
    isHeavy = false
  ): void {
    this.emitBurst(
      x,
      y,
      z,
      isHeavy ? 9 : 4,
      isBlocked ? 0x93c5fd : color,
      isHeavy ? 5.8 : 4.0,
      isHeavy ? 1.15 : 0.82,
      12
    );
    if (isBlocked) {
      this.emitShockwaveRing(x, y, z, 0x93c5fd, 0.2, 1.25, 0.22);
    } else if (isHeavy) {
      this.emitShockwaveRing(x, 0.08, z, 0xa8a29e, 0.35, 2.2, 0.32);
    }
  }

  public emitDeathDissolve(
    x: number,
    z: number,
    soulColor: number,
    scale = 1.0,
    debrisColor?: number
  ): void {
    this.emitBurst(x, 0.5, z, Math.round(8 * scale), soulColor, 2.8, 0.9 * scale, -2.8);
    if (debrisColor !== undefined) {
      this.emitBurst(x, 1.1, z, Math.round(9 * scale), debrisColor, 5.5, 1.25 * scale, 14);
    }
    this.emitShockwaveRing(x, 0.06, z, soulColor, 0.3, 1.8 * scale, 0.45);
  }

  public emitHealParticles(x: number, z: number, color: number, radius = 3.0): void {
    this.emitShockwaveRing(x, 0.12, z, color, 0.5, radius, 0.6);
    for (let i = 0; i < 8; i++) {
      const rx = x + (Math.random() - 0.5) * radius * 1.2;
      const rz = z + (Math.random() - 0.5) * radius * 1.2;
      this.emitBurst(rx, 0.3, rz, 1, color, 1.5, 1.1, -3.2);
    }
  }

  public emitShockwaveRing(
    x: number,
    y: number,
    z: number,
    color: number,
    startScale = 0.6,
    endScale = 4.5,
    duration = 0.55
  ): void {
    const r = this.rings[this.ringIdx++ % this.rings.length];
    this.tint(r.mesh, color, 0.85);
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(startScale);
    r.startScale = startScale;
    r.endScale = endScale;
    r.maxLife = duration;
    r.life = duration;
    r.mesh.visible = true;
  }

  public emitSlashTrail(
    x: number,
    y: number,
    z: number,
    ry: number,
    color: number,
    scale = 1.0,
    isHeavy = false,
    tilt = 0
  ): void {
    const s = this.slashes[this.slashIdx++ % this.slashes.length];
    this.tint(s.mesh, color, 0.92);
    s.mesh.position.set(x + Math.sin(ry) * 0.72, y, z + Math.cos(ry) * 0.72);
    s.mesh.rotation.set(
      Math.PI * 0.5 + tilt,
      ry - Math.PI * 0.42,
      0
    );
    s.mesh.scale.setScalar(scale * (isHeavy ? 1.35 : 1.0));
    s.maxLife = isHeavy ? 0.28 : 0.2;
    s.life = s.maxLife;
    s.spinSpeed = isHeavy ? 15 : 12;
    s.mesh.visible = true;

    if (isHeavy) {
      const s2 = this.slashes[this.slashIdx++ % this.slashes.length];
      this.tint(s2.mesh, 0xffffff, 0.85);
      s2.mesh.position.copy(s.mesh.position);
      s2.mesh.rotation.copy(s.mesh.rotation);
      s2.mesh.scale.setScalar(scale * 0.95);
      s2.maxLife = 0.22;
      s2.life = 0.22;
      s2.spinSpeed = 16;
      s2.mesh.visible = true;
    }
  }

  public emitSkyBeam(
    x: number,
    z: number,
    color: number,
    radius = 1.6,
    duration = 0.65
  ): void {
    const b = this.beams[this.beamIdx++ % this.beams.length];
    this.tint(b.mesh, color, 0.82);
    b.mesh.position.set(x, 12, z);
    b.mesh.scale.set(radius, 1, radius);
    b.maxLife = duration;
    b.life = duration;
    b.mesh.visible = true;

    this.emitShockwaveRing(x, 0.15, z, color, 0.8, radius * 4.2, duration);
    this.emitBurst(x, 1.0, z, 16, color, 8.5, 1.45, 9);
  }

  public update(dt: number): void {
    this.labelCooldown = Math.max(0, this.labelCooldown - dt);
    for (const label of this.labels) {
      if (label.life <= 0) continue;
      label.life = Math.max(0, label.life - dt);
      label.sprite.visible = label.life > 0;
      label.sprite.position.y += dt * 1.8;
      label.sprite.material.opacity = Math.min(1, label.life / label.maxLife * 3);
    }
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life / p.maxLife * 2.5);
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rotSpeed * dt;
      p.mesh.rotation.y += p.rotSpeed * dt;
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const prog = 1 - r.life / r.maxLife;
      const sc = r.startScale + (r.endScale - r.startScale) * prog;
      r.mesh.scale.setScalar(sc);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - prog) ** 2;
    }

    for (const s of this.slashes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.rotation.z += dt * s.spinSpeed;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92 * Math.sqrt(s.life / s.maxLife);
    }

    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const prog = b.life / b.maxLife;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.82 * prog;
      b.mesh.scale.x *= 0.96 + prog * 0.04;
      b.mesh.scale.z = b.mesh.scale.x;
    }

    // Update 3D Falling Meteors (Phase 5)
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.progress += dt / m.duration;
      if (m.progress >= 1.0) {
        m.active = false;
        m.group.visible = false;
        if (!m.mirrored) {
          this.emitSkyBeam(m.targetX, m.targetZ, m.color, 2.2, 0.72);
          this.emitBurst(m.targetX, 1.0, m.targetZ, 22, m.color, 9.5, 1.6, 12);
          m.onImpact?.();
        }
      } else {
        const p = m.progress;
        const curX = m.startX + (m.targetX - m.startX) * p;
        const curY = m.startY * (1 - p);
        const curZ = m.startZ + (m.targetZ - m.startZ) * p;
        m.group.position.set(curX, curY, curZ);
        m.group.rotation.x += dt * 10;
        m.group.rotation.y += dt * 12;
        if (!m.mirrored) this.emitBurst(curX, curY, curZ, 2, m.color, 2.5, 1.2, 1);
      }
    }

    // Update 3D Chain Lightning Segments (Phase 6)
    for (const seg of this.lightningSegments) {
      if (seg.life <= 0) continue;
      seg.life -= dt;
      seg.mesh.scale.x *= Math.exp(-dt * 8);
      seg.mesh.scale.z = seg.mesh.scale.x;
      if (seg.life <= 0) {
        seg.mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    for (const material of this.effectMaterials) material.dispose();
    for (const label of this.labels) {
      label.texture.dispose();
      label.sprite.material.dispose();
      this.scene.remove(label.sprite);
    }
    this.sphGeo.dispose();
    this.ringGeo.dispose();
    this.slashGeo.dispose();
    this.beamGeo.dispose();
    this.meteorRockGeo.dispose();
    this.boltGeo.dispose();
  }
}
