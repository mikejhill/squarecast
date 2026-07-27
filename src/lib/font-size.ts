export interface FontFitOptions {
  min: number;
  max: number;
  tolerance?: number;
  fits: (size: number) => boolean;
}

export class AutoFontSizePolicy {
  public constructor(private readonly maximum = 24) {}

  public maximumForHeight(availableHeight: number): number {
    return Math.max(1, Math.min(this.maximum, availableHeight * 0.92));
  }
}

export class FontSizeOptimizer {
  public findLargest({
    min,
    max,
    tolerance = 0.125,
    fits,
  }: FontFitOptions): number {
    if (max <= min || !fits(min)) return min;

    let lower = min;
    let upper = max;
    while (upper - lower > tolerance) {
      const candidate = (lower + upper) / 2;
      if (fits(candidate)) lower = candidate;
      else upper = candidate;
    }

    return Math.floor(lower * 4) / 4;
  }
}
