import { RuntimeLogger } from "./logger";

export type HistoryWriteMode = "push" | "replace" | "none";

type HistoryPort = Pick<History, "pushState" | "replaceState">;

const logger = new RuntimeLogger("url-history");

/**
 * Centralizes History API writes so editor mutations can intentionally choose
 * whether an action creates a Back-button checkpoint.
 */
export class UrlHistoryService {
  public constructor(private readonly history: HistoryPort) {}

  /**
   * Pushes major transitions, replaces high-frequency edits, and skips writes
   * while restoring a state produced by browser navigation.
   */
  public write(
    hash: string,
    mode: HistoryWriteMode,
    state: unknown = null,
  ): void {
    if (mode === "none") {
      logger.debug("Skipped URL write during history restoration.");
      return;
    }
    if (mode === "push") {
      this.history.pushState(state, "", hash);
      logger.info("Created a browser history checkpoint.");
      return;
    }
    this.history.replaceState(state, "", hash);
    logger.debug("Replaced the current browser history state.");
  }
}
