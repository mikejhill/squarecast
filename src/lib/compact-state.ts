import { z } from "zod";
import {
  appStateSchema,
  type Answer,
  type AppState,
  type BoardConfig,
  type EditorState,
  type FontMode,
  type Placement,
  type PlayCell,
  type PlayState,
  type Theme,
  type AnswerSort,
} from "./model";

const themes = [
  "ink",
  "coral",
  "mint",
  "violet",
  "ocean",
  "sunflower",
  "rose",
  "teal",
  "indigo",
  "orange",
  "custom",
] as const satisfies readonly Theme[];

const fontModes = ["auto", "fixed"] as const satisfies readonly FontMode[];
const sortModes = [
  "manual",
  "alphabetical",
  "reverse",
  "constrained",
  "shuffle",
] as const satisfies readonly AnswerSort[];

const flagSchema = z.union([z.literal(0), z.literal(1)]);
const editorFlagsSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);
const themeCodeSchema = z.number().int().min(0).max(themes.length - 1);
const fontModeCodeSchema = z.number().int().min(0).max(fontModes.length - 1);
const sortModeCodeSchema = z.number().int().min(0).max(sortModes.length - 1);
const placementCodeSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);

const compactConfigSchema = z.tuple([
  z.string(),
  z.number().int().min(3).max(7),
  flagSchema,
  z.string(),
  themeCodeSchema,
  z.string().regex(/^[0-9a-f]{6}$/i),
  fontModeCodeSchema,
  z.number().int().min(10).max(32),
  sortModeCodeSchema,
  z.string().min(1),
]);

const compactAnswerSchema = z.union([
  z.tuple([z.string().min(1), z.string()]),
  z.tuple([
    z.string().min(1),
    z.string(),
    placementCodeSchema,
    z.number().int().nonnegative(),
  ]),
]);

const compactCellSchema = z.union([
  z.number().int().min(-1),
  z.tuple([z.string(), z.string()]),
  z.tuple([z.string(), z.string(), flagSchema]),
]);

const compactDisplaySchema = z.union([
  z.tuple([]),
  z.tuple([
    z.string(),
    z.number().int().min(3).max(7),
    themeCodeSchema,
    z.string().regex(/^[0-9a-f]{6}$/i),
    fontModeCodeSchema,
    z.number().int().min(10).max(32),
  ]),
]);

const compactEditorSchema = z.tuple([
  z.literal(2),
  z.literal(0),
  editorFlagsSchema,
  compactConfigSchema,
  z.array(compactAnswerSchema),
]);

const compactLaunchSchema = z.tuple([
  z.literal(2),
  z.literal(1),
  editorFlagsSchema,
  compactConfigSchema,
  z.array(compactAnswerSchema),
]);

const compactPlaySchema = z.tuple([
  z.literal(2),
  z.literal(2),
  editorFlagsSchema,
  compactConfigSchema,
  z.array(compactAnswerSchema),
  z.string(),
  z.array(z.number().int().nonnegative()),
  z.array(compactCellSchema),
  compactDisplaySchema,
]);

const compactStateSchema = z.union([
  compactEditorSchema,
  compactLaunchSchema,
  compactPlaySchema,
]);

type CompactConfig = z.infer<typeof compactConfigSchema>;
type CompactAnswer = z.infer<typeof compactAnswerSchema>;
type CompactCell = z.infer<typeof compactCellSchema>;
type CompactDisplay = z.infer<typeof compactDisplaySchema>;
type CompactState = z.infer<typeof compactStateSchema>;

/**
 * Removes repeated JSON structure from URL state without weakening the public
 * application schema.
 *
 * Version 2 compact tuples live inside the existing `#sq1:` envelope. The
 * serializer restores ordinary model objects and validates the complete result
 * with `appStateSchema`, so compact transport data never becomes trusted state
 * directly.
 */
export class CompactStateSerializer {
  /** Converts a validated application state into the shortest supported tuple. */
  public serialize(state: AppState): CompactState {
    const source = state.mode === "edit" ? state : state.source;
    const editor = this.serializeEditor(source);

    if (state.mode === "edit") return [2, 0, ...editor];
    if (state.mode === "launch") return [2, 1, ...editor];

    return [
      2,
      2,
      ...editor,
      state.seed,
      state.checked,
      state.cells.map((cell) => this.serializeCell(cell, source)),
      this.serializeDisplay(state, source.config),
    ];
  }

  /**
   * Validates compact tuple structure, reconstructs the domain object, and
   * applies the canonical application schema before returning any state.
   */
  public deserialize(input: unknown): AppState {
    const compact = compactStateSchema.parse(input);
    const source = this.deserializeEditor(compact[2], compact[3], compact[4]);

    if (compact[1] === 0) return appStateSchema.parse(source);
    if (compact[1] === 1) {
      return appStateSchema.parse({ v: 1, mode: "launch", source });
    }

    const display = this.deserializeDisplay(compact[8], source.config);
    return appStateSchema.parse({
      v: 1,
      mode: "play",
      ...display,
      cells: compact[7].map((cell) => this.deserializeCell(cell, source)),
      checked: compact[6],
      source,
      seed: compact[5],
    });
  }

  private serializeEditor(
    editor: EditorState,
  ): [0 | 1 | 2 | 3, CompactConfig, CompactAnswer[]] {
    return [
      ((editor.setupCollapsed ? 1 : 0) +
        (editor.placementControlsVisible ? 2 : 0)) as 0 | 1 | 2 | 3,
      this.serializeConfig(editor.config),
      editor.answers.map((answer) => this.serializeAnswer(answer)),
    ];
  }

  private deserializeEditor(
    flags: 0 | 1 | 2 | 3,
    config: CompactConfig,
    answers: CompactAnswer[],
  ): EditorState {
    return {
      v: 1,
      mode: "edit",
      setupCollapsed: (flags & 1) === 1,
      placementControlsVisible: (flags & 2) === 2,
      config: this.deserializeConfig(config),
      answers: answers.map((answer) => this.deserializeAnswer(answer)),
    };
  }

  private serializeConfig(config: BoardConfig): CompactConfig {
    return [
      config.title,
      config.size,
      config.free ? 1 : 0,
      config.freeLabel,
      this.codeOf(themes, config.theme),
      config.accentColor.slice(1),
      this.codeOf(fontModes, config.fontMode),
      config.fontSize,
      this.codeOf(sortModes, config.sortMode),
      config.previewSeed,
    ];
  }

  private deserializeConfig(config: CompactConfig): BoardConfig {
    return {
      title: config[0],
      size: config[1],
      free: config[2] === 1,
      freeLabel: config[3],
      theme: themes[config[4]]!,
      accentColor: `#${config[5]}`,
      fontMode: fontModes[config[6]]!,
      fontSize: config[7],
      sortMode: sortModes[config[8]]!,
      previewSeed: config[9],
    };
  }

  private serializeAnswer(answer: Answer): CompactAnswer {
    if (answer.placement.kind === "any") return [answer.id, answer.text];
    return [
      answer.id,
      answer.text,
      this.placementCode(answer.placement),
      answer.placement.index,
    ];
  }

  private deserializeAnswer(answer: CompactAnswer): Answer {
    return {
      id: answer[0],
      text: answer[1],
      placement:
        answer.length === 2
          ? { kind: "any" }
          : this.placementFromCode(answer[2], answer[3]),
    };
  }

  /**
   * Generated cells are represented by their Card Pool index. Noncanonical
   * cells retain their complete values, preserving exact round trips for any
   * schema-valid play state rather than only states created by the generator.
   */
  private serializeCell(cell: PlayCell, source: EditorState): CompactCell {
    const freeText = source.config.freeLabel.trim() || "FREE";
    if (cell.id === "__free__" && cell.text === freeText && cell.free === true) {
      return -1;
    }

    const answerIndex = source.answers.findIndex(
      (answer) =>
        answer.id === cell.id &&
        answer.text.trim() === cell.text &&
        cell.free === undefined,
    );
    if (answerIndex >= 0) return answerIndex;
    if (cell.free === undefined) return [cell.id, cell.text];
    return [cell.id, cell.text, cell.free ? 1 : 0];
  }

  private deserializeCell(cell: CompactCell, source: EditorState): PlayCell {
    if (Array.isArray(cell)) {
      return cell.length === 2
        ? { id: cell[0], text: cell[1] }
        : { id: cell[0], text: cell[1], free: cell[2] === 1 };
    }
    if (cell === -1) {
      return {
        id: "__free__",
        text: source.config.freeLabel.trim() || "FREE",
        free: true,
      };
    }

    const answer = source.answers[cell];
    if (!answer) throw new Error("Compact play state references a missing card.");
    return { id: answer.id, text: answer.text.trim() };
  }

  private serializeDisplay(
    play: PlayState,
    config: BoardConfig,
  ): CompactDisplay {
    const derived = this.derivedDisplay(config);
    if (
      play.title === derived.title &&
      play.size === derived.size &&
      play.theme === derived.theme &&
      play.accentColor === derived.accentColor &&
      play.fontMode === derived.fontMode &&
      play.fontSize === derived.fontSize
    ) {
      return [];
    }
    return [
      play.title,
      play.size,
      this.codeOf(themes, play.theme),
      play.accentColor.slice(1),
      this.codeOf(fontModes, play.fontMode),
      play.fontSize,
    ];
  }

  private deserializeDisplay(
    display: CompactDisplay,
    config: BoardConfig,
  ): Pick<
    PlayState,
    "title" | "size" | "theme" | "accentColor" | "fontMode" | "fontSize"
  > {
    if (display.length === 0) return this.derivedDisplay(config);
    return {
      title: display[0],
      size: display[1],
      theme: themes[display[2]]!,
      accentColor: `#${display[3]}`,
      fontMode: fontModes[display[4]]!,
      fontSize: display[5],
    };
  }

  private derivedDisplay(
    config: BoardConfig,
  ): Pick<
    PlayState,
    "title" | "size" | "theme" | "accentColor" | "fontMode" | "fontSize"
  > {
    return {
      title: config.title.trim(),
      size: config.size,
      theme: config.theme,
      accentColor: config.accentColor,
      fontMode: config.fontMode,
      fontSize: config.fontSize,
    };
  }

  private placementCode(placement: Exclude<Placement, { kind: "any" }>) {
    if (placement.kind === "cell") return 0 as const;
    if (placement.kind === "row") return 1 as const;
    return 2 as const;
  }

  private placementFromCode(
    code: 0 | 1 | 2,
    index: number,
  ): Exclude<Placement, { kind: "any" }> {
    if (code === 0) return { kind: "cell", index };
    if (code === 1) return { kind: "row", index };
    return { kind: "column", index };
  }

  private codeOf<T extends string>(values: readonly T[], value: T): number {
    const code = values.indexOf(value);
    if (code < 0) throw new Error(`Unsupported compact-state value: ${value}`);
    return code;
  }
}
