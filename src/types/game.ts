import type * as THREE from 'three';

export type Faction = 'K' | 'M'; // K = Kingdom, M = Monsters

export type UnitTier = 1 | 2 | 3 | 4 | 5; // 1: Basic, 2: Ranged/Support, 3: Elite, 4: Heavy/Boss, 5: Legendary/Ultimate

export type AnimationState =
  | 'SPAWN'
  | 'IDLE'
  | 'WALK'
  | 'RUN'
  | 'ATTACK'
  | 'BLOCK'
  | 'CAST'
  | 'CHARGE'
  | 'FLY'
  | 'HIT'
  | 'STUN'
  | 'SPECIAL_ABILITY'
  | 'DEATH';

export type TargetPriority = 'NEAREST' | 'LOWEST_HP' | 'HIGHEST_DAMAGE' | 'RANGED_FIRST' | 'CASTLE';

export type WeaponType =
  | 'sword'
  | 'greatsword'
  | 'dagger'
  | 'spear'
  | 'lance'
  | 'bow'
  | 'staff'
  | 'mace'
  | 'hammer'
  | 'axe'
  | 'club'
  | 'fist'
  | 'claws'
  | 'breath';

export type ArchetypeRig =
  | 'swordsman'
  | 'goblin'
  | 'shield_infantry'
  | 'archer'
  | 'spearman'
  | 'heavy_knight'
  | 'orc_warrior'
  | 'cavalry'
  | 'mage'
  | 'paladin'
  | 'giant_golem'
  | 'troll'
  | 'winged_boss'
  | 'dragon'
  | 'titan'
  | 'phoenix'
  | 'emperor';

export interface UnitAnimationConfig {
  archetype: ArchetypeRig;
  walkCycleSpeed: number;
  runCycleSpeed: number;
  attackWindupRatio: number; // 0..1 of attack duration
  attackStrikeRatio: number;
  deathDuration: number;
  hoverHeight?: number;
  hasShieldBlock?: boolean;
  hasTail?: boolean;
  hasWings?: boolean;
  hasMount?: boolean;
}

export interface UnitModelConfig {
  scale: number;
  primaryColor: number;
  secondaryColor: number;
  skinColor: number;
  helmetColor?: number;
  eyeColor?: number;
  glowColor?: number;
  weapon: WeaponType;
  hasShield?: boolean;
  hasCape?: boolean;
  hasHorns?: boolean;
  hasQuiver?: boolean;
  hasTusks?: boolean;
  hasHalo?: boolean;
  isStoneGolem?: boolean;
  isSkeleton?: boolean;
  isGoblinoid?: boolean;
}

export interface UnitSoundConfig {
  spawnPitch: number;
  attackType: 'slash' | 'blunt' | 'bow' | 'magic' | 'roar' | 'lightning' | 'fire';
  attackPitch: number;
  hitPitch: number;
  deathPitch: number;
}

export interface UnitVfxConfig {
  spawnColor: number;
  slashColor: number;
  hitColor: number;
  projectileColor?: number;
  auraColor?: number;
  aoeRadius?: number;
}

export interface UnitAbilityConfig {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  type:
    | 'CLEAVE'
    | 'SHIELD_BASH'
    | 'PIERCE'
    | 'CHARGE'
    | 'AOE_MAGIC'
    | 'HEAL_AURA'
    | 'GROUND_SMASH'
    | 'HOLY_BEAM'
    | 'DRAGON_BREATH'
    | 'REBIRTH'
    | 'CHAIN_LIGHTNING'
    | 'ULTIMATE_BEAM'
    | 'SUMMON_SKELETON'
    | 'LIFESTEAL'
    | 'REGENERATION';
  value: number;
  radius?: number;
}

export interface UnitConfig {
  id: string;
  name: string;
  faction: Faction;
  tier: UnitTier;
  hp: number;
  maxHp: number;
  damage: number;
  attackSpeed: number; // attacks per second
  moveSpeed: number;
  attackRange: number;
  armor: number; // percentage damage reduction (0..0.65)
  targetPriority: TargetPriority;
  collisionRadius: number;
  spawnCost: number;
  isRanged?: boolean;
  isFlying?: boolean;
  isBoss?: boolean;
  isLegendary?: boolean;
  ability: UnitAbilityConfig;
  cooldown: number;
  animationConfig: UnitAnimationConfig;
  modelConfig: UnitModelConfig;
  soundConfig: UnitSoundConfig;
  vfxConfig: UnitVfxConfig;
}

export interface ArticulatedRigParts {
  root: THREE.Group;
  body: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  jawMesh?: THREE.Object3D;
  haloMesh?: THREE.Object3D;
  shoulderL: THREE.Group;
  armL: THREE.Group;
  forearmL: THREE.Group;
  shoulderR: THREE.Group;
  armR: THREE.Group;
  forearmR: THREE.Group;
  hipL: THREE.Group;
  thighL: THREE.Group;
  calfL: THREE.Group;
  hipR: THREE.Group;
  thighR: THREE.Group;
  calfR: THREE.Group;
  wingL?: THREE.Group;
  wingR?: THREE.Group;
  tail?: THREE.Group;
  mount?: THREE.Group;
  mountLegs?: THREE.Group[];
  weaponMesh?: THREE.Object3D;
  shieldMesh?: THREE.Object3D;
  quiverMesh?: THREE.Object3D;
  nockedArrowMesh?: THREE.Object3D;
  auraMesh?: THREE.Mesh;
  hpBarBg?: THREE.Mesh;
  hpBarFill?: THREE.Mesh;
  nameTagSprite?: THREE.Sprite;
  hitFlashMeshes: THREE.Mesh[];
  origMaterials: THREE.Material[];
}

export interface ActiveUnit {
  uid: number;
  typeId: string;
  cfg: UnitConfig;
  team: Faction;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  ry: number; // target Y rotation
  animState: AnimationState;
  prevAnimState: AnimationState;
  stateTime: number; // time spent in current state
  blendWeight: number; // 0..1 transition blend
  animPhase: number; // continuous cycle phase
  attackCooldown: number;
  abilityCooldown: number;
  attackAnimProgress: number; // 0..1 during attack
  lastStrikeSpecial: boolean;
  chargeTimer: number;
  hitTimer: number;
  heavyStaggerTimer: number;
  stunTimer: number;
  spawnTimer: number;
  stepDustTimer: number;
  dead: boolean;
  deadTimer: number;
  rebirthUsed: boolean;
  target: ActiveUnit | null;
  retargetTimer: number;
  isMoving: boolean;
  isAttackingCastle: boolean;
  summonerName?: string;
  rig: ArticulatedRigParts;
}

export type BattlePhase =
  | 'PREPARATION'
  | 'NORMAL_BATTLE'
  | 'INTENSE_BATTLE'
  | 'FINAL_CLASH'
  | 'VICTORY_KINGDOM'
  | 'VICTORY_MONSTERS';

export type CameraMode =
  | 'FREE'
  | 'OVERVIEW'
  | 'COMBAT'
  | 'BOSS'
  | 'LEGENDARY'
  | 'SIEGE'
  | 'VICTORY';

export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface GiftSpawnEntry {
  unitId: string;
  count: number;
}

export type SpecialGiftEffect = 'METEOR_KINGDOM' | 'METEOR_MONSTERS' | 'FIRESTORM' | 'HELLFIRE';

export interface GiftConfig {
  id: string;
  name: string;
  coins: number;
  tiktokGiftIds?: number[]; // Official TikTok numerical gift IDs mapped to this gift
  kingdomSpawns: GiftSpawnEntry[];
  monsterSpawns: GiftSpawnEntry[];
  kingdomSpecial?: SpecialGiftEffect;
  monsterSpecial?: SpecialGiftEffect;
  tier: 'BASIC' | 'ELITE' | 'BOSS' | 'LEGENDARY';
}

export type TikTokConnectionState =
  | 'CONNECTED'
  | 'CONNECTING'
  | 'DISCONNECTED'
  | 'DEMO_FALLBACK';

export interface TikTokEventLogItem {
  id: string;
  timestamp: number;
  type: 'COMMENT' | 'GIFT' | 'LIKE' | 'STREAK' | 'QUEUED' | 'SYSTEM';
  username: string;
  summary: string;
  team?: Faction;
}

export interface PerformanceProfileMetrics {
  stepTimeMs: number;
  animTimeMs: number;
  lodNear: number;
  lodMid: number;
  lodFar: number;
  culledCount: number;
  powerScoreK: number;
  powerScoreM: number;
  comebackBoostK: number;
  comebackBoostM: number;
}

export interface EventFeedItem {
  id: string;
  timestamp: number;
  team?: Faction;
  title: string;
  detail: string;
  isLegendary?: boolean;
  isBoss?: boolean;
}

export interface ViewerProfile {
  username: string;
  team?: Faction;
  totalCoins: number;
  giftsSent: number;
  likesSent?: number;
}

export interface BossAnnouncement {
  unitName: string;
  team: Faction;
  senderName: string;
  hp: number;
  maxHp: number;
  isLegendary: boolean;
  abilityName?: string;
}

export interface SummonCinematicBanner {
  unitName: string;
  team: Faction;
  senderName: string;
  abilityName: string;
  isLegendary: boolean;
}
