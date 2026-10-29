/** Retain elapsed time even when browser callbacks are delayed. */
export class FixedStepClock {
  private debt = 0;
  constructor(private readonly step = 1 / 30) {}

  advance(elapsed: number, paused: boolean, tick: (dt: number) => void): number {
    if (paused) {
      this.debt = 0;
      return 0;
    }
    this.debt += Math.max(0, elapsed);
    let steps = 0;
    // Bound work per callback without throwing away the remaining time.
    while (this.debt + 1e-9 >= this.step && steps < 120) {
      tick(this.step);
      this.debt -= this.step;
      steps++;
    }
    return steps;
  }
}
