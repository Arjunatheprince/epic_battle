# EPIC WAR LIVE 3D: Kingdom vs Monsters

Game simulasi peperangan fantasi 3D otomatis (*Stylized Semi-Realistic Cinematic Fantasy Warfare*) yang dirancang khusus untuk **TikTok LIVE** dan **OBS Studio** (format vertikal `9:16` maupun layar penuh `16:9`).


## Mulai cepat

Gunakan **Node.js 24** (lihat `.nvmrc`) dan npm. Setelah clone repository:

```bash
npm ci
npm run dev
```

Buka `http://localhost:5173/`. Perintah ini menjalankan frontend sekaligus bridge TikTok LIVE dan sinkronisasi mirror melalui plugin Vite. Tidak perlu menjalankan `npm run server` untuk alur ini. Username TikTok dapat dipilih melalui dashboard atau URL `/?tiktok=USERNAME`.

Untuk HP, gunakan alamat LAN laptop yang ditampilkan terminal, dengan `/?obs=1&slave=1` di jaringan Wi-Fi yang sama. Pengujian browser otomatis tersedia terpisah di bagian pengujian; tidak diperlukan untuk menjalankan game.

```bash
npm run typecheck
npm test
npm run build
```

Build menghasilkan aset statis di `dist/`. `npm run preview` hanya meninjau frontend hasil build; bridge SSE/TikTok dan mirror dari plugin Vite tidak disertakan. GitHub Pages saja belum menyediakan backend tersebut.

## Status repository

- Source, konfigurasi, prototype HTML, tes, dan `package-lock.json` disimpan di Git.
- `node_modules/`, `dist/`, file `.env`, kredensial lokal, dan cache diabaikan melalui `.gitignore`.
- GitHub Actions menjalankan instalasi dari lockfile, pemeriksaan TypeScript, tes, dan build pada push ke `main` serta pull request. Workflow memakai [checkout](https://github.com/actions/checkout) dan [setup-node](https://github.com/actions/setup-node) yang dipatok ke commit tertentu.
- Aplikasi ditujukan untuk penggunaan lokal/LAN. Endpoint kontrol bridge belum dilengkapi autentikasi untuk hosting publik.

Untuk menghubungkan repository lokal ke repository GitHub kosong, ganti `USERNAME/REPOSITORY` pada perintah berikut dengan tujuan milik Anda:

```bash
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```


---

## 1. Struktur Folder Proyek

```text
epic_battle/
├── Epic War Live 3D_ Kingdom vs Monsters.html  # Prototipe standalone HTML asli (dipertahankan)
├── index.html                                  # Entry HTML aplikasi Vite + React + Three.js
├── package.json                                # Dependensi & script build/dev/server
├── tsconfig.json                               # Konfigurasi TypeScript ketat
├── vite.config.ts                              # Konfigurasi bundler Vite
├── tailwind.config.js                          # Tema UI Dark Fantasy Gold
├── server/
│   └── index.ts                                # Backend Node.js + Express + Socket.IO (TikTok LIVE Bridge)
└── src/
    ├── main.tsx                                # Entry point React
    ├── App.tsx                                 # Layout utama, mode 9:16 & OBS Clean Overlay
    ├── index.css                               # Styling global & tema Dark Fantasy Gold
    ├── types/
    │   └── game.ts                             # Kontrak TypeScript (Unit, Rig, State Machine, Gift, VFX)
    ├── config/
    │   ├── units.ts                            # Data-driven config 32 unit (15 Kingdom + 15 Monsters + 2 Titan Elite)
    │   └── gifts.ts                            # Data-driven config 29 Gift TikTok LIVE (1 - 44.999 koin)
    ├── audio/
    │   └── AudioManager.ts                     # Web Audio API prosedural & musik adaptif 6 fase + audio ducking
    ├── rendering/
    │   ├── ArenaBuilder.ts                     # Arena 3D: Benteng Kingdom & Monsters, portal, jembatan, pencahayaan
    │   └── ProceduralCharacterBuilder.ts       # Pembuat rig karakter 3D berartikulasi & caching geometri/material
    ├── engine/
    │   ├── AnimationStateMachine.ts            # State machine animasi (IDLE, RUN, ATTACK, HIT, BLOCK, DEATH, SPAWN, dll.)
    │   ├── VfxManager.ts                       # Object-pooled VFX (slash trail, portal, shockwave, sky beam, sparks)
    │   ├── CameraDirector.ts                   # Sistem kamera otomatis 6 mode (OVERVIEW, COMBAT, BOSS, LEGENDARY, SIEGE, VICTORY)
    │   └── SimulationEngine.ts                 # Fixed-timestep (1/30s) battle loop, spatial hash grid, object pooling
    ├── store/
    │   └── useGameStore.ts                     # State management Zustand & pemetaan tim penonton TikTok LIVE
    └── components/
        ├── BattleViewport.tsx                  # Integrasi kanvas Three.js, loop simulasi, & auto demo streamer
        ├── HudOverlay.tsx                      # Overlay Dark Fantasy Gold (HP bar, timer, Boss HP, feed, leaderboard)
        └── AdminDashboard.tsx                  # Dashboard kontrol penuh (Spawn 32 unit, 29 Gift, Sim LIVE, Kamera, Audio)
```

---

## 2. Instalasi & Cara Menjalankan

1. **Instal dependensi:**
   ```bash
   npm ci
   ```
2. **Jalankan mode pengembangan (Frontend Vite + bridge SSE/mirror):**
   ```bash
   npm run dev
   ```
   Buka URL yang tertera (default: `http://localhost:5173`).
3. **Jalankan mode OBS Clean Overlay (Vertikal 9:16 tanpa tombol admin):**
   Buka `http://localhost:5173/?obs=1` pada **OBS Browser Source** (ukuran rekomendasi `1080 x 1920`) atau klik tombol **Mode OBS Clean Overlay** di tab **Sistem** pada Admin Panel.
4. **Jalankan pemeriksaan TypeScript & Production Build:**
   ```bash
   npm run build
   ```
5. **Backend Socket.IO lama (opsional, bukan jalur SSE/mirror utama):**
   Bridge yang dipakai aplikasi saat ini sudah berjalan melalui `npm run dev`. Script berikut dipertahankan untuk integrasi Socket.IO lama:
   ```bash
   npm run server
   ```

---

## 3. Panduan Pengujian Fitur (Phase 1 – Phase 6)

1. **Pertempuran Otomatis & Fase Ronde:**
   - Saat halaman dibuka, fase dimulai dari `PERSIAPAN` (15 detik) dengan pasukan garda depan, lalu masuk ke `PERTEMPURAN` otomatis (durasi 30 menit, auto-spawn setiap 5 detik).
2. **Pengujian Animasi Karakter & Seluruh 32 Unit (Phase 2, Phase 4, & Phase 6):**
   - Ubah **Camera Director** di tab **Sistem** ke mode `COMBAT` atau `LEGENDARY` untuk melihat detail karakter dari dekat:
     - **Swordsman (`k_swordsman`) & Shield Guard (`k_shield_guard`)**: berlari disiplin dengan tameng berornamen salib emas di depan dada, ayunan pedang horizontal dengan rotasi torso & *lunge* kaki, *Shield Bash* dengan efek *stun*, refleks angkat tameng saat terkena serangan (`BLOCK`/`HIT`), dan berlutut sebelum roboh saat `DEATH`.
     - **Goblin (`m_goblin`) & Skeleton Guard (`m_skeleton_guard`)**: Goblin membungkuk dengan lari zig-zag cepat, tusukan belati melompat bertubi-tubi, dan terpental saat `DEATH`. Skeleton Guard menahan dengan perisai tulang dan hancur berkeping-keping saat mati.
     - **Archer (`k_archer`) & Skeleton Archer (`m_skeleton_archer`)**: dilengkapi *quiver* panah di punggung dan anak panah (*nocked arrow*) yang ditarik mundur pada tali busur sebelum dilepaskan, serta perilaku *kiting* menjaga jarak.
     - **Spearman (`k_spearman`) & Lizard Spearman (`m_lizard_spearman`)**: tusukan tombak panjang; Lizard Spearman memiliki moncong reptil, duri punggung, dan gerakan berputar 360 derajat **Reptilian Tail Whip**.
     - **Knight (`k_knight`) & Orc Warrior (`m_orc_warrior`)**: Knight memiliki *visor greathelm* berjambul emas, jubah kerajaan, dan tebasan *greatsword* berat. Orc Warrior memiliki taring bawah (*tusks*), pelindung bahu berduri, dan animasi **War Cry** sebelum menebas kapak besar.
     - **Royal Cavalry (`k_cavalry`) & Warg Rider (`m_warg_rider`)**: tunggangan kuda perang / serigala raksasa dengan 4 kaki berartikulasi yang berlari (*gallop*); memiliki kemampuan **Lance Charge** & **Wolf Leap Attack** (melompat menerkam target di udara!).
     - **Battle Mage (`k_battle_mage`), Necromancer (`m_necromancer`), Paladin (`k_paladin`), & Death Knight (`m_death_knight`)**: serangan bola energi area (*Celestial Nova*), pemanggilan *Skeleton Guard* dari tanah (*Raise Skeleton*), penyembuhan area suci (*Holy Blessing*), dan tebasan penghisap darah (*Cursed Lifesteal*).
     - **Stone Golem (`k_stone_golem`), Troll (`m_troll`), Ancient Titan (`k_ancient_titan`), & Ancient Behemoth (`m_ancient_behemoth`)**: raksasa kolosal dengan debu langkah kaki, *Ground Smash* / *Lava Eruption*, dan regenerasi HP.
     - **Angel Guardian (`k_angel_guardian`), Demon Lord (`m_demon_lord`), Celestial/Abyssal Dragon, Legendary/Infernal Phoenix, Thunder God/Storm Demon, & Celestial/Abyssal Emperor**: unit terbang & Boss Legendaris dengan sayap mengepak, cincin *Halo* berputar, semburan nafas naga kerucut (*Dragon Breath*), **3D Chain Lightning** beruntun, **Phoenix Rebirth** (bangkit kembali saat HP habis), serta **Triple-Pillar Ultimate Beam**.
3. **Pengujian Cinematic Presentation (Phase 5):**
   - Kirim gift **Money Gun (500c)** atau **Swan (699c)** di tab **Gift (29)** untuk memicu **3D Falling Meteor Strike** (6 batu meteor berapi meluncur miring dari langit dan meledak menghantam barisan lawan!).
   - Kirim gift **Diamond Gun**, **Phoenix**, **Thunder Falcon**, atau **TikTok Universe** untuk melihat **Legendary Summon Intro** (sorotan kamera mengorbit unit Legendary dengan pengumuman nama unit, kemampuan, dan nama pengirim gift).
3. **Pengujian Combat VFX & Audio Mixer (Phase 3):**
   - Setiap unit yang muncul menampilkan pusaran portal tanah (*spawn portal ring*) dan partikel energi naik.
   - Serangan jarak dekat menampilkan *double-layered slash trail*, *hit flash* (kilatan material pada tubuh unit yang terkena pukulan), percikan logam (*metal sparks*), dan cincin debu.
   - Kematian unit menampilkan partikel *soul dissolve* yang melayang naik serta serpihan tulang/batu untuk Skeleton & Golem.
   - Buka tab **Sistem** pada Admin Panel untuk mengatur **Volume Mixer per Kategori** (*Master*, *Musik BGM*, *Combat SFX*, *Magic SFX*, *Boss & Gift*).
4. **Pengujian Spawn 32 Unit & 29 Gift:**
   - Buka **Admin Panel** -> tab **Unit (32)** untuk memunculkan semua 16 unit Kingdom dan 16 unit Monsters.
   - Buka tab **Gift (29)** untuk menguji hadiah dari *Rose* (1 koin) hingga *Money Gun* (Meteor Strike), *Galaxy* (Angel Guardian / Demon Lord), *Phoenix* (Rebirth), hingga *TikTok Universe* (Celestial Emperor / Abyssal Emperor).
5. **Pengujian Interaksi Komentar, Likes, Combo Streak & Antrean Gift TikTok LIVE (Phase 7):**
   - Buka tab **Sim LIVE** di Admin Panel untuk melihat status **TikTok LIVE Connector** (`BRIDGE ONLINE` saat bridge yang disertakan `npm run dev` terhubung; status room LIVE tetap bergantung pada koneksi TikTok).
   - Masukkan nama penonton baru dan klik **Gift ID #5655 (Rose)** sebelum memilih tim — gift akan masuk ke **Antrean Gift Menunggu Tim**.
   - Ketik `KINGDOM` atau `MONSTER` lalu klik **Kirim** — penonton bergabung ke tim tersebut dan seluruh gift dalam antrean langsung dicairkan menjadi pasukan dengan **Nama Pengirim Gift** melayang di atas kepala unit!
   - Klik **Combo Streak** untuk menguji perhitungan delta gift beruntun (*streak* tanpa *double-spawn*) dan **Kirim +50 Likes** untuk memicu bonus bantuan pasukan dari akumulasi *Likes* penonton.
6. **Pengujian Optimasi, 3-Tier LOD, Frustum Culling & Stress Benchmark (Phase 8):**
   - Pepohonan dan bebatuan dekorasi arena dirender menggunakan `THREE.InstancedMesh` (hanya 4 draw calls untuk seluruh dekorasi hutan & batu).
   - Buka tab **Sistem** untuk memantau **Real-Time Profiler** (`Sim Step ms`, `Anim Time ms`, distribusi `LOD Near/Mid/Far/Culled`, serta skor kekuatan & *Comeback Boost*).
   - Klik tombol **Benchmark Stress Test (+150 Pasukan Massal)** untuk menguji ratusan unit bertarung sekaligus beserta fitur **Auto-Scale Adaptive Quality**.

---

## 4. Status Fitur & Pengembangan Lanjutan

### Fitur yang Sudah Berfungsi Penuh (Phase 1 – Phase 8):
- Pertempuran otomatis 3D *fixed-timestep* (`1/30s`) dengan *spatial hash grid* dan *object pooling*.
- 32 Unit lengkap (15 Kingdom + 15 Monsters + 2 varian *Legendary Titan*) dengan statistik asimetris, *overhead HP bar*, dan *floating 3D Gifter Name Tag* (`THREE.Sprite`).
- *Animation State Machine* prosedural berartikulasi penuh (`SPAWN`, `IDLE`, `WALK`, `RUN`, `ATTACK`, `BLOCK`, `CAST`, `CHARGE`, `FLY`, `HIT`, `STUN`, `SPECIAL_ABILITY`, `DEATH`).
- Sistem VFX terpusat (*Spawn Portal*, *Double-Layered Slash Trail*, *Hit Flash*, *3D Falling Meteor*, *3D Chain Lightning*, *Dragon Breath*, *Triple-Pillar Ultimate Beam*).
- *AudioManager* Web Audio API dengan musik orkestra/ritme adaptif 6 fase, *audio ducking*, dan *per-category Volume Mixer*.
- *Camera Director* otomatis + **True 6-DOF Free-Fly Spectator Camera** untuk Admin.
- Lapisan integrasi TikTok LIVE (`TikTokLiveClient.ts` & `server/index.ts`) dengan pemetaan ID gift numerik, *streak delta tracking*, *like milestone*, *anti-duplicate*, *rate-limiting*, dan *Demo Mode fallback*.
- Optimasi `THREE.InstancedMesh`, *3-Tier Distance LOD*, *Frustum Culling*, dan *Adaptive Quality Auto-Scaler*.

### Pengembangan Opsional Berikutnya (Aset Eksternal):
- Penggantian rig prosedural dengan model 3D eksternal `.glb`/`.gltf` beranimasi *skeletal* (`THREE.AnimationMixer`) jika aset 3D kustom dari Blender telah disiapkan.
- Penggantian sintesis Web Audio API dengan sampel rekaman `.ogg`/`.mp3` orkestra penuh.



## Pembaruan: permainan di tab latar & identitas serangan

- Tick Web Worker menjaga simulasi dan sinkronisasi master ke layar HP saat tab tersembunyi. Rendering GPU dilewati selama tab tersembunyi. Waktu yang terlambat tetap masuk antrean fixed-step, bukan dibuang; tombol Jeda tetap berlaku.
- Ini berlaku saat browser masih menjalankan halaman. Komputer sleep, tab dibuang oleh Memory Saver, atau browser ditutup tetap menghentikan eksekusi. Untuk siaran, biarkan komputer menyala dan kecualikan halaman game dari Memory Saver. Lihat [perilaku tab latar browser](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- Seluruh 32 karakter mempunyai signature VFX di `src/config/combat.ts`: pola tebasan, tusukan, cakaran, rune, retakan, elemen, atau mahkota energi dengan jumlah, ukuran, dan warna masing-masing. Efek memakai pool tetap.
- Serangan terhadap unit memiliki ancang-ancang sebelum damage/proyektil dilepas; pemanah melepas pada 68% animasi. Penyerang mati atau terkena stun sebelum benturan membatalkan serangan. Serangan ke benteng tetap memakai mekanisme siege yang sudah ada.
- Mode mirror menerima kejadian VFX asli dari master beserta snapshot proyektil. Efek tidak lagi ditebak dari progres animasi.

Pengujian otomatis:

```powershell
npm test
npm run build
```

Pengujian semua serangan pada browser nyata (memerlukan `agent-browser` dan server dev aktif; pengujian mereset ronde):

```powershell
agent-browser open http://localhost:5173/
agent-browser reload
$combatScript = Get-Content tests/combat.browser.js -Raw
agent-browser eval $combatScript
```

Untuk memeriksa background: buka game, pindah ke tab kosong selama 20?30 detik, lalu kembali. Timer ronde, pertempuran, dan state `/api/sync` harus tetap maju. Tekan Jeda lalu ulangi; waktu harus tetap diam.

### Kamera Overview mengikuti aktivitas

Mode `OVERVIEW`, termasuk saat dipilih manual di tab Sistem, mengikuti kelompok pertempuran aktif. Jika tidak ada kontak tempur, kamera mengikuti kelompok pasukan hidup terpadat dalam radius 14 satuan. Unit mati diabaikan; lawan pemanah tetap disertakan dalam framing. Kamera mengikuti pusat kelompok pada kedua sumbu, menyesuaikan jarak untuk layar horizontal/vertikal, serta menahan perpindahan antara kelompok yang jumlahnya hampir seimbang agar tidak bolak-balik. Pemilihan ulang kelompok dilakukan setiap 0,4 detik; posisi kelompok diikuti setiap frame. Mode Free, Boss, Legendary, Siege, dan Victory mempertahankan kontrol yang sudah ada.

Tes kamera terdapat di `tests/overview.test.ts` dan termasuk dalam `npm test`.

### Presentasi pertempuran & kamera sinematik

- Overview dan Combat menggunakan kelompok aksi yang sama. Sorotan detail otomatis berlangsung 4,5 detik dengan jeda sebelum sorotan berikutnya; mode manual tetap tersedia.
- Kamera menaikkan posisi saat garis pandangnya terhalang benteng, pepohonan, atau bebatuan. Framing Boss/Legendary mempertimbangkan ukuran model dan posisi terbang. Getaran dibatasi dan gerakan kamera dihaluskan berdasarkan waktu.
- Mirror vertikal menyesuaikan jarak dari titik sorotan agar subjek dari kamera laptop tetap masuk layar. Free Camera mempertahankan posisi langsung dari master.
- Damage, Block, dan KO tampil sebagai angka melayang dengan maksimum 24 label; angka biasa dibatasi frekuensinya. Efek cahaya, cincin, dan tebasan memudar mandiri tanpa mengubah material karakter.
- Benturan berat memberi getaran ringan dengan cooldown, tubuh bereaksi singkat saat terkena pukulan, knockback mengikuti arah sumber serangan, dan Boss yang kalah mendapat pengumuman.
- Ini meningkatkan keterbacaan dan presentasi; dampaknya terhadap retensi penonton perlu dinilai melalui sesi LIVE nyata.

Pengumuman dibuat lebih ringkas dan diposisikan di atas area aksi. Cahaya langit lebih netral dan terang agar siluet, armor, serta warna tim lebih mudah dibaca pada layar HP.

### Perbaikan efek HP / OBS Mirror

Semua pemanggilan VFX dikirim sebagai kejadian bernomor, termasuk signature karakter, hit/block, damage/KO, portal, healing, death dissolve, petir, napas naga, sky beam, dan meteor. Sub-efek dari satu pemanggilan direkam sekali agar tidak tampil ganda. Callback meteor yang memberi damage hanya berjalan pada master.

Snapshot memuat posisi, bentuk, warna, ukuran, dan kecepatan panah/proyektil sihir. Mirror menggerakkan proyektil secara visual tanpa menjalankan damage atau simulasi pertempuran kedua. Pengumuman juga disinkronkan dari master.

Master menyimpan riwayat efek maksimal 3 detik / 4096 kejadian; hanya kejadian yang belum diakui bridge dikirim ulang. Bridge menyimpan riwayat singkat untuk pemulihan SSE/polling, sementara mirror mengabaikan ID yang sudah dimainkan. Snapshot state lama tidak memundurkan posisi unit/proyektil; efek yang belum pernah diterima masih dapat diputar.

Setelah pembaruan, refresh halaman laptop dan HP satu kali agar keduanya memakai format sinkronisasi yang sama. Efek yang sudah lebih lama dari jendela pemulihan tidak diputar ulang setelah koneksi lama terputus.

Tes tambahan di browser, dijalankan pada halaman host (bukan URL `obs`):

```powershell
agent-browser open http://localhost:5173/
agent-browser reload
agent-browser wait canvas
$mirrorScript = Get-Content tests/mirror.browser.js -Raw
agent-browser eval $mirrorScript
```

Tes ini memeriksa 64 variasi serangan tanpa snapshot animasi perantara, pencegahan duplikasi, serta visibilitas panah, sihir, dan meteor. Pengujian dua tab host/mirror melalui bridge juga dilakukan saat perbaikan.
