import type { HistoryWriteMode } from "./history";
import {
  BoardModel,
  IdFactory,
  type Answer,
  type BoardConfig,
  type EditorState,
} from "./model";
import { AnswerPoolSorter } from "./sorting";

export type EditorMutation = {
  state: EditorState;
  historyMode: HistoryWriteMode;
};

/**
 * Applies all immutable editor-domain mutations outside React.
 *
 * The service also centralizes sorting persistence and the placement cleanup
 * required when board dimensions or the free-square position change.
 */
export class EditorStateService {
  public constructor(private readonly sorter: AnswerPoolSorter) {}

  /** Applies configuration changes and clears constraints that no longer fit. */
  public patchConfig(
    editor: EditorState,
    patch: Partial<BoardConfig>,
  ): EditorMutation {
    const config = { ...editor.config, ...patch };
    let answers = editor.answers;
    const changesGeometry =
      patch.size !== undefined || patch.free !== undefined;
    if (changesGeometry) {
      const freeIndex = BoardModel.freeCellIndex(config.size, config.free);
      answers = answers.map((answer) => {
        const placement = answer.placement;
        const invalid =
          (placement.kind === "cell" &&
            (placement.index >= config.size ** 2 ||
              placement.index === freeIndex)) ||
          ((placement.kind === "row" || placement.kind === "column") &&
            placement.index >= config.size);
        return invalid
          ? { ...answer, placement: { kind: "any" as const } }
          : answer;
      });
    }
    return {
      state: { ...editor, config, answers },
      historyMode: changesGeometry ? "push" : "replace",
    };
  }

  /** Adds one trimmed card and reapplies the selected persistent sort mode. */
  public addCard(editor: EditorState, text: string): EditorState {
    const value = text.trim();
    if (!value) return editor;
    const answer: Answer = {
      id: IdFactory.create(),
      text: value,
      placement: { kind: "any" },
    };
    const answers = [...editor.answers, answer];
    return {
      ...editor,
      answers: this.sorter.sort(answers, editor.config.sortMode),
    };
  }

  /**
   * Updates one card by identity and reapplies order-dependent sorting.
   * Manual and shuffled lists preserve their current visual order while text
   * and placement edits immediately update deterministic sort modes.
   */
  public updateCard(
    editor: EditorState,
    id: string,
    patch: Partial<Answer>,
  ): EditorState {
    const answers = editor.answers.map((answer) =>
      answer.id === id ? { ...answer, ...patch } : answer,
    );
    const shouldResort =
      editor.config.sortMode !== "manual" &&
      editor.config.sortMode !== "shuffle";
    return {
      ...editor,
      answers: shouldResort
        ? this.sorter.sort(answers, editor.config.sortMode)
        : answers,
    };
  }

  /** Removes one card by identity. */
  public deleteCard(editor: EditorState, id: string): EditorState {
    return {
      ...editor,
      answers: editor.answers.filter((answer) => answer.id !== id),
    };
  }

  /** Appends imported values and reapplies the selected persistent sort mode. */
  public appendCards(
    editor: EditorState,
    values: readonly string[],
  ): EditorState {
    if (!values.length) return editor;
    const imported = [
      ...editor.answers,
      ...values.map((text) => ({
        id: IdFactory.create(),
        text,
        placement: { kind: "any" as const },
      })),
    ];
    return {
      ...editor,
      answers: this.sorter.sort(imported, editor.config.sortMode),
    };
  }

  /** Appends already-identified cards when replaying a persisted operation. */
  public appendAnswers(
    editor: EditorState,
    answers: readonly Answer[],
  ): EditorState {
    if (!answers.length) return editor;
    return {
      ...editor,
      answers: this.sorter.sort(
        [...editor.answers, ...answers],
        editor.config.sortMode,
      ),
    };
  }

  /** Changes the persistent mode and immediately applies it to the Card Pool. */
  public sortCards(editor: EditorState, mode: BoardConfig["sortMode"]): EditorState {
    return {
      ...editor,
      config: { ...editor.config, sortMode: mode },
      answers: this.sorter.sort(editor.answers, mode),
    };
  }

  /** Stores Board Setup disclosure state as URL-backed editor presentation. */
  public setSetupCollapsed(
    editor: EditorState,
    setupCollapsed: boolean,
  ): EditorState {
    return { ...editor, setupCollapsed };
  }

  /** Persists whether Card Pool position controls are exposed. */
  public setPlacementControlsVisible(
    editor: EditorState,
    placementControlsVisible: boolean,
  ): EditorState {
    return { ...editor, placementControlsVisible };
  }
}
