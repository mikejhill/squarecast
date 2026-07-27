import { describe, expect, it, vi } from "vitest";
import { AutoFontSizePolicy, FontSizeOptimizer } from "../src/lib/font-size";

describe("AutoFontSizePolicy", () => {
  const policy = new AutoFontSizePolicy();

  it("caps large tiles at the readable Auto maximum", () => {
    expect(policy.maximumForHeight(200)).toBe(24);
  });

  it("scales down for small tiles and retains a usable lower boundary", () => {
    expect(policy.maximumForHeight(20)).toBeCloseTo(18.4);
    expect(policy.maximumForHeight(0)).toBe(1);
  });
});

describe("FontSizeOptimizer", () => {
  const optimizer = new FontSizeOptimizer();

  it("finds the largest fitting size to a quarter pixel", () => {
    const result = optimizer.findLargest({
      min: 8,
      max: 60,
      fits: (size) => size <= 27.4,
    });

    expect(result).toBe(27.25);
  });

  it("returns the minimum when even the minimum does not fit", () => {
    const fits = vi.fn(() => false);

    expect(optimizer.findLargest({ min: 9, max: 48, fits })).toBe(9);
    expect(fits).toHaveBeenCalledOnce();
  });

  it("returns the minimum for an invalid range without measuring", () => {
    const fits = vi.fn(() => true);

    expect(optimizer.findLargest({ min: 12, max: 12, fits })).toBe(12);
    expect(fits).not.toHaveBeenCalled();
  });

  it("honors a custom search tolerance", () => {
    const fits = vi.fn((size: number) => size <= 31);

    const result = optimizer.findLargest({
      min: 10,
      max: 50,
      tolerance: 2,
      fits,
    });

    expect(result).toBeGreaterThanOrEqual(30);
    expect(result).toBeLessThanOrEqual(31);
    expect(fits.mock.calls.length).toBeLessThan(8);
  });
});
