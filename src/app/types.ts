import type { HistoryWriteMode } from "../lib/history";
import type { EditorChange } from "../lib/editor-operation";
import type { ActiveState } from "../lib/model";

export type StateChangeHandler = (
  state: ActiveState,
  historyMode?: HistoryWriteMode,
  routeHash?: string,
  change?: EditorChange,
) => void;

export type { ActiveState };
