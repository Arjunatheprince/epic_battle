import type { ActiveUnit } from '../types/game';

const GROUP_RADIUS = 14;
const GROUP_RADIUS_SQ = GROUP_RADIUS * GROUP_RADIUS;

function isFighting(unit: ActiveUnit): boolean {
  if (unit.dead || unit.spawnTimer > 0) return false;
  if (unit.isAttackingCastle) return true;
  const target = unit.target;
  // A close live target still counts between swings, avoiding a focus change on every cooldown.
  if (!target || target.dead) return false;
  const reach = unit.cfg.attackRange + unit.cfg.collisionRadius + target.cfg.collisionRadius + 2;
  return (unit.x - target.x) ** 2 + (unit.z - target.z) ** 2 <= reach * reach;
}

/** Track a local group, rather than the empty midpoint between distant armies. */
export class OverviewTracker {
  private anchorId: number | null = null;
  private rescanTimer = 0;
  private trackingBattle = false;

  update(dt: number, units: ActiveUnit[]): { x: number; z: number; radius: number } {
    const alive = units.filter((u) => !u.dead);
    if (!alive.length) {
      this.anchorId = null;
      this.rescanTimer = 0;
      return { x: 0, z: 0, radius: 18 };
    }
    const fighters = alive.filter(isFighting);
    const battle = fighters.length > 0;
    let anchor = alive.find((u) => u.uid === this.anchorId);
    this.rescanTimer -= dt;

    if (!anchor || this.rescanTimer <= 0 || battle !== this.trackingBattle) {
      const candidates = battle ? fighters : alive;
      const fightingIds = new Set(fighters.map((u) => u.uid));
      let best = candidates[0];
      let bestScore = -1;
      let currentScore = -1;
      for (const candidate of candidates) {
        let score = 0;
        for (const member of alive) {
          if ((member.x - candidate.x) ** 2 + (member.z - candidate.z) ** 2 > GROUP_RADIUS_SQ) continue;
          score += 1 + (fightingIds.has(member.uid) ? 1000 : 0);
        }
        if (candidate.uid === this.anchorId) currentScore = score;
        if (score > bestScore) { best = candidate; bestScore = score; }
      }
      // Keep a near-equal group to avoid bouncing between fronts every rescan.
      if (!anchor || battle !== this.trackingBattle || currentScore < bestScore * 0.85) anchor = best;
      this.anchorId = anchor.uid;
      this.trackingBattle = battle;
      this.rescanTimer = 0.4;
    }

    const members = alive.filter((u) => (u.x - anchor.x) ** 2 + (u.z - anchor.z) ** 2 <= GROUP_RADIUS_SQ);
    // Include a ranged attacker's opponent even when outside the group radius.
    if (battle) {
      for (const member of [...members]) {
        if (isFighting(member) && member.target && !members.includes(member.target)) members.push(member.target);
      }
    }
    let x = 0, z = 0;
    for (const member of members) { x += member.x; z += member.z; }
    x /= members.length;
    z /= members.length;
    let radius = 7;
    for (const member of members) {
      radius = Math.max(radius, Math.hypot(member.x - x, member.z - z) + 2.5 * member.cfg.modelConfig.scale);
    }
    return { x, z, radius };
  }
}
