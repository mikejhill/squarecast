/** Inputs for a rendered-size search; `fits` performs the actual DOM measurement. */
export interface FontFitOptions {
  min: number;
  max: number;
  step?: number;
  fits: (size: number) => boolean;
}

/**
 * Caps automatic type growth according to available tile height. The cap keeps
 * short labels visually balanced with longer cards on the same board.
 */
export class AutoFontSizePolicy {
  public constructor(private readonly maximum = 24) {}

  /** Returns the smaller of the product cap and the tile's safe line-height cap. */
  public maximumForHeight(availableHeight: number): number {
    return Math.max(1, Math.min(this.maximum, availableHeight * 0.92));
  }
}

/**
 * Searches measured font sizes from largest to smallest instead of estimating
 * text length. This delegates wrapping and glyph width decisions to the browser.
 */
export class FontSizeOptimizer {
  /** Returns the largest candidate for which the caller's rendered fit test passes. */
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
