import { z } from "zod";

export const themeSchema = z.enum(["ink", "coral", "mint", "violet"]);
export type Theme = z.infer<typeof themeSchema>;

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

export const editorStateSchema = z.object({
  v: z.literal(1),
  mode: z.literal("edit"),
  config: z.object({
    title: z.string(),
    size: z.number().int().min(3).max(7),
    free: z.boolean(),
    freeLabel: z.string(),
    theme: themeSchema,
  }),
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
  theme: themeSchema,
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

export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

const starterAnswers = [
  "Someone says “quick question”",
  "You hear a keyboard clacking",
  "A pet joins the call",
  "Someone is accidentally muted",
  "The meeting starts late",
  "A screen share goes missing",
  "“Can everyone see my screen?”",
  "Someone mentions the weather",
  "A notification sound plays",
  "Two people talk at once",
  "Someone drops a link in chat",
  "A camera freezes perfectly",
  "“Let’s take this offline”",
  "Someone uses a reaction emoji",
  "A surprise acronym appears",
  "The agenda gets rearranged",
  "Someone needs to rejoin",
  "A deadline gets mentioned",
  "Someone says “circle back”",
  "A coffee mug enters frame",
  "Someone asks for context",
  "A calendar invite is promised",
  "The call ends early",
  "Someone says “great point”",
  "A follow-up owner is assigned",
  "Someone forgets they are sharing",
  "A phone rings in the background",
  "Someone says “one last thing”",
];

export function createDefaultEditor(): EditorState {
  return {
    v: 1,
    mode: "edit",
    config: {
      title: "Team meeting bingo",
      size: 5,
      free: true,
      freeLabel: "FREE",
      theme: "coral",
    },
    answers: starterAnswers.map((text) => ({
      id: makeId(),
      text,
      placement: { kind: "any" as const },
    })),
  };
}

export function freeCellIndex(size: number, enabled: boolean): number | null {
  return enabled ? Math.floor(size / 2) * size + Math.floor(size / 2) : null;
}

export function blankSquareCount(editor: EditorState): number {
  return editor.config.size ** 2 - (editor.config.free ? 1 : 0);
}
