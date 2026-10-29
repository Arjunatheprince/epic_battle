import * as THREE from 'three';
import type { ActiveUnit, CameraMode, Faction } from '../types/game';
import { CASTLE_POS_X } from '../rendering/ArenaBuilder';
import { OverviewTracker } from './OverviewTracker';

function framingHalfFov(fov: number, aspect: number): number {
  const vertical = THREE.MathUtils.degToRad(fov) / 2;
  return Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
}

export function mirrorFramingScale(sourceFov: number, sourceAspect: number, targetFov: number, targetAspect: number): number {
  return Math.max(1, Math.sin(framingHalfFov(sourceFov, sourceAspect)) / Math.sin(framingHalfFov(targetFov, targetAspect)));
}

export class CameraDirector {
  private mode: CameraMode = 'OVERVIEW';
  private manualOverride = false;
  private autoDirectorEnabled = true;
  private modeTimer = 0;
  private cooldownTimer = 0;
  private shakeIntensity = 0;
  private elapsedTime = 0;
  private overviewTracker = new OverviewTracker();
  private obstacles: THREE.Object3D[] = [];
  private sightRay = new THREE.Raycaster();
  private sightDirection = new THREE.Vector3();

  public setObstacles(obstacles: THREE.Object3D[]): void {
    this.obstacles = obstacles;
    for (const obstacle of obstacles) obstacle.updateWorldMatrix(true, true);
  }

  private clearSightline(position: THREE.Vector3, focus: THREE.Vector3): void {
    if (!this.obstacles.length) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      this.sightDirection.subVectors(position, focus);
      this.sightRay.set(focus, this.sightDirection.clone().normalize());
      this.sightRay.near = 2;
      this.sightRay.far = this.sightDirection.length() - 1;
      if (!this.sightRay.intersectObjects(this.obstacles, true).length) return;
      position.y = Math.min(75, position.y + 8);
    }
  }

  private currentPos = new THREE.Vector3(0, 34, 48);
  private currentLookAt = new THREE.Vector3(0, 1.5, 0);
  private targetPos = new THREE.Vector3(0, 34, 48);
  private targetLookAt = new THREE.Vector3(0, 1.5, 0);

  // True 6-DOF Free-Fly / Spectator Camera State (Never locked to a single pivot point)
  private freePos = new THREE.Vector3(0, 31, 46);
  private freeYaw = 0; // horizontal look angle (radians, 0 = looking toward -Z)
  private freePitch = -0.56; // vertical look angle (radians, negative = looking down)

  private focusUnit: ActiveUnit | null = null;
  private victoryTeam: Faction | null = null;
  private onModeChange?: (mode: CameraMode, autoEnabled: boolean) => void;

  public setOnModeChange(cb: (mode: CameraMode, autoEnabled: boolean) => void): void {
    this.onModeChange = cb;
  }

  public setAutoDirector(enabled: boolean): void {
    this.autoDirectorEnabled = enabled;
    if (enabled) {
      this.manualOverride = false;
      if (this.mode === 'FREE') {
        this.mode = 'OVERVIEW';
      }
    } else {
      this.enterFreeMode();
    }
    this.onModeChange?.(this.mode, this.autoDirectorEnabled);
  }

  public isAutoDirector(): boolean {
    return this.autoDirectorEnabled;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public getFramingSnapshot(): { fx: number; fy: number; fz: number; mode: CameraMode } {
    return { fx: this.currentLookAt.x, fy: this.currentLookAt.y, fz: this.currentLookAt.z, mode: this.mode };
  }

  public syncFreeStateFromCurrent(): void {
    this.freePos.copy(this.currentPos);
    const dir = new THREE.Vector3().subVectors(this.currentLookAt, this.currentPos);
    if (dir.lengthSq() > 0.0001) {
      dir.normalize();
      this.freePitch = Math.max(-1.48, Math.min(1.48, Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)))));
      this.freeYaw = Math.atan2(-dir.x, -dir.z);
    }
  }

  public enterFreeMode(): void {
    if (this.mode !== 'FREE') {
      this.syncFreeStateFromCurrent();
      this.mode = 'FREE';
    }
    this.manualOverride = true;
    this.autoDirectorEnabled = false;
    this.modeTimer = 0;
    this.onModeChange?.('FREE', false);
  }

  public resetFreeCamera(): void {
    this.freePos.set(0, 31, 46);
    this.freeYaw = 0;
    this.freePitch = -0.56;
    this.enterFreeMode();
  }

  public jumpFreeCameraTo(x: number, y: number, z: number, yaw = 0, pitch = -0.52): void {
    this.freePos.set(x, y, z);
    this.freeYaw = yaw;
    this.freePitch = pitch;
    this.enterFreeMode();
  }

  public handleRotate(deltaX: number, deltaY: number): void {
    this.enterFreeMode();
    const sensitivity = 0.0045;
    this.freeYaw -= deltaX * sensitivity;
    this.freePitch = Math.max(-1.48, Math.min(1.48, this.freePitch - deltaY * sensitivity));
  }

  public handlePan(deltaX: number, deltaY: number): void {
    this.enterFreeMode();
    const panScale = Math.max(0.025, Math.abs(this.freePos.y) * 0.0022);
    const sinY = Math.sin(this.freeYaw);
    const cosY = Math.cos(this.freeYaw);

    // Right vector in XZ plane: (cosY, 0, -sinY)
    // Flat Forward vector in XZ plane: (-sinY, 0, -cosY)
    const rightX = cosY;
    const rightZ = -sinY;
    const fwdX = -sinY;
    const fwdZ = -cosY;

    this.freePos.x -= (rightX * deltaX - fwdX * deltaY) * panScale;
    this.freePos.z -= (rightZ * deltaX - fwdZ * deltaY) * panScale;

    this.clampFreePos();
  }

  public handleVerticalPan(deltaX: number, deltaY: number): void {
    this.enterFreeMode();
    const panScale = Math.max(0.025, Math.abs(this.freePos.y) * 0.002);
    const rightX = Math.cos(this.freeYaw);
    const rightZ = -Math.sin(this.freeYaw);

    this.freePos.x -= rightX * deltaX * panScale;
    this.freePos.z -= rightZ * deltaX * panScale;
    this.freePos.y += deltaY * panScale;

    this.clampFreePos();
  }

  public handleZoom(deltaY: number): void {
    this.enterFreeMode();
    // Fly directly along the 3D look ray so camera never gets stuck on a single pivot point
    const step = (deltaY < 0 ? 1 : -1) * Math.max(2.5, Math.abs(this.freePos.y) * 0.14);
    const cosP = Math.cos(this.freePitch);
    const fwdX = -Math.sin(this.freeYaw) * cosP;
    const fwdY = Math.sin(this.freePitch);
    const fwdZ = -Math.cos(this.freeYaw) * cosP;

    this.freePos.x += fwdX * step;
    this.freePos.y += fwdY * step;
    this.freePos.z += fwdZ * step;

    this.clampFreePos();
  }

  public handleKeyboardMove(dt: number, keys: Set<string>): void {
    if (keys.size === 0) return;
    const hasMoveKey =
      keys.has('KeyW') ||
      keys.has('KeyS') ||
      keys.has('KeyA') ||
      keys.has('KeyD') ||
      keys.has('ArrowUp') ||
      keys.has('ArrowDown') ||
      keys.has('ArrowLeft') ||
      keys.has('ArrowRight') ||
      keys.has('KeyQ') ||
      keys.has('KeyE') ||
      keys.has('Space') ||
      keys.has('KeyC');

    if (!hasMoveKey) return;
    this.enterFreeMode();

    const turbo = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2.5 : 1.0;
    const baseSpeed = Math.max(18, Math.abs(this.freePos.y) * 0.85) * turbo * dt;

    const sinY = Math.sin(this.freeYaw);
    const cosY = Math.cos(this.freeYaw);
    const cosP = Math.cos(this.freePitch);
    const sinP = Math.sin(this.freePitch);

    // 3D look forward vector
    const lookFwdX = -sinY * cosP;
    const lookFwdY = sinP;
    const lookFwdZ = -cosY * cosP;

    // Horizontal XZ forward & right vectors
    const flatFwdX = -sinY;
    const flatFwdZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    if (keys.has('KeyW')) {
      this.freePos.x += lookFwdX * baseSpeed;
      this.freePos.y += lookFwdY * baseSpeed;
      this.freePos.z += lookFwdZ * baseSpeed;
    }
    if (keys.has('KeyS')) {
      this.freePos.x -= lookFwdX * baseSpeed;
      this.freePos.y -= lookFwdY * baseSpeed;
      this.freePos.z -= lookFwdZ * baseSpeed;
    }
    if (keys.has('ArrowUp')) {
      this.freePos.x += flatFwdX * baseSpeed;
      this.freePos.z += flatFwdZ * baseSpeed;
    }
    if (keys.has('ArrowDown')) {
      this.freePos.x -= flatFwdX * baseSpeed;
      this.freePos.z -= flatFwdZ * baseSpeed;
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      this.freePos.x += rightX * baseSpeed;
      this.freePos.z += rightZ * baseSpeed;
    }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      this.freePos.x -= rightX * baseSpeed;
      this.freePos.z -= rightZ * baseSpeed;
    }
    if (keys.has('KeyE') || keys.has('Space')) {
      this.freePos.y += baseSpeed * 0.75;
    }
    if (keys.has('KeyQ') || keys.has('KeyC')) {
      this.freePos.y -= baseSpeed * 0.75;
    }

    this.clampFreePos();
  }

  private clampFreePos(): void {
    this.freePos.x = Math.max(-220, Math.min(220, this.freePos.x));
    this.freePos.y = Math.max(1.0, Math.min(140, this.freePos.y));
    this.freePos.z = Math.max(-180, Math.min(180, this.freePos.z));
  }

  public setManualMode(mode: CameraMode, units: ActiveUnit[]): void {
    if (mode === 'FREE') {
      this.enterFreeMode();
      return;
    }
    this.mode = mode;
    this.manualOverride = true;
    this.autoDirectorEnabled = false;
    this.modeTimer = 0;
    if (mode === 'BOSS' || mode === 'LEGENDARY') {
      const boss = units.find((u) => !u.dead && (u.cfg.isBoss || u.cfg.isLegendary));
      if (boss) this.focusUnit = boss;
    }
    this.onModeChange?.(this.mode, false);
  }

  public triggerBossOrLegendaryFocus(unit: ActiveUnit, isLegendary: boolean): void {
    // Do not hijack camera if Admin is actively in FREE cam or manual override
    if (!this.autoDirectorEnabled || this.manualOverride || this.mode === 'FREE') return;
    this.focusUnit = unit;
    this.mode = isLegendary ? 'LEGENDARY' : 'BOSS';
    this.modeTimer = isLegendary ? 5.5 : 3.6;
    this.cooldownTimer = 6.0;
  }

  public triggerVictoryFocus(winner: Faction): void {
    if (this.mode === 'FREE') return;
    this.victoryTeam = winner;
    this.mode = 'VICTORY';
    this.modeTimer = 8.5;
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, Math.min(0.38, amount));
  }

  public update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    units: ActiveUnit[],
    castleHp: { K: number; M: number },
    maxCastleHp: number
  ): void {
    this.elapsedTime += dt;
    this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.9);
    this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);

    // Handle FREE CAMERA mode directly (6-DOF Free-Fly / Spectator, no orbit lock)
    if (this.mode === 'FREE') {
      const cosPitch = Math.cos(this.freePitch);
      const sinPitch = Math.sin(this.freePitch);
      const lookDirX = -Math.sin(this.freeYaw) * cosPitch;
      const lookDirY = sinPitch;
      const lookDirZ = -Math.cos(this.freeYaw) * cosPitch;

      this.targetPos.copy(this.freePos);
      this.targetLookAt.set(
        this.freePos.x + lookDirX * 25,
        this.freePos.y + lookDirY * 25,
        this.freePos.z + lookDirZ * 25
      );

      const alpha = Math.min(1, Math.max(0.016, dt) * 18);
      this.currentPos.lerp(this.targetPos, alpha);
      this.currentLookAt.lerp(this.targetLookAt, alpha);

      const sx = (Math.random() - 0.5) * this.shakeIntensity * 0.5;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 0.5;

      camera.position.set(this.currentPos.x + sx, this.currentPos.y + sy, this.currentPos.z);
      camera.lookAt(this.currentLookAt);
      return;
    }

    // Handle timed priority camera modes
    if (this.modeTimer > 0) {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0 && !this.manualOverride) {
        this.mode = 'OVERVIEW';
        this.focusUnit = null;
      }
    } else if (this.autoDirectorEnabled && !this.manualOverride && this.cooldownTimer <= 0) {
      const kPct = castleHp.K / maxCastleHp;
      const mPct = castleHp.M / maxCastleHp;

      const fightingUnits = units.filter((u) => !u.dead && u.attackAnimProgress > 0);
      if ((kPct < 0.28 || mPct < 0.28) && units.some((u) => !u.dead && u.isAttackingCastle)) {
        this.mode = 'SIEGE';
      } else if (fightingUnits.length >= 10) {
        this.mode = 'COMBAT';
        this.modeTimer = 4.5;
        this.cooldownTimer = 10;
      } else {
        this.mode = 'OVERVIEW';
      }
    }

    const isVertical = camera.aspect < 1.0;

    switch (this.mode) {
      case 'OVERVIEW':
      case 'COMBAT': {
        const focus = this.overviewTracker.update(dt, units);
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
        const closeShot = this.mode === 'COMBAT';
        const distance = Math.max(closeShot ? 23 : 28,
          focus.radius * (closeShot ? 1.12 : 1.3) / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)));
        // A slightly diagonal raised angle preserves silhouettes and avoids looking through castles.
        if (isVertical) {
          this.targetPos.set(focus.x - distance * 0.65, 1.5 + distance * 0.68, focus.z + distance * 0.34);
        } else {
          this.targetPos.set(focus.x + distance * 0.12, 1.5 + distance * (closeShot ? 0.55 : 0.65), focus.z + distance * 0.76);
        }
        this.targetLookAt.set(focus.x, 1.5, focus.z);
        break;
      }

      case 'BOSS':
      case 'LEGENDARY': {
        if (!this.focusUnit || this.focusUnit.dead) {
          this.focusUnit = units.find((u) => !u.dead && (u.cfg.isBoss || u.cfg.isLegendary)) || null;
        }
        if (this.focusUnit) {
          const u = this.focusUnit;
          const scale = u.cfg.modelConfig.scale;
          const hover = u.cfg.animationConfig.hoverHeight ?? 0;
          const subjectY = Math.max(2, scale * (1.3 + hover));
          const radius = scale * (u.cfg.isFlying ? 3.5 : 2.5);
          const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov) / 2,
            Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect));
          const distance = Math.max(17, radius * 1.18 / Math.sin(halfFov));
          const drift = Math.sin(this.elapsedTime * 0.22) * 0.06;
          this.targetLookAt.set(u.x, subjectY, u.z);
          this.targetPos.set(u.x + distance * (0.25 + drift), subjectY + distance * 0.48, u.z + distance * 0.84);

        } else {
          this.mode = 'OVERVIEW';
        }
        break;
      }

      case 'SIEGE': {
        const siegeTargetTeam: Faction = castleHp.K <= castleHp.M ? 'K' : 'M';
        const cx = CASTLE_POS_X[siegeTargetTeam];
        const dir = siegeTargetTeam === 'K' ? 1 : -1;
        this.targetPos.set(cx + dir * (isVertical ? 34 : 22), 20, isVertical ? 14 : 26);
        this.targetLookAt.set(cx + dir * 4, 4.5, 0);
        break;
      }

      case 'VICTORY': {
        const wTeam = this.victoryTeam || 'K';
        const cx = CASTLE_POS_X[wTeam];
        const dir = wTeam === 'K' ? 1 : -1;
        const orbit = Math.sin(this.elapsedTime * 0.45) * 6;
        this.targetPos.set(cx + dir * 24, 16, 18 + orbit);
        this.targetLookAt.set(cx + dir * 4, 4.0, 0);
        break;
      }
    }

    const xLimit = this.mode === 'OVERVIEW' || this.mode === 'COMBAT' ? 160 : 95;
    this.targetPos.x = Math.max(-xLimit, Math.min(xLimit, this.targetPos.x));
    this.targetPos.y = Math.max(3, Math.min(75, this.targetPos.y));
    this.targetPos.z = Math.max(-75, Math.min(75, this.targetPos.z));

    this.clearSightline(this.targetPos, this.targetLookAt);

    const smoothSpeed = this.mode === 'LEGENDARY' || this.mode === 'BOSS' ? 2.8 : 1.8;
    const alpha = 1 - Math.exp(-Math.max(0, dt) * smoothSpeed);
    this.currentPos.lerp(this.targetPos, alpha);
    this.currentLookAt.lerp(this.targetLookAt, alpha);

    this.clearSightline(this.currentPos, this.currentLookAt);
    const sx = Math.sin(this.elapsedTime * 43) * this.shakeIntensity * 0.38;
    const sy = Math.sin(this.elapsedTime * 51 + 1.2) * this.shakeIntensity * 0.28;

    camera.position.set(
      this.currentPos.x + sx,
      this.currentPos.y + sy,
      this.currentPos.z
    );
    camera.lookAt(this.currentLookAt);
  }
}
