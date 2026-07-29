import {
  BoardModel,
  type Answer,
  type EditorState,
  type Placement,
  type PlayCell,
  type PlayState,
} from "./model";
import { DuplicateCardDetector } from "./duplicates";
import { RuntimeLogger } from "./logger";
import { StateCodec } from "./codec";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const logger = new RuntimeLogger("board-generator");

/**
 * Validates editor rules, produces deterministic randomized boards, and
 * evaluates completed bingo lines.
 *
 * A caller-provided seed makes every generated board reproducible from its URL.
 * Placement uses constrained backtracking before flexible cards are shuffled
 * into the remaining cells.
 */
export class BoardGenerator {
  private readonly duplicateDetector = new DuplicateCardDetector();
  private readonly stateCodec = new StateCodec();

  /**
   * Checks user-correctable conditions without throwing. Validation errors
   * block publishing; warnings describe safe but potentially surprising output.
   */
  public validate(editor: EditorState): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const answers = editor.answers.filter((answer) => answer.text.trim());
    const needed = BoardModel.blankSquareCount(editor);
    const mandatory = answers.filter(
      (answer) => answer.placement.kind !== "any",
    );
    const freeIndex = BoardModel.freeCellIndex(
      editor.config.size,
      editor.config.free,
    );

    if (!editor.config.title.trim()) errors.push("Add a board title.");
    if (answers.length < needed) {
      const missing = needed - answers.length;
      errors.push(`Add ${missing} more card${missing === 1 ? "" : "s"}.`);
    }
    if (mandatory.length > needed) {
      errors.push(`Only ${needed} constrained cards can fit on this board.`);
    }
    if (
      mandatory.length <= needed &&
      !this.placeMandatory(
        mandatory,
        editor.config.size,
        freeIndex,
        this.createRandom(1),
      )
    ) {
      errors.push(
        "The placement rules conflict. Move or loosen a locked card.",
      );
    }

    if (this.duplicateDetector.findDuplicateIds(answers).size > 0) {
      warnings.push("Duplicate card text will appear as separate squares.");
    }
    if (this.stateCodec.encode(editor).length > 7000) {
      warnings.push(
        "This board creates a long URL that some messaging apps may truncate.",
      );
    }

    const result = { valid: errors.length === 0, errors, warnings };
    logger.debug("Validated editor state.", {
      valid: result.valid,
      errorCount: errors.length,
      warningCount: warnings.length,
      cardCount: answers.length,
    });
    return result;
  }

  /**
   * Creates a complete immutable play session from a valid editor state.
   * Throws only when a caller bypasses validation or an internal invariant fails.
   */
  public generate(editor: EditorState, seed: string): PlayState {
    const validation = this.validate(editor);
    if (!validation.valid) {
      const error = new Error(validation.errors.join(" "));
      logger.error("Refused to generate an invalid board.", error, {
        errorCount: validation.errors.length,
      });
      throw error;
    }

    const size = editor.config.size;
    const freeIndex = BoardModel.freeCellIndex(size, editor.config.free);
    const random = this.createRandom(this.hashString(seed));
    const answers = editor.answers
      .filter((answer) => answer.text.trim())
      .map((answer) => ({ ...answer, text: answer.text.trim() }));
    const mandatory = answers.filter(
      (answer) => answer.placement.kind !== "any",
    );
    const flexible = answers.filter(
      (answer) => answer.placement.kind === "any",
    );
    const placed = this.placeMandatory(mandatory, size, freeIndex, random);
    if (!placed) {
      const error = new Error("The placement rules conflict.");
      logger.error("Validated placement rules became unsatisfiable.", error);
      throw error;
    }

    const openCells = this.shuffle(
      Array.from({ length: size ** 2 }, (_, index) => index).filter(
        (index) => index !== freeIndex && !placed.has(index),
      ),
      random,
    );
    const selectedFlexible = this.shuffle(flexible, random).slice(
      0,
      openCells.length,
    );
    openCells.forEach((cell, index) => {
      const answer = selectedFlexible[index];
      if (answer) placed.set(cell, answer);
    });

    const cells: PlayCell[] = Array.from(
      { length: size ** 2 },
      (_, index) => {
        if (index === freeIndex) {
          return {
            id: "__free__",
            text: editor.config.freeLabel.trim() || "FREE",
            free: true,
          };
        }
        const answer = placed.get(index);
        if (!answer) {
          const error = new Error("Not enough cards to fill the board.");
          logger.error("Board generation left an open cell.", error, { index });
          throw error;
        }
        return { id: answer.id, text: answer.text };
      },
    );

    logger.info("Generated a play board.", {
      size,
      freeSquare: freeIndex !== null,
      constrainedCardCount: mandatory.length,
    });
    return {
      v: 1,
      mode: "play",
      title: editor.config.title.trim(),
      size,
      theme: editor.config.theme,
      accentColor: editor.config.accentColor,
      fontMode: editor.config.fontMode,
      fontSize: editor.config.fontSize,
      cells,
      checked: freeIndex === null ? [] : [freeIndex],
      source: editor,
      seed,
    };
  }

  /**
   * Generates a live preview even while the editor is incomplete. Valid boards
   * use the production algorithm; partial boards randomize available cards and
   * fill the rest with placeholders.
   */
  public generatePreview(editor: EditorState, seed: string): PlayCell[] {
    if (this.validate(editor).valid) {
      return this.generate(editor, seed).cells;
    }

    const size = editor.config.size;
    const freeIndex = BoardModel.freeCellIndex(size, editor.config.free);
    const random = this.createRandom(this.hashString(seed));
    const answers = this.shuffle(
      editor.answers
        .filter((answer) => answer.text.trim())
        .map((answer) => ({ ...answer, text: answer.text.trim() })),
      random,
    );
    const openCells = this.shuffle(
      Array.from({ length: size ** 2 }, (_, index) => index).filter(
        (index) => index !== freeIndex,
      ),
      random,
    );
    const placed = new Map(
      openCells
        .slice(0, answers.length)
        .map((cell, index) => [cell, answers[index] as Answer] as const),
    );

    return Array.from({ length: size ** 2 }, (_, index) => {
      if (index === freeIndex) {
        return {
          id: "__free__",
          text: editor.config.freeLabel.trim() || "FREE",
          free: true,
        };
      }
      const answer = placed.get(index);
      return {
        id: answer?.id ?? `placeholder-${index}`,
        text: answer?.text ?? "Add card",
      };
    });
  }

  /** Returns every checked cell belonging to any completed row, column, or diagonal. */
  public winningCells(play: PlayState): Set<number> {
    const checked = new Set(play.checked);
    const lines: number[][] = [];
    for (let row = 0; row < play.size; row += 1) {
      lines.push(
        Array.from(
          { length: play.size },
          (_, column) => row * play.size + column,
        ),
      );
    }
    for (let column = 0; column < play.size; column += 1) {
      lines.push(
        Array.from(
          { length: play.size },
          (_, row) => row * play.size + column,
        ),
      );
    }
    lines.push(
      Array.from(
        { length: play.size },
        (_, index) => index * play.size + index,
      ),
    );
    lines.push(
      Array.from(
        { length: play.size },
        (_, index) => index * play.size + (play.size - 1 - index),
      ),
    );

    const result = new Set<number>();
    lines
      .filter((line) => line.every((cell) => checked.has(cell)))
      .forEach((line) => line.forEach((cell) => result.add(cell)));
    if (result.size > 0) {
      logger.info("Detected a completed bingo line.", {
        winningCellCount: result.size,
      });
    }
    return result;
  }

  /** Folds an arbitrary seed string into the unsigned integer used by the PRNG. */
  private hashString(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  /** Creates a deterministic Mulberry32-style pseudorandom number source. */
  private createRandom(seedValue: number): () => number {
    let seed = seedValue;
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value =
        (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Returns a Fisher-Yates shuffled copy and never mutates the supplied array. */
  private shuffle<T>(items: T[], random: () => number): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [
        result[swapIndex] as T,
        result[index] as T,
      ];
    }
    return result;
  }

  /** Enumerates cells allowed by one exact-cell, row, column, or flexible rule. */
  private allowedCells(
    placement: Placement,
    size: number,
    freeIndex: number | null,
  ): number[] {
    const all = Array.from(
      { length: size ** 2 },
      (_, index) => index,
    ).filter((index) => index !== freeIndex);
    switch (placement.kind) {
      case "cell":
        return placement.index < size ** 2 && placement.index !== freeIndex
          ? [placement.index]
          : [];
      case "row":
        return all.filter(
          (index) => Math.floor(index / size) === placement.index,
        );
      case "column":
        return all.filter((index) => index % size === placement.index);
      default:
        return all;
    }
  }

  /**
   * Places constrained cards with smallest-domain-first backtracking. Returning
   * `null` proves that no collision-free assignment exists.
   */
  private placeMandatory(
    answers: Answer[],
    size: number,
    freeIndex: number | null,
    random: () => number,
  ): Map<number, Answer> | null {
    const candidates = answers
      .map((answer) => ({
        answer,
        cells: this.shuffle(
          this.allowedCells(answer.placement, size, freeIndex),
          random,
        ),
      }))
      .sort((left, right) => left.cells.length - right.cells.length);

    const placed = new Map<number, Answer>();
    const search = (cursor: number): boolean => {
      if (cursor === candidates.length) return true;
      const candidate = candidates[cursor];
      if (!candidate) return false;
      for (const cell of candidate.cells) {
        if (placed.has(cell)) continue;
        placed.set(cell, candidate.answer);
        if (search(cursor + 1)) return true;
        placed.delete(cell);
      }
      return false;
    };

    return search(0) ? placed : null;
  }
}
