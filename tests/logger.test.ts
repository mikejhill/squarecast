import { describe, expect, it, vi } from "vitest";
import { RuntimeLogger } from "../src/lib/logger";

class RecordingLogSink {
  public readonly setLevel = vi.fn();
  public readonly debug = vi.fn();
  public readonly info = vi.fn();
  public readonly warn = vi.fn();
  public readonly error = vi.fn();
}

describe("runtime logger", () => {
  it("configures warn-level output without persisting the setting", () => {
    const sink = new RecordingLogSink();

    new RuntimeLogger("test", sink);

    expect(sink.setLevel).toHaveBeenCalledWith("warn", false);
  });

  it("routes every supported level with structured context", () => {
    const sink = new RecordingLogSink();
    const logger = new RuntimeLogger("test", sink);

    logger.debug("debug", { count: 1 });
    logger.info("info", { count: 2 });
    logger.warn("warn", { count: 3 });

    expect(sink.debug).toHaveBeenCalledWith("debug", { count: 1 });
    expect(sink.info).toHaveBeenCalledWith("info", { count: 2 });
    expect(sink.warn).toHaveBeenCalledWith("warn", { count: 3 });
  });

  it("normalizes Error instances without logging stack or application state", () => {
    const sink = new RecordingLogSink();
    const logger = new RuntimeLogger("test", sink);

    logger.error("failed", new TypeError("bad input"), { operation: "decode" });

    expect(sink.error).toHaveBeenCalledWith("failed", {
      operation: "decode",
      error: { name: "TypeError", message: "bad input" },
    });
  });

  it("normalizes non-Error failures into a stable description", () => {
    const sink = new RecordingLogSink();
    const logger = new RuntimeLogger("test", sink);

    logger.error("failed", "rejected");

    expect(sink.error).toHaveBeenCalledWith("failed", {
      error: { name: "UnknownError", message: "rejected" },
    });
  });
});
