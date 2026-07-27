import { z } from "zod";

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

export const boardConfigSchema = z.object({
  title: z.string(),
  size: z.number().int().min(3).max(7),
  free: z.boolean(),
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
});
export type BoardConfig = z.infer<typeof boardConfigSchema>;

export const editorStateSchema = z.object({
  v: z.literal(1),
  mode: z.literal("edit"),
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

export class IdFactory {
  public static create(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID().slice(0, 8);
    }
    return Math.random().toString(36).slice(2, 10);
  }

  public static seed(): string {
    if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
      const bytes = new Uint32Array(2);
      crypto.getRandomValues(bytes);
      return `${bytes[0]?.toString(36)}${bytes[1]?.toString(36)}`;
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export class BoardModel {
  public static createDefaultEditor(): EditorState {
    return {
      v: 1,
      mode: "edit",
      config: {
        title: "Weekend Adventure Bingo",
        size: 5,
        free: true,
        freeLabel: "FREE",
        theme: "coral",
        accentColor: "#ff6b45",
        fontMode: "auto",
        fontSize: 18,
        sortMode: "alphabetical",
        previewSeed: "weekend-preview",
      },
      answers: starterAnswers.map((text) => ({
        id: IdFactory.create(),
        text,
        placement: { kind: "any" as const },
      })),
    };
  }

  public static freeCellIndex(size: number, enabled: boolean): number | null {
    return enabled ? Math.floor(size / 2) * size + Math.floor(size / 2) : null;
  }

  public static blankSquareCount(editor: EditorState): number {
    return editor.config.size ** 2 - (editor.config.free ? 1 : 0);
  }
}
