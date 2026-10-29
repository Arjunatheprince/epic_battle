import type { GiftConfig } from '../types/game';

export const GIFT_CONFIGS: GiftConfig[] = [
  {
    id: 'rose',
    name: 'Rose',
    coins: 1,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 1 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 2 }],
    tier: 'BASIC',
  },
  {
    id: 'heart_me',
    name: 'Heart Me',
    coins: 1,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 1 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 2 }],
    tier: 'BASIC',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    coins: 1,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 1 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 2 }],
    tier: 'BASIC',
  },
  {
    id: 'gg',
    name: 'GG',
    coins: 1,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 1 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 2 }],
    tier: 'BASIC',
  },
  {
    id: 'ice_cream_cone',
    name: 'Ice Cream Cone',
    coins: 1,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 1 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 2 }],
    tier: 'BASIC',
  },
  {
    id: 'finger_heart',
    name: 'Finger Heart',
    coins: 5,
    kingdomSpawns: [{ unitId: 'k_swordsman', count: 5 }],
    monsterSpawns: [{ unitId: 'm_goblin', count: 10 }],
    tier: 'BASIC',
  },
  {
    id: 'friendship_necklace',
    name: 'Friendship Necklace',
    coins: 10,
    kingdomSpawns: [{ unitId: 'k_archer', count: 5 }],
    monsterSpawns: [{ unitId: 'm_skeleton_archer', count: 10 }],
    tier: 'BASIC',
  },
  {
    id: 'perfume',
    name: 'Perfume',
    coins: 20,
    kingdomSpawns: [{ unitId: 'k_archer', count: 10 }],
    monsterSpawns: [{ unitId: 'm_skeleton_archer', count: 20 }],
    tier: 'ELITE',
  },
  {
    id: 'doughnut',
    name: 'Doughnut',
    coins: 30,
    kingdomSpawns: [{ unitId: 'k_knight', count: 1 }],
    monsterSpawns: [{ unitId: 'm_orc_warrior', count: 1 }],
    tier: 'ELITE',
  },
  {
    id: 'cap',
    name: 'Cap',
    coins: 99,
    kingdomSpawns: [{ unitId: 'k_knight', count: 3 }],
    monsterSpawns: [{ unitId: 'm_orc_warrior', count: 3 }],
    tier: 'ELITE',
  },
  {
    id: 'confetti',
    name: 'Confetti',
    coins: 100,
    kingdomSpawns: [{ unitId: 'k_stone_golem', count: 1 }],
    monsterSpawns: [{ unitId: 'm_troll', count: 1 }],
    tier: 'ELITE',
  },
  {
    id: 'sunglasses',
    name: 'Sunglasses',
    coins: 199,
    kingdomSpawns: [{ unitId: 'k_stone_golem', count: 2 }],
    monsterSpawns: [{ unitId: 'm_troll', count: 2 }],
    tier: 'ELITE',
  },
  {
    id: 'corgi',
    name: 'Corgi',
    coins: 299,
    kingdomSpawns: [{ unitId: 'k_stone_golem', count: 3 }],
    monsterSpawns: [{ unitId: 'm_troll', count: 3 }],
    tier: 'ELITE',
  },
  {
    id: 'boxing_gloves',
    name: 'Boxing Gloves',
    coins: 299,
    kingdomSpawns: [{ unitId: 'k_stone_golem', count: 3 }],
    monsterSpawns: [{ unitId: 'm_troll', count: 3 }],
    tier: 'ELITE',
  },
  {
    id: 'money_gun',
    name: 'Money Gun',
    coins: 500,
    kingdomSpawns: [],
    monsterSpawns: [],
    kingdomSpecial: 'METEOR_KINGDOM',
    monsterSpecial: 'METEOR_MONSTERS',
    tier: 'BOSS',
  },
  {
    id: 'swan',
    name: 'Swan',
    coins: 699,
    kingdomSpawns: [{ unitId: 'k_knight', count: 5 }],
    monsterSpawns: [{ unitId: 'm_orc_warrior', count: 5 }],
    kingdomSpecial: 'METEOR_KINGDOM',
    monsterSpecial: 'METEOR_MONSTERS',
    tier: 'BOSS',
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    coins: 1000,
    kingdomSpawns: [{ unitId: 'k_angel_guardian', count: 1 }],
    monsterSpawns: [{ unitId: 'm_demon_lord', count: 1 }],
    tier: 'BOSS',
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    coins: 1088,
    kingdomSpawns: [{ unitId: 'k_angel_guardian', count: 1 }],
    monsterSpawns: [{ unitId: 'm_demon_lord', count: 1 }],
    kingdomSpecial: 'FIRESTORM',
    monsterSpecial: 'HELLFIRE',
    tier: 'BOSS',
  },
  {
    id: 'whale_diving',
    name: 'Whale Diving',
    coins: 2150,
    kingdomSpawns: [{ unitId: 'k_angel_guardian', count: 2 }],
    monsterSpawns: [{ unitId: 'm_demon_lord', count: 2 }],
    tier: 'BOSS',
  },
  {
    id: 'private_jet',
    name: 'Private Jet',
    coins: 4888,
    kingdomSpawns: [{ unitId: 'k_angel_guardian', count: 4 }],
    monsterSpawns: [{ unitId: 'm_demon_lord', count: 4 }],
    tier: 'BOSS',
  },
  {
    id: 'diamond_gun',
    name: 'Diamond Gun',
    coins: 5000,
    kingdomSpawns: [{ unitId: 'k_celestial_dragon', count: 1 }],
    monsterSpawns: [{ unitId: 'm_abyssal_dragon', count: 1 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'sports_car',
    name: 'Sports Car',
    coins: 7000,
    kingdomSpawns: [{ unitId: 'k_celestial_dragon', count: 2 }],
    monsterSpawns: [{ unitId: 'm_abyssal_dragon', count: 2 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'falcon',
    name: 'Falcon',
    coins: 10999,
    kingdomSpawns: [{ unitId: 'k_ancient_titan', count: 1 }],
    monsterSpawns: [{ unitId: 'm_ancient_behemoth', count: 1 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'castle_fantasy',
    name: 'Castle Fantasy',
    coins: 20000,
    kingdomSpawns: [{ unitId: 'k_ancient_titan', count: 2 }],
    monsterSpawns: [{ unitId: 'm_ancient_behemoth', count: 2 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'phoenix',
    name: 'Phoenix',
    coins: 25999,
    kingdomSpawns: [{ unitId: 'k_legendary_phoenix', count: 1 }],
    monsterSpawns: [{ unitId: 'm_infernal_phoenix', count: 1 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'lion',
    name: 'Lion',
    coins: 29999,
    kingdomSpawns: [{ unitId: 'k_legendary_titan', count: 1 }],
    monsterSpawns: [{ unitId: 'm_legendary_demon_titan', count: 1 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'leon_and_lion',
    name: 'Leon and Lion',
    coins: 34000,
    kingdomSpawns: [
      { unitId: 'k_legendary_titan', count: 1 },
      { unitId: 'k_celestial_dragon', count: 1 },
    ],
    monsterSpawns: [
      { unitId: 'm_legendary_demon_titan', count: 1 },
      { unitId: 'm_abyssal_dragon', count: 1 },
    ],
    tier: 'LEGENDARY',
  },
  {
    id: 'thunder_falcon',
    name: 'Thunder Falcon',
    coins: 39999,
    kingdomSpawns: [{ unitId: 'k_thunder_god', count: 1 }],
    monsterSpawns: [{ unitId: 'm_storm_demon', count: 1 }],
    tier: 'LEGENDARY',
  },
  {
    id: 'tiktok_universe',
    name: 'TikTok Universe',
    coins: 44999,
    kingdomSpawns: [{ unitId: 'k_celestial_emperor', count: 1 }],
    monsterSpawns: [{ unitId: 'm_abyssal_emperor', count: 1 }],
    tier: 'LEGENDARY',
  },
];

export const GIFT_BY_ID: Record<string, GiftConfig> = Object.fromEntries(
  GIFT_CONFIGS.map((g) => [g.id, g])
);

// Mapping of numerical TikTok LIVE Gift IDs to internal Gift IDs
export const TIKTOK_NUMERICAL_GIFT_MAP: Record<number, string> = {
  5655: 'rose',
  7934: 'heart_me',
  5269: 'tiktok',
  6064: 'gg',
  5827: 'ice_cream_cone',
  5487: 'finger_heart',
  6097: 'friendship_necklace',
  5658: 'perfume',
  5879: 'doughnut',
  6104: 'cap',
  5585: 'confetti',
  5502: 'sunglasses',
  6271: 'corgi',
  6050: 'boxing_gloves',
  5660: 'money_gun',
  5657: 'swan',
  5659: 'galaxy',
  5576: 'fireworks',
  6593: 'whale_diving',
  5566: 'private_jet',
  7121: 'diamond_gun',
  5584: 'sports_car',
  6148: 'falcon',
  6820: 'castle_fantasy',
  6267: 'phoenix',
  5509: 'lion',
  6910: 'leon_and_lion',
  7890: 'thunder_falcon',
  9111: 'tiktok_universe',
};

/**
 * Resolves a TikTok LIVE gift event using numerical giftId, string slug/name, or coin/diamond metadata fallback.
 */
export function resolveGiftConfig(
  giftIdOrName?: string | number,
  diamondCount?: number
): GiftConfig | undefined {
  if (typeof giftIdOrName === 'number') {
    const mapped = TIKTOK_NUMERICAL_GIFT_MAP[giftIdOrName];
    if (mapped && GIFT_BY_ID[mapped]) return GIFT_BY_ID[mapped];
  }

  if (typeof giftIdOrName === 'string') {
    const trimmed = giftIdOrName.trim();
    const asNum = Number(trimmed);
    if (!Number.isNaN(asNum) && TIKTOK_NUMERICAL_GIFT_MAP[asNum]) {
      return GIFT_BY_ID[TIKTOK_NUMERICAL_GIFT_MAP[asNum]];
    }
    const slug = trimmed.toLowerCase().replace(/\s+/g, '_');
    if (GIFT_BY_ID[slug]) return GIFT_BY_ID[slug];

    const byName = GIFT_CONFIGS.find((g) => g.name.toLowerCase() === trimmed.toLowerCase());
    if (byName) return byName;
  }

  // Fallback by diamondCount / coin value metadata if unknown gift ID arrives from TikTok
  if (typeof diamondCount === 'number' && diamondCount > 0) {
    let closest = GIFT_CONFIGS[0];
    let bestDiff = Math.abs(closest.coins - diamondCount);
    for (const cfg of GIFT_CONFIGS) {
      const diff = Math.abs(cfg.coins - diamondCount);
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = cfg;
      }
    }
    return closest;
  }

  return undefined;
}
