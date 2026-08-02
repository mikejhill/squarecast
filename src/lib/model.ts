import { z } from "zod";

// These schemas are the trust boundary for state restored from a shared URL.
// Defaults keep links created by earlier compatible versions readable.
export const themeSchema = z.enum([
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
]);
export type Theme = z.infer<typeof themeSchema>;

export const fontModeSchema = z.enum(["auto", "fixed"]);
export type FontMode = z.infer<typeof fontModeSchema>;

export const answerSortSchema = z.enum([
  "manual",
  "alphabetical",
  "reverse",
  "constrained",
  "shuffle",
]);
export type AnswerSort = z.infer<typeof answerSortSchema>;

export const placementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }),
  z.object({ kind: z.literal("cell"), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("row"), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("column"), index: z.number().int().nonnegative() }),
]);
export type Placement = z.infer<typeof placementSchema>;

export const answerSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  placement: placementSchema,
});
export type Answer = z.infer<typeof answerSchema>;

const freeSquareCountSchema = z.preprocess(
  (value) => (typeof value === "boolean" ? (value ? 1 : 0) : value),
  z.number().int().min(0).max(6),
);

const boardConfigShape = {
  title: z.string(),
  size: z.number().int().min(3).max(7),
  free: freeSquareCountSchema,
  freeLabel: z.string(),
  theme: themeSchema.default("coral"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#ff6b45"),
  fontMode: fontModeSchema.default("auto"),
  fontSize: z.number().int().min(10).max(32).default(18),
  sortMode: answerSortSchema.default("alphabetical"),
  previewSeed: z.string().min(1).default("preview"),
};

export const boardConfigPatchSchema = z.object(boardConfigShape).partial();
export const boardConfigSchema = z.object(boardConfigShape).superRefine(
  (config, context) => {
    if (config.free > config.size - 1) {
      context.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: config.size - 1,
        type: "number",
        inclusive: true,
        path: ["free"],
        message: `A ${config.size} × ${config.size} board supports at most ${config.size - 1} free squares.`,
      });
    }
  },
);
export type BoardConfig = z.infer<typeof boardConfigSchema>;

export const editorStateSchema = z.object({
  v: z.literal(1),
  mode: z.literal("edit"),
  setupCollapsed: z.boolean().default(false),
  placementControlsVisible: z.boolean().default(false),
  config: boardConfigSchema,
  answers: z.array(answerSchema),
});
export type EditorState = z.infer<typeof editorStateSchema>;

export const launchStateSchema = z.object({
  v: z.literal(1),
  mode: z.literal("launch"),
  source: editorStateSchema,
});
export type LaunchState = z.infer<typeof launchStateSchema>;

export const playCellSchema = z.object({
  id: z.string(),
  text: z.string(),
  free: z.boolean().optional(),
});
export type PlayCell = z.infer<typeof playCellSchema>;

export const playStateSchema = z.object({
  v: z.literal(1),
  mode: z.literal("play"),
  title: z.string(),
  size: z.number().int().min(3).max(7),
  theme: themeSchema.default("coral"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#ff6b45"),
  fontMode: fontModeSchema.default("auto"),
  fontSize: z.number().int().min(10).max(32).default(18),
  cells: z.array(playCellSchema),
  checked: z.array(z.number().int().nonnegative()),
  source: editorStateSchema,
  seed: z.string(),
});
export type PlayState = z.infer<typeof playStateSchema>;
export type ActiveState = EditorState | PlayState;

export const appStateSchema = z.discriminatedUnion("mode", [
  editorStateSchema,
  launchStateSchema,
  playStateSchema,
]);
export type AppState = z.infer<typeof appStateSchema>;

const starterAnswers = [
  "Try a new snack",
  "Spot a dog in a bandana",
  "Take a scenic photo",
  "Hear live music",
  "Find a tiny bookstore",
  "Order something you cannot pronounce",
  "See a colorful mural",
  "Walk down a street you have never tried",
  "Find a great window display",
  "Drink something with an umbrella",
  "Watch a sunset",
  "Visit a local market",
  "Take the long way home",
  "Find a perfect picnic spot",
  "Hear a favorite song in public",
  "Discover a new dessert",
  "See an unusual bicycle",
  "Find a quiet bench",
  "Spot a funny street sign",
  "Buy a postcard",
  "See someone wearing a bold hat",
  "Find a hidden garden",
  "Try a seasonal flavor",
  "Take a photo with friends",
  "See a vintage car",
  "Find a great view",
  "Learn a local fact",
  "End the day with ice cream",
];

/** Creates compact identifiers for cards and high-entropy seeds for board order. */
export class IdFactory {
  /** Returns a short card identity, preferring collision-resistant Web Crypto. */
  public static create(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(36).slice(2, 10);
  }

  /** Returns a fresh randomization seed without exposing board content. */
  public static seed(): string {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const bytes = new Uint32Array(2);
      crypto.getRandomValues(bytes);
      return `${bytes[0]?.toString(36)}${bytes[1]?.toString(36)}`;
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

/** Provides canonical board-state calculations shared by editor and generator. */
export class BoardModel {
  /** Builds the populated example board used by tests and legacy default links. */
  public static createDefaultEditor(): EditorState {
    return {
      v: 1,
      mode: "edit",
      setupCollapsed: false,
      placementControlsVisible: false,
      config: {
        title: "Weekend Adventure Bingo",
        size: 5,
        free: 1,
        freeLabel: "FREE",
        theme: "coral",
        accentColor: "#ff6b45",
        fontMode: "auto",
        fontSize: 18,
        sortMode: "manual",
        previewSeed: "weekend-preview",
      },
      answers: starterAnswers.map((text) => ({
        id: IdFactory.create(),
        text,
        placement: { kind: "any" as const },
      })),
    };
  }

  /** Returns the largest count that cannot complete a line before play begins. */
  public static maxFreeSquareCount(size: number): number {
    return Math.max(0, size - 1);
  }

  /**
   * Returns the predetermined free-cell sequence for a supported board size.
   * Early cells maximize newly covered lines and avoid repeated rows, columns,
   * and diagonals whenever the geometry permits it.
   */
  public static freeCellIndexes(
    size: number,
    count: number,
  ): readonly number[] {
    const patterns: Record<number, readonly number[]> = {
      3: [4, 0],
      4: [0, 6, 11],
      5: [12, 1, 5, 19],
      6: [0, 10, 13, 23, 26],
      7: [24, 1, 7, 19, 34, 37],
    };
    const pattern = patterns[size] ?? [];
    const safeCount = Math.min(
      Math.max(0, Math.trunc(count)),
      pattern.length,
    );
    return pattern.slice(0, safeCount);
  }

  /** Calculates the number of card-backed cells required for a complete board. */
  public static blankSquareCount(editor: EditorState): number {
    return editor.config.size ** 2 - editor.config.free;
  }
}
