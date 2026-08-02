import { NavigationPolicy } from "@mikejhill/portable-document-browser";
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
  private readonly policy = new NavigationPolicy();

  public constructor(initialHash: string) {
    if (ApplicationRoutes.isNewBoard(initialHash)) {
      this.policy.schedule("replace", ApplicationRoutes.newBoardHash);
    }
  }

  /** Records how the next state render should update browser history. */
  public schedule(
    mode: HistoryWriteMode = "replace",
    routeHash?: string,
  ): void {
    this.policy.schedule(mode, routeHash);
  }

  /** Prevents the state restored by a popstate event from writing itself again. */
  public restore(): void {
    this.policy.restore();
  }

  /** Returns and resets the pending write after React commits the new state. */
  public consume(encodedStateHash: string): NavigationWrite {
    return this.policy.consume(encodedStateHash);
  }
}
