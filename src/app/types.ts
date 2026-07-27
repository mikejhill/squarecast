import type { HistoryWriteMode } from "../lib/history";
import type { ActiveState } from "../lib/model";

export type StateChangeHandler = (
  state: ActiveState,
  historyMode?: HistoryWriteMode,
  routeHash?: string,
) => void;

export type { ActiveState };
