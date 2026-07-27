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

  it("finds the largest fitting size using rendered quarter-pixel candidates", () => {
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

  it("returns the minimum when it is the only fitting candidate", () => {
    expect(
      optimizer.findLargest({
        min: 10,
        max: 11,
        fits: (size) => size === 10,
      }),
    ).toBe(10);
  });

  it("returns the minimum for an invalid range without measuring", () => {
    const fits = vi.fn(() => true);

    expect(optimizer.findLargest({ min: 12, max: 12, fits })).toBe(12);
    expect(fits).not.toHaveBeenCalled();
  });

  it("checks larger candidates even when wrapped layout is non-monotonic", () => {
    const result = optimizer.findLargest({
      min: 8,
      max: 24,
      fits: (size) => size <= 12.25 || (size >= 18.5 && size <= 18.75),
    });

    expect(result).toBe(18.75);
  });

  it("honors a custom candidate step", () => {
    const fits = vi.fn((size: number) => size <= 31);

    const result = optimizer.findLargest({
      min: 10,
      max: 50,
      step: 2,
      fits,
    });

    expect(result).toBe(30);
    expect(fits).toHaveBeenCalledWith(32);
    expect(fits).toHaveBeenCalledWith(30);
  });

  it("uses a safe increment when given an invalid step", () => {
    expect(
      optimizer.findLargest({
        min: 10,
        max: 10.02,
        step: 0,
        fits: () => true,
      }),
    ).toBe(10.02);
  });
});
