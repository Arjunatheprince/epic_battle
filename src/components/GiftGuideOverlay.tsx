import React, { useEffect, useState } from 'react';
import { BookOpen, X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export interface GiftDisplayItem {
  id: string;
  icon: string;
  name: string;
  coins: number;
  kingdomReward: string;
  monsterReward: string;
  tier: 'BASIC' | 'ELITE' | 'BOSS' | 'LEGENDARY';
}

export const VISUAL_GIFT_GUIDE: GiftDisplayItem[] = [
  {
    id: 'rose',
    icon: '🌹',
    name: 'Mawar / Rose',
    coins: 1,
    kingdomReward: '⚔️ Hero x1',
    monsterReward: '👺 Goblin x2',
    tier: 'BASIC',
  },
  {
    id: 'heart_me',
    icon: '🧡',
    name: 'Heart Me / TikTok',
    coins: 1,
    kingdomReward: '⚔️ Hero x1',
    monsterReward: '👺 Goblin x2',
    tier: 'BASIC',
  },
  {
    id: 'ice_cream_cone',
    icon: '🍦',
    name: 'Ice Cream / GG',
    coins: 1,
    kingdomReward: '⚔️ Hero x1',
    monsterReward: '👺 Goblin x2',
    tier: 'BASIC',
  },
  {
    id: 'finger_heart',
    icon: '🫰',
    name: 'Finger Heart',
    coins: 5,
    kingdomReward: '⚔️ Hero x5',
    monsterReward: '👺 Goblin x10',
    tier: 'BASIC',
  },
  {
    id: 'friendship_necklace',
    icon: '📿',
    name: 'Necklace',
    coins: 10,
    kingdomReward: '🏹 Archer x5',
    monsterReward: '💀 Skel.Archer x10',
    tier: 'BASIC',
  },
  {
    id: 'perfume',
    icon: '🧴',
    name: 'Perfume',
    coins: 20,
    kingdomReward: '🏹 Archer x10',
    monsterReward: '💀 Skel.Archer x20',
    tier: 'ELITE',
  },
  {
    id: 'doughnut',
    icon: '🍩',
    name: 'Donat / Doughnut',
    coins: 30,
    kingdomReward: '🛡️ Knight x1',
    monsterReward: '🪓 Orc Warrior x1',
    tier: 'ELITE',
  },
  {
    id: 'cap',
    icon: '🧢',
    name: 'Topi / Cap',
    coins: 99,
    kingdomReward: '🛡️ Knight x3',
    monsterReward: '🪓 Orc Warrior x3',
    tier: 'ELITE',
  },
  {
    id: 'confetti',
    icon: '🎉',
    name: 'Confetti',
    coins: 100,
    kingdomReward: '🪨 Stone Golem x1',
    monsterReward: '🧌 Giant Troll x1',
    tier: 'ELITE',
  },
  {
    id: 'sunglasses',
    icon: '🕶️',
    name: 'Sunglasses',
    coins: 199,
    kingdomReward: '🪨 Stone Golem x2',
    monsterReward: '🧌 Giant Troll x2',
    tier: 'ELITE',
  },
  {
    id: 'corgi',
    icon: '🐶',
    name: 'Corgi / Gloves',
    coins: 299,
    kingdomReward: '🪨 Stone Golem x3',
    monsterReward: '🧌 Giant Troll x3',
    tier: 'ELITE',
  },
  {
    id: 'money_gun',
    icon: '💵',
    name: 'Money Gun',
    coins: 500,
    kingdomReward: '☄️ Hujan Meteor K',
    monsterReward: '☄️ Hujan Meteor M',
    tier: 'BOSS',
  },
  {
    id: 'swan',
    icon: '🦢',
    name: 'Swan',
    coins: 699,
    kingdomReward: '🛡️ Knight x5 + Meteor',
    monsterReward: '🪓 Orc x5 + Meteor',
    tier: 'BOSS',
  },
  {
    id: 'galaxy',
    icon: '🌌',
    name: 'Galaxy / Fireworks',
    coins: 1000,
    kingdomReward: '👼 Angel Boss x1',
    monsterReward: '😈 Demon Lord x1',
    tier: 'BOSS',
  },
  {
    id: 'whale_diving',
    icon: '🐋',
    name: 'Whale Diving',
    coins: 2150,
    kingdomReward: '👼 Angel Boss x2',
    monsterReward: '😈 Demon Lord x2',
    tier: 'BOSS',
  },
  {
    id: 'private_jet',
    icon: '✈️',
    name: 'Private Jet',
    coins: 4888,
    kingdomReward: '👼 Angel Boss x4',
    monsterReward: '😈 Demon Lord x4',
    tier: 'BOSS',
  },
  {
    id: 'diamond_gun',
    icon: '💎',
    name: 'Diamond Gun / Car',
    coins: 5000,
    kingdomReward: '🐉 Celestial Dragon',
    monsterReward: '🐉 Abyssal Dragon',
    tier: 'LEGENDARY',
  },
  {
    id: 'falcon',
    icon: '🦅',
    name: 'Falcon / Castle',
    coins: 10999,
    kingdomReward: '🗿 Ancient Titan',
    monsterReward: '👹 Ancient Behemoth',
    tier: 'LEGENDARY',
  },
  {
    id: 'phoenix',
    icon: '🔥',
    name: 'Phoenix',
    coins: 25999,
    kingdomReward: '🦅 Legendary Phoenix',
    monsterReward: '🦇 Infernal Phoenix',
    tier: 'LEGENDARY',
  },
  {
    id: 'lion',
    icon: '🦁',
    name: 'Lion / Thunder',
    coins: 29999,
    kingdomReward: '⚡ Legendary Titan',
    monsterReward: '⚡ Demon Titan',
    tier: 'LEGENDARY',
  },
  {
    id: 'tiktok_universe',
    icon: '🪐',
    name: 'TikTok Universe',
    coins: 44999,
    kingdomReward: '👑 Celestial Emperor',
    monsterReward: '👑 Abyssal Emperor',
    tier: 'LEGENDARY',
  },
];

// Compact 3-page groups for the expandable live HUD strip
const STRIP_PAGES: { title: string; items: GiftDisplayItem[] }[] = [
  {
    title: 'GIFT DASAR & ELITE (1–100 Koin)',
    items: [
      VISUAL_GIFT_GUIDE[0], // Rose = Hero x1
      VISUAL_GIFT_GUIDE[3], // Finger Heart = Hero x5
      VISUAL_GIFT_GUIDE[4], // Necklace = Archer x5
      VISUAL_GIFT_GUIDE[5], // Perfume = Archer x10
      VISUAL_GIFT_GUIDE[6], // Doughnut = Knight x1
      VISUAL_GIFT_GUIDE[7], // Cap = Knight x3
    ],
  },
  {
    title: 'GIFT RAKSASA & BOSS (100–2.150 Koin)',
    items: [
      VISUAL_GIFT_GUIDE[8],  // Confetti = Golem x1
      VISUAL_GIFT_GUIDE[9],  // Sunglasses = Golem x2
      VISUAL_GIFT_GUIDE[10], // Corgi = Golem x3
      VISUAL_GIFT_GUIDE[11], // Money Gun = Meteor
      VISUAL_GIFT_GUIDE[13], // Galaxy = Angel/Demon Boss
      VISUAL_GIFT_GUIDE[14], // Whale = 2x Boss
    ],
  },
  {
    title: 'GIFT SULTAN LEGENDARY (5.000+ Koin)',
    items: [
      VISUAL_GIFT_GUIDE[15], // Private Jet
      VISUAL_GIFT_GUIDE[16], // Diamond Gun = Dragon
      VISUAL_GIFT_GUIDE[17], // Falcon = Ancient Titan
      VISUAL_GIFT_GUIDE[18], // Phoenix
      VISUAL_GIFT_GUIDE[19], // Lion = Legendary Titan
      VISUAL_GIFT_GUIDE[20], // Universe = Emperor
    ],
  },
];

interface GiftGuideOverlayProps {
  guideOpen: boolean;
  onToggleGuide: (nextOpen?: boolean) => void;
}

export const GiftGuideOverlay: React.FC<GiftGuideOverlayProps> = ({
  guideOpen,
  onToggleGuide,
}) => {
  const [stripPage, setStripPage] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!guideOpen) setDetailsOpen(false);
  }, [guideOpen]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'BASIC' | 'BOSS'>('ALL');

  // Auto-cycle the compact on-screen gift strip every 6 seconds so LIVE viewers see all gifts
  useEffect(() => {
    if (!guideOpen) return;
    const timer = window.setInterval(() => {
      setStripPage((p) => (p + 1) % STRIP_PAGES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [guideOpen]);

  const currentStrip = STRIP_PAGES[stripPage];

  const filteredModalItems =
    activeTab === 'ALL'
      ? VISUAL_GIFT_GUIDE
      : activeTab === 'BASIC'
      ? VISUAL_GIFT_GUIDE.filter((g) => g.tier === 'BASIC' || g.tier === 'ELITE')
      : VISUAL_GIFT_GUIDE.filter((g) => g.tier === 'BOSS' || g.tier === 'LEGENDARY');

  return (
    <>
      {/* Toggle is always available; cards are hidden until opened. */}
      <div className="pointer-events-auto w-full bg-[#100c1ae8] border border-[#d9b25f66] rounded-lg px-2.5 py-1.5 shadow-xl backdrop-blur-xs">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={guideOpen}
            aria-controls="live-gift-list"
            onClick={(e) => { e.stopPropagation(); onToggleGuide(!guideOpen); }}
            className="flex flex-1 items-center gap-1.5 text-left py-1 text-[10px] font-cinzel font-extrabold text-[#f6d88c] cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Daftar Gift</span>
            {guideOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {guideOpen && <span className="hidden sm:inline">: {currentStrip.title}</span>}
          </button>
          {guideOpen && <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setStripPage((p) => (p + 1) % STRIP_PAGES.length);
              }}
              className="px-1.5 py-0.5 rounded bg-[#231b38] hover:bg-[#31264f] border border-[#d9b25f55] text-[9px] text-[#e5d5b5] font-bold cursor-pointer"
            >
              Hal {stripPage + 1}/{STRIP_PAGES.length} ▸
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen(true);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold text-[10px] shadow cursor-pointer"
            >
              <BookOpen className="w-3 h-3" />
              Panduan Gift
            </button>
          </div>}
        </div>

        {/* 6 Visual Gift Cards Grid */}
        {guideOpen && <div id="live-gift-list" className="mt-1 grid grid-cols-3 sm:grid-cols-6 gap-1">
          {currentStrip.items.map((g) => (
            <div
              key={g.id}
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen(true);
              }}
              className={`flex items-center gap-1.5 rounded px-1.5 py-1 border cursor-pointer transition ${
                g.tier === 'LEGENDARY'
                  ? 'bg-gradient-to-r from-amber-950/90 to-purple-950/90 border-amber-400/70'
                  : g.tier === 'BOSS'
                  ? 'bg-gradient-to-r from-red-950/80 to-[#1a1329] border-red-400/60'
                  : 'bg-[#191326] border-[#d9b25f44] hover:border-[#d9b25f]'
              }`}
            >
              <div className="text-lg leading-none shrink-0 drop-shadow">{g.icon}</div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold text-[#f6d88c] truncate">{g.name.split(' / ')[0]}</span>
                  <span className="text-[9px] font-mono font-extrabold text-amber-300 bg-black/50 px-1 rounded">
                    {g.coins}c
                  </span>
                </div>
                <div className="text-[9px] text-blue-300 truncate">{g.kingdomReward}</div>
                <div className="text-[9px] text-red-300 truncate">{g.monsterReward}</div>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* FULL INTERACTIVE GIFT GUIDE MODAL (Opens via button OR when viewer comments "GIFT" / "PANDUAN") */}
      {guideOpen && detailsOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setDetailsOpen(false);
          }}
          className="pointer-events-auto fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[85vh] bg-[#140f21] border-2 border-[#d9b25f] rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#1d1530] border-b border-[#d9b25f55]">
              <div>
                <h3 className="font-cinzel font-extrabold text-sm sm:text-base text-[#f6d88c] flex items-center gap-2">
                  <span>📖 PANDUAN GIFT & PASUKAN LIVE</span>
                </h3>
                <p className="text-[11px] text-[#cfc3ae]">
                  Ketik <strong className="text-blue-400">KINGDOM</strong> atau{' '}
                  <strong className="text-red-400">MONSTER</strong> di komentar untuk pilih tim, atau ketik{' '}
                  <strong className="text-amber-300">GIFT</strong> untuk buka panduan ini!
                </p>
              </div>
              <button
                onClick={() => setDetailsOpen(false)}
                className="p-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/50 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-[#0e0a17] border-b border-[#d9b25f33]">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeTab === 'ALL'
                    ? 'bg-[#d9b25f] text-black'
                    : 'bg-[#1b1429] text-[#e5d5b5] border border-[#d9b25f44]'
                }`}
              >
                Semua Gift (21)
              </button>
              <button
                onClick={() => setActiveTab('BASIC')}
                className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeTab === 'BASIC'
                    ? 'bg-emerald-500 text-black'
                    : 'bg-[#1b1429] text-emerald-300 border border-emerald-500/40'
                }`}
              >
                ⚔️ Basic & Elite (1–299c)
              </button>
              <button
                onClick={() => setActiveTab('BOSS')}
                className={`py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeTab === 'BOSS'
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#1b1429] text-amber-300 border border-amber-500/40'
                }`}
              >
                👑 Boss & Sultan (500c+)
              </button>
            </div>

            {/* Scrollable Gift Table */}
            <div className="p-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredModalItems.map((g) => (
                <div
                  key={g.id}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border ${
                    g.tier === 'LEGENDARY'
                      ? 'bg-gradient-to-r from-amber-950/70 to-purple-950/70 border-amber-400'
                      : g.tier === 'BOSS'
                      ? 'bg-gradient-to-r from-red-950/60 to-[#1c142b] border-red-400/70'
                      : 'bg-[#1b152a] border-[#d9b25f44]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-black/50 border border-[#d9b25f44] flex items-center justify-center text-2xl shrink-0">
                    {g.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#f6d88c] truncate">{g.name}</span>
                      <span className="text-[10px] font-mono font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.5 rounded">
                        🪙 {g.coins.toLocaleString('id-ID')} Koin
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] gap-2">
                      <span className="text-blue-300 font-semibold truncate">🛡️ {g.kingdomReward}</span>
                      <span className="text-red-300 font-semibold truncate">💀 {g.monsterReward}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 bg-[#1d1530] border-t border-[#d9b25f44] flex items-center justify-between text-[11px] text-[#d8ccb8]">
              <span>❤️ Tap-tap Layar (Like) = +Pasukan Bantuan Gratis!</span>
              <button
                onClick={() => setDetailsOpen(false)}
                className="px-3 py-1 rounded-lg bg-[#d9b25f] text-black font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
