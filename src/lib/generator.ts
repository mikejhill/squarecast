import {
  blankSquareCount,
  freeCellIndex,
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

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function allowedCells(
  placement: Placement,
  size: number,
  freeIndex: number | null,
): number[] {
  const all = Array.from({ length: size ** 2 }, (_, index) => index).filter(
    (index) => index !== freeIndex,
  );
  switch (placement.kind) {
    case "cell":
      return placement.index < size ** 2 && placement.index !== freeIndex
        ? [placement.index]
        : [];
    case "row":
      return all.filter((index) => Math.floor(index / size) === placement.index);
    case "column":
      return all.filter((index) => index % size === placement.index);
    default:
      return all;
  }
}

function placeMandatory(
  answers: Answer[],
  size: number,
  freeIndex: number | null,
  random: () => number,
): Map<number, Answer> | null {
  const candidates = answers
    .map((answer) => ({
      answer,
      cells: shuffle(
        allowedCells(answer.placement, size, freeIndex),
        random,
      ),
    }))
    .sort((a, b) => a.cells.length - b.cells.length);

  const placed = new Map<number, Answer>();
  const search = (cursor: number): boolean => {
    if (cursor === candidates.length) return true;
    for (const cell of candidates[cursor].cells) {
      if (placed.has(cell)) continue;
      placed.set(cell, candidates[cursor].answer);
      if (search(cursor + 1)) return true;
      placed.delete(cell);
    }
    return false;
  };

  return search(0) ? placed : null;
}

export function validateEditor(editor: EditorState): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const answers = editor.answers.filter((answer) => answer.text.trim());
  const needed = blankSquareCount(editor);
  const mandatory = answers.filter((answer) => answer.placement.kind !== "any");
  const freeIndex = freeCellIndex(editor.config.size, editor.config.free);

  if (!editor.config.title.trim()) errors.push("Add a board title.");
  if (answers.length < needed) {
    const missing = needed - answers.length;
    errors.push(`Add ${missing} more answer${missing === 1 ? "" : "s"}.`);
  }
  if (mandatory.length > needed) {
    errors.push(`Only ${needed} constrained answers can fit on this board.`);
  }
  if (
    mandatory.length <= needed &&
    !placeMandatory(mandatory, editor.config.size, freeIndex, mulberry32(1))
  ) {
    errors.push("The placement rules conflict. Move or loosen a locked answer.");
  }

  const normalized = answers.map((answer) => answer.text.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    warnings.push("Duplicate answer text will appear as separate squares.");
  }
  if (encodeURIComponent(JSON.stringify(editor)).length > 7000) {
    warnings.push("This board creates a long URL that some messaging apps may truncate.");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function generateBoard(editor: EditorState, seed: string): PlayState {
  const validation = validateEditor(editor);
  if (!validation.valid) throw new Error(validation.errors.join(" "));

  const size = editor.config.size;
  const freeIndex = freeCellIndex(size, editor.config.free);
  const random = mulberry32(hashString(seed));
  const answers = editor.answers
    .filter((answer) => answer.text.trim())
    .map((answer) => ({ ...answer, text: answer.text.trim() }));
  const mandatory = answers.filter((answer) => answer.placement.kind !== "any");
  const flexible = answers.filter((answer) => answer.placement.kind === "any");
  const placed = placeMandatory(mandatory, size, freeIndex, random);
  if (!placed) throw new Error("The placement rules conflict.");

  const openCells = shuffle(
    Array.from({ length: size ** 2 }, (_, index) => index).filter(
      (index) => index !== freeIndex && !placed.has(index),
    ),
    random,
  );
  const selectedFlexible = shuffle(flexible, random).slice(0, openCells.length);
  openCells.forEach((cell, index) => placed.set(cell, selectedFlexible[index]));

  const cells: PlayCell[] = Array.from({ length: size ** 2 }, (_, index) => {
    if (index === freeIndex) {
      return {
        id: "__free__",
        text: editor.config.freeLabel.trim() || "FREE",
        free: true,
      };
    }
    const answer = placed.get(index);
    if (!answer) throw new Error("Not enough answers to fill the board.");
    return { id: answer.id, text: answer.text };
  });

  return {
    v: 1,
    mode: "play",
    title: editor.config.title.trim(),
    size,
    theme: editor.config.theme,
    cells,
    checked: freeIndex === null ? [] : [freeIndex],
    source: editor,
    seed,
  };
}

export function winningCells(play: PlayState): Set<number> {
  const checked = new Set(play.checked);
  const lines: number[][] = [];
  for (let row = 0; row < play.size; row += 1) {
    lines.push(Array.from({ length: play.size }, (_, col) => row * play.size + col));
  }
  for (let col = 0; col < play.size; col += 1) {
    lines.push(Array.from({ length: play.size }, (_, row) => row * play.size + col));
  }
  lines.push(Array.from({ length: play.size }, (_, index) => index * play.size + index));
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
