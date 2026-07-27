import {
  AutoFontSizePolicy,
  FontSizeOptimizer,
} from "../lib/font-size";

/**
 * Measures actual browser layout to fit each tile independently. Range bounds
 * catch partial-glyph overflow that scroll dimensions can round away.
 */
export class RenderedTextFitter {
  public constructor(
    private readonly element: HTMLSpanElement,
    private readonly container: HTMLElement,
    private readonly optimizer: FontSizeOptimizer,
    private readonly policy: AutoFontSizePolicy,
  ) {}

  /** Measures the tile and applies the largest verified font size. */
  public fit(): void {
    const availableWidth = this.container.clientWidth;
    const availableHeight = this.container.clientHeight;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const maximum = this.policy.maximumForHeight(availableHeight);
    const fitted = this.optimizer.findLargest({
      min: 1,
      max: maximum,
      fits: (size) => this.fitsAt(size, availableWidth, availableHeight),
    });
    this.element.style.fontSize = `${fitted}px`;
  }

  /** Tests one candidate against both layout boxes and rendered glyph bounds. */
  private fitsAt(
    size: number,
    availableWidth: number,
    availableHeight: number,
  ): boolean {
    this.element.style.fontSize = `${size}px`;

    const range = document.createRange();
    range.selectNodeContents(this.element);
    const rendered = range.getBoundingClientRect();
    const safeWidth = Math.max(1, availableWidth - 1);
    const safeHeight = Math.max(1, availableHeight - 1);

    return (
      this.element.scrollWidth <= availableWidth &&
      this.element.scrollHeight <= availableHeight &&
      rendered.width <= safeWidth &&
      rendered.height <= safeHeight
    );
  }
}
