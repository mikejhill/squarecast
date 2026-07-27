import {
  BoardModel,
  type Answer,
  type EditorState,
  type Placement,
  type PlayCell,
  type PlayState,
} from "./model";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export class BoardGenerator {
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

    const normalized = answers.map((answer) =>
      answer.text.trim().toLowerCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      warnings.push("Duplicate card text will appear as separate squares.");
    }
    if (encodeURIComponent(JSON.stringify(editor)).length > 7000) {
      warnings.push(
        "This board creates a long URL that some messaging apps may truncate.",
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  public generate(editor: EditorState, seed: string): PlayState {
    const validation = this.validate(editor);
    if (!validation.valid) throw new Error(validation.errors.join(" "));

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
    if (!placed) throw new Error("The placement rules conflict.");

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
        if (!answer) throw new Error("Not enough cards to fill the board.");
        return { id: answer.id, text: answer.text };
      },
    );

    return {
      v: 1,
      mode: "play",
      title: editor.config.title.trim(),
      size,
      theme: editor.config.theme,
      accentColor: editor.config.accentColor,
      appearance: editor.config.appearance,
      fontMode: editor.config.fontMode,
      fontSize: editor.config.fontSize,
      cells,
      checked: freeIndex === null ? [] : [freeIndex],
      source: editor,
      seed,
    };
  }

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
    return result;
  }

  private hashString(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

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
