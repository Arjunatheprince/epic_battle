import type { UnitConfig } from '../types/game';

export type StrikeStyle = 'slash' | 'bash' | 'arrow' | 'pierce' | 'cleave' | 'charge'
  | 'rune' | 'holy' | 'slam' | 'wing' | 'breath' | 'eruption' | 'phoenix'
  | 'lightning' | 'crown' | 'claw' | 'bone' | 'venom' | 'soul' | 'drain';

interface CombatSignature {
  style: StrikeStyle;
  count: number;
  spread: number;
}

/** Each unit has its own silhouette, rhythm, and faction palette. */
export const COMBAT_SIGNATURES: Record<string, CombatSignature> = {
  k_swordsman: { style: 'slash', count: 1, spread: 0.3 },
  k_shield_guard: { style: 'bash', count: 2, spread: 0.5 },
  k_archer: { style: 'arrow', count: 1, spread: 0.2 },
  k_spearman: { style: 'pierce', count: 1, spread: 0.1 },
  k_knight: { style: 'cleave', count: 2, spread: 0.8 },
  k_cavalry: { style: 'charge', count: 3, spread: 0.25 },
  k_battle_mage: { style: 'rune', count: 5, spread: 1.2 },
  k_paladin: { style: 'holy', count: 4, spread: 0.7 },
  k_stone_golem: { style: 'slam', count: 5, spread: 1.4 },
  k_angel_guardian: { style: 'wing', count: 4, spread: 1.1 },
  k_celestial_dragon: { style: 'breath', count: 3, spread: 0.5 },
  k_ancient_titan: { style: 'eruption', count: 5, spread: 1.6 },
  k_legendary_titan: { style: 'eruption', count: 8, spread: 2.2 },
  k_legendary_phoenix: { style: 'phoenix', count: 6, spread: 1.5 },
  k_thunder_god: { style: 'lightning', count: 3, spread: 1.5 },
  k_celestial_emperor: { style: 'crown', count: 6, spread: 1.8 },
  m_goblin: { style: 'claw', count: 3, spread: 0.3 },
  m_skeleton_guard: { style: 'bone', count: 3, spread: 0.6 },
  m_skeleton_archer: { style: 'arrow', count: 2, spread: 0.45 },
  m_lizard_spearman: { style: 'venom', count: 3, spread: 0.65 },
  m_orc_warrior: { style: 'cleave', count: 1, spread: 1.4 },
  m_warg_rider: { style: 'claw', count: 4, spread: 0.8 },
  m_necromancer: { style: 'soul', count: 5, spread: 1.3 },
  m_death_knight: { style: 'drain', count: 3, spread: 0.9 },
  m_troll: { style: 'slam', count: 3, spread: 1.8 },
  m_demon_lord: { style: 'wing', count: 3, spread: 1.7 },
  m_abyssal_dragon: { style: 'breath', count: 5, spread: 0.9 },
  m_ancient_behemoth: { style: 'eruption', count: 6, spread: 1.9 },
  m_legendary_demon_titan: { style: 'eruption', count: 9, spread: 2.6 },
  m_infernal_phoenix: { style: 'phoenix', count: 8, spread: 2.0 },
  m_storm_demon: { style: 'lightning', count: 5, spread: 2.1 },
  m_abyssal_emperor: { style: 'crown', count: 8, spread: 2.4 },
};

export function attackImpactProgress(cfg: UnitConfig): number {
  if (cfg.modelConfig.weapon === 'bow') return 0.68;
  return Math.min(0.7, cfg.animationConfig.attackWindupRatio + 0.12);
}

export function attackWindupSeconds(cfg: UnitConfig): number {
  return attackImpactProgress(cfg) / (cfg.attackSpeed * 2.15);
}
