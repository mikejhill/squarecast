export interface FontFitOptions {
  min: number;
  max: number;
  step?: number;
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
    step = 0.25,
    fits,
  }: FontFitOptions): number {
    if (max <= min || !fits(min)) return min;

    const increment = Math.max(0.01, step);
    const candidateCount = Math.ceil((max - min) / increment);
    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = Math.max(min, max - index * increment);
      const renderedSize = Math.round(candidate * 1000) / 1000;
      if (fits(renderedSize)) return renderedSize;
    }

    return min;
  }
}
