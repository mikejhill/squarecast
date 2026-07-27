import type { HistoryWriteMode } from "./history";
import { ApplicationRoutes } from "./routes";

export type NavigationWrite = {
  hash: string;
  mode: HistoryWriteMode;
};

/**
 * Tracks the next History API write independently from React rendering.
 *
 * Major actions can supply a special route, routine changes use encoded state,
 * and Back/Forward restoration consumes state without rewriting history.
 */
export class NavigationCoordinator {
  private mode: HistoryWriteMode = "replace";
  private routeHash: string | null;

  public constructor(initialHash: string) {
    this.routeHash = ApplicationRoutes.isNewBoard(initialHash)
      ? ApplicationRoutes.newBoardHash
      : null;
  }

  /** Records how the next state render should update browser history. */
  public schedule(
    mode: HistoryWriteMode = "replace",
    routeHash?: string,
  ): void {
    this.mode = mode;
    this.routeHash = routeHash ?? null;
  }

  /** Prevents the state restored by a popstate event from writing itself again. */
  public restore(): void {
    this.mode = "none";
    this.routeHash = null;
  }

  /** Returns and resets the pending write after React commits the new state. */
  public consume(encodedStateHash: string): NavigationWrite {
    const write = {
      hash: this.routeHash ?? encodedStateHash,
      mode: this.mode,
    };
    this.mode = "replace";
    this.routeHash = null;
    return write;
  }
}
