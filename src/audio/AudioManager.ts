import type { BattlePhase } from '../types/game';

export type AudioCategory =
  | 'bgm'
  | 'combat'
  | 'character'
  | 'magic'
  | 'boss'
  | 'gift'
  | 'ambience'
  | 'ui';

class AudioManager {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private masterVolume = 0.9;
  private categoryVolumes: Record<AudioCategory, number> = {
    bgm: 0.75,
    combat: 0.85,
    character: 0.8,
    magic: 0.85,
    boss: 0.95,
    gift: 0.95,
    ambience: 0.5,
    ui: 0.75,
  };
  private activeVoices = 0;
  private readonly maxVoices = 28;
  private currentPhase: BattlePhase = 'PREPARATION';
  private musicTimer: number | null = null;
  private beatStep = 0;
  private duckMultiplier = 1.0;
  private hasPlayedUnlockChime = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const autoUnlock = () => {
        this.unlock();
      };
      window.addEventListener('pointerdown', autoUnlock, { capture: true, passive: true });
      window.addEventListener('touchstart', autoUnlock, { capture: true, passive: true });
      window.addEventListener('click', autoUnlock, { capture: true, passive: true });
      window.addEventListener('keydown', autoUnlock, { capture: true, passive: true });
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
          this.initNoiseBuffer();
        } catch {
          return;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx
        .resume()
        .then(() => {
          if (!this.hasPlayedUnlockChime) {
            this.hasPlayedUnlockChime = true;
            this.playWarHorn(146.83);
          }
        })
        .catch(() => {});
    } else if (this.ctx && this.ctx.state === 'running' && !this.hasPlayedUnlockChime) {
      this.hasPlayedUnlockChime = true;
      this.playWarHorn(146.83);
    }
    if (this.musicTimer === null) {
      this.startAdaptiveMusicLoop();
    }
  }

  private initNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.5);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setCategoryVolume(cat: AudioCategory, v: number): void {
    this.categoryVolumes[cat] = Math.max(0, Math.min(1, v));
  }

  public getCategoryVolume(cat: AudioCategory): number {
    return this.categoryVolumes[cat];
  }

  public setPhase(phase: BattlePhase): void {
    if (this.currentPhase !== phase) {
      this.currentPhase = phase;
      if (phase === 'VICTORY_KINGDOM') {
        this.playVictoryFanfare('K');
      } else if (phase === 'VICTORY_MONSTERS') {
        this.playVictoryFanfare('M');
      } else if (phase === 'FINAL_CLASH') {
        this.playWarHorn(130);
      }
    }
  }

  private lastCatTime: Partial<Record<AudioCategory, number>> = {};

  private playNoiseBurst(
    duration: number,
    filterFreq: number,
    filterType: BiquadFilterType,
    category: AudioCategory,
    baseGain: number
  ): void {
    if (this.muted || !Number.isFinite(filterFreq) || !Number.isFinite(duration)) return;
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.unlock();
    }
    if (!this.ctx || !this.noiseBuffer || this.ctx.state !== 'running') return;
    if (this.activeVoices >= this.maxVoices) return;

    const nowMs = performance.now();
    if (category === 'combat' || category === 'character') {
      if (nowMs - (this.lastCatTime[category] || 0) < 45) return;
      this.lastCatTime[category] = nowMs;
    }

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq * (0.9 + Math.random() * 0.2), now);

    const gain = this.ctx.createGain();
    const catVol = this.categoryVolumes[category] ?? 0.75;
    const finalVol = Math.min(0.6, Math.max(0.002, baseGain * catVol * this.masterVolume * 2.4));

    gain.gain.setValueAtTime(finalVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    this.activeVoices++;
    src.start(now);
    src.stop(now + duration);
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    category: AudioCategory,
    baseGain: number,
    endFreq?: number,
    pitchVariance = 0.1
  ): void {
    const safeFreq = Number.isFinite(freq) ? freq : 320;
    const safeEnd = endFreq !== undefined && Number.isFinite(endFreq) ? endFreq : undefined;
    if (this.muted || !Number.isFinite(duration)) return;
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.unlock();
    }
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (this.activeVoices >= this.maxVoices && category !== 'boss' && category !== 'gift') return;

    const nowMs = performance.now();
    if (category === 'combat' || category === 'character') {
      if (nowMs - (this.lastCatTime[category] || 0) < 40) return;
      this.lastCatTime[category] = nowMs;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const randPitch = 1 + (Math.random() - 0.5) * 2 * pitchVariance;
    const startF = Math.max(45, safeFreq * randPitch);

    osc.type = type;
    osc.frequency.setValueAtTime(startF, now);
    if (safeEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, safeEnd * randPitch), now + duration);
    }

    const catVol = this.categoryVolumes[category] ?? 0.75;
    const duck = category === 'bgm' || category === 'ambience' ? this.duckMultiplier : 1.0;
    const finalVol = Math.min(0.65, Math.max(0.002, baseGain * catVol * this.masterVolume * duck * 2.5));

    gain.gain.setValueAtTime(finalVol, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    this.activeVoices++;
    osc.start(now);
    osc.stop(now + duration);
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      osc.disconnect();
      gain.disconnect();
    };
  }

  public triggerDucking(durationMs = 1500): void {
    this.duckMultiplier = 0.35;
    window.setTimeout(() => {
      this.duckMultiplier = 1.0;
    }, durationMs);
  }

  public playSpawn(pitch = 440, isBoss = false): void {
    if (isBoss) {
      this.triggerDucking(2000);
      this.playTone(146.83, 0.9, 'sawtooth', 'boss', 0.22, 293.66, 0.03);
      this.playTone(220, 1.1, 'triangle', 'boss', 0.18, 440, 0.03);
      this.playNoiseBurst(0.45, 900, 'bandpass', 'boss', 0.12);
    } else {
      this.playTone(pitch * 0.85, 0.18, 'triangle', 'character', 0.08, pitch * 1.4, 0.12);
    }
  }

  public playAttack(type: string, pitch = 440): void {
    switch (type) {
      case 'slash':
        this.playTone(pitch, 0.09, 'triangle', 'combat', 0.075, pitch * 0.45, 0.15);
        this.playNoiseBurst(0.07, 2600, 'bandpass', 'combat', 0.065);
        break;
      case 'blunt':
        this.playTone(pitch, 0.16, 'square', 'combat', 0.09, 75, 0.12);
        this.playNoiseBurst(0.12, 550, 'lowpass', 'combat', 0.08);
        break;
      case 'bow':
        this.playTone(pitch, 0.08, 'triangle', 'combat', 0.07, pitch * 1.6, 0.1);
        this.playNoiseBurst(0.06, 3200, 'highpass', 'combat', 0.05);
        break;
      case 'magic':
        this.playTone(pitch, 0.24, 'sine', 'magic', 0.1, pitch * 1.45, 0.12);
        break;
      case 'lightning':
        this.playTone(680, 0.2, 'sawtooth', 'magic', 0.11, 160, 0.2);
        this.playNoiseBurst(0.18, 1800, 'bandpass', 'magic', 0.09);
        break;
      case 'fire':
        this.playTone(260, 0.26, 'sawtooth', 'magic', 0.1, 95, 0.18);
        this.playNoiseBurst(0.24, 750, 'lowpass', 'magic', 0.09);
        break;
      case 'roar':
        this.playTone(pitch, 0.3, 'sawtooth', 'character', 0.11, pitch * 0.55, 0.12);
        break;
      default:
        this.playTone(pitch, 0.1, 'triangle', 'combat', 0.075, pitch * 0.6, 0.14);
    }
  }

  public playHit(pitch = 250, isBlocked = false, isHeavy = false): void {
    if (isBlocked) {
      this.playTone(840, 0.09, 'triangle', 'combat', 0.09, 440, 0.12);
      this.playNoiseBurst(0.06, 3000, 'bandpass', 'combat', 0.07);
    } else if (isHeavy) {
      this.playTone(165, 0.2, 'sawtooth', 'combat', 0.11, 65, 0.12);
      this.playNoiseBurst(0.15, 600, 'lowpass', 'combat', 0.09);
    } else {
      this.playTone(pitch, 0.1, 'square', 'combat', 0.075, 95, 0.16);
    }
  }

  public playGroundSmash(): void {
    this.playTone(130, 0.35, 'sawtooth', 'combat', 0.14, 55, 0.08);
    this.playNoiseBurst(0.28, 420, 'lowpass', 'combat', 0.12);
  }

  public playDeath(pitch = 190, isStoneOrBone = false): void {
    this.playTone(pitch, 0.32, 'sawtooth', 'character', 0.085, 65, 0.14);
    if (isStoneOrBone) {
      this.playNoiseBurst(0.18, 950, 'bandpass', 'character', 0.075);
    }
  }

  public playGift(tier: 'BASIC' | 'ELITE' | 'BOSS' | 'LEGENDARY'): void {
    if (tier === 'BOSS' || tier === 'LEGENDARY') {
      this.triggerDucking(2400);
      this.playTone(440, 0.28, 'triangle', 'gift', 0.18, 554, 0.01);
      window.setTimeout(() => this.playTone(659, 0.32, 'triangle', 'gift', 0.2, 880, 0.01), 130);
      window.setTimeout(() => this.playTone(880, 0.6, 'sine', 'gift', 0.22, 1174, 0.01), 280);
    } else {
      this.playTone(587, 0.18, 'triangle', 'gift', 0.14, 784, 0.02);
      window.setTimeout(() => this.playTone(880, 0.24, 'triangle', 'gift', 0.15, 1046, 0.02), 85);
    }
  }

  public playWarHorn(baseFreq = 146.83): void {
    this.triggerDucking(1400);
    this.playTone(baseFreq, 0.95, 'sawtooth', 'boss', 0.16, baseFreq * 0.94, 0.02);
    this.playTone(baseFreq * 1.5, 0.9, 'triangle', 'boss', 0.13, baseFreq * 1.46, 0.02);
  }

  public playUiClick(): void {
    this.playTone(660, 0.05, 'sine', 'ui', 0.08, 880, 0.02);
  }

  private playVictoryFanfare(winner: 'K' | 'M'): void {
    this.triggerDucking(3500);
    const notes = winner === 'K' ? [523.25, 659.25, 783.99, 1046.5] : [220, 261.63, 311.13, 207.65];
    notes.forEach((n, idx) => {
      window.setTimeout(() => {
        this.playTone(n, 0.45, winner === 'K' ? 'triangle' : 'sawtooth', 'boss', 0.2, n, 0.01);
      }, idx * 190);
    });
  }

  private startAdaptiveMusicLoop(): void {
    // D-Minor Heroic Medieval Battle Scale (audible on both Laptop & Mobile speakers: 146Hz - 587Hz)
    const prepMelody = [293.66, 349.23, 440.0, 392.0, 349.23, 329.63, 293.66, 261.63];
    const battleMelody = [
      293.66, 293.66, 440.0, 440.0, 466.16, 440.0, 392.0, 349.23,
      329.63, 349.23, 392.0, 440.0, 349.23, 329.63, 293.66, 220.0,
    ];
    const finalMelody = [
      440.0, 523.25, 587.33, 523.25, 466.16, 440.0, 392.0, 440.0,
      587.33, 523.25, 466.16, 440.0, 392.0, 349.23, 329.63, 293.66,
    ];

    const tick = () => {
      this.beatStep = (this.beatStep + 1) % 16;
      const s = this.beatStep;
      const phase = this.currentPhase;

      let intervalMs = 420;
      if (phase === 'PREPARATION') {
        intervalMs = 520;
        // Warm medieval war drum (130Hz -> 65Hz) + snare rim
        if (s % 2 === 0) {
          this.playTone(135, 0.26, 'triangle', 'bgm', 0.14, 65, 0.02);
        }
        if (s % 4 === 2) {
          this.playNoiseBurst(0.09, 1200, 'bandpass', 'bgm', 0.045);
        }
        if (s % 2 === 0) {
          const note = prepMelody[(s / 2) % prepMelody.length];
          this.playTone(note, 0.45, 'triangle', 'bgm', 0.085, note, 0.008);
          this.playTone(note * 0.5, 0.45, 'sine', 'bgm', 0.07, note * 0.5, 0.005);
        }
      } else if (phase === 'NORMAL_BATTLE') {
        intervalMs = 340;
        // Driving war-drum beat
        if (s % 2 === 0) {
          this.playTone(146.83, 0.22, 'triangle', 'bgm', 0.15, 68, 0.02);
          this.playTone(146.83, 0.28, 'sawtooth', 'bgm', 0.06, 146.83, 0.01);
        } else {
          this.playNoiseBurst(0.06, 1800, 'bandpass', 'bgm', 0.04);
        }
        const note = battleMelody[s % battleMelody.length];
        this.playTone(note, 0.3, 'triangle', 'bgm', 0.095, note, 0.008);
        if (s % 4 === 0) {
          this.playTone(note * 0.5, 0.5, 'sawtooth', 'bgm', 0.065, note * 0.5, 0.005);
        }
      } else if (phase === 'INTENSE_BATTLE') {
        intervalMs = 280;
        this.playTone(146.83, 0.18, 'triangle', 'bgm', 0.16, 70, 0.02);
        if (s % 2 === 1) {
          this.playNoiseBurst(0.07, 2100, 'bandpass', 'bgm', 0.055);
        }
        const note = battleMelody[s % battleMelody.length];
        this.playTone(note, 0.25, 'sawtooth', 'bgm', 0.085, note, 0.01);
        this.playTone(note * 1.5, 0.22, 'triangle', 'bgm', 0.06, note * 1.5, 0.01);
      } else if (phase === 'FINAL_CLASH') {
        intervalMs = 230;
        this.playTone(164.81, 0.16, 'triangle', 'bgm', 0.18, 75, 0.02);
        this.playNoiseBurst(0.06, 2400, 'bandpass', 'bgm', 0.06);
        const lead = finalMelody[s % finalMelody.length];
        this.playTone(lead, 0.2, 'sawtooth', 'bgm', 0.1, lead, 0.01);
        this.playTone(lead * 0.5, 0.2, 'triangle', 'bgm', 0.08, lead * 0.5, 0.01);
      } else {
        intervalMs = 600;
      }

      this.musicTimer = window.setTimeout(tick, intervalMs);
    };

    this.musicTimer = window.setTimeout(tick, 250);
  }
}

export const audioManager = new AudioManager();
