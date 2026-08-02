import { z } from "zod";
import type { EditorStateService } from "./editor-state";
import {
  answerSchema,
  boardConfigSchema,
  editorStateSchema,
  type Answer,
  type BoardConfig,
  type EditorState,
} from "./model";

const answerPatchSchema = answerSchema.partial().omit({ id: true });

/**
 * Describes one durable editor intent so every persistence backend can replay
 * the same domain mutation against its latest validated state.
 */
export const editorOperationSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().min(1),
    type: z.literal("patch-config"),
    patch: boardConfigSchema.partial(),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("patch-presentation"),
    patch: z.object({
      placementControlsVisible: z.boolean(),
    }),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("add-cards"),
    cards: z.array(answerSchema),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("update-card"),
    cardId: z.string().min(1),
    patch: answerPatchSchema,
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("delete-card"),
    cardId: z.string().min(1),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("sort-cards"),
    mode: boardConfigSchema.shape.sortMode,
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal("replace-editor"),
    editor: editorStateSchema,
  }),
]);

export type EditorOperation = z.infer<typeof editorOperationSchema>;

/** Carries persistence policy beside an already-applied optimistic mutation. */
export type EditorChange = {
  operation?: EditorOperation;
  meaningful?: boolean;
};

/** Signals that an operation targeted a card another editor already deleted. */
export class EditorConflictError extends Error {
  public constructor(public readonly operation: EditorOperation) {
    super("The target card no longer exists in the latest board revision.");
    this.name = "EditorConflictError";
  }
}

/** Creates an operation identity suitable for transaction idempotency. */
export function createOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Replays one validated operation against the supplied latest editor state. */
export function applyEditorOperation(
  service: EditorStateService,
  editor: EditorState,
  operation: EditorOperation,
): EditorState {
  const parsed = editorOperationSchema.parse(operation);
  switch (parsed.type) {
    case "patch-config":
      return service.patchConfig(editor, parsed.patch).state;
    case "patch-presentation":
      return service.setPlacementControlsVisible(
        editor,
        parsed.patch.placementControlsVisible,
      );
    case "add-cards":
      return service.appendAnswers(editor, parsed.cards);
    case "update-card":
      if (!editor.answers.some((answer) => answer.id === parsed.cardId)) {
        throw new EditorConflictError(parsed);
      }
      return service.updateCard(editor, parsed.cardId, parsed.patch);
    case "delete-card":
      return service.deleteCard(editor, parsed.cardId);
    case "sort-cards":
      return service.sortCards(editor, parsed.mode);
    case "replace-editor":
      return parsed.editor;
  }
}

/** Returns a queue key used to coalesce routine typing before cloud commits. */
export function editorOperationCoalescingKey(
  operation: EditorOperation,
): string | null {
  if (operation.type === "patch-config") {
    const fields = Object.keys(operation.patch).sort().join(",");
    return `config:${fields}`;
  }
  if (operation.type === "patch-presentation") {
    return "presentation:placement-controls";
  }
  if (operation.type === "update-card") {
    return `card:${operation.cardId}`;
  }
  return null;
}

/** Identifies semantic targets used to notify editors about last-write merges. */
export function editorOperationTargetKeys(
  operation: EditorOperation,
): readonly string[] {
  switch (operation.type) {
    case "patch-config":
      return Object.keys(operation.patch).map((field) => `config:${field}`);
    case "patch-presentation":
      return ["presentation:placement-controls"];
    case "update-card":
    case "delete-card":
      return [`card:${operation.cardId}`];
    case "add-cards":
    case "sort-cards":
      return ["pool"];
    case "replace-editor":
      return ["board"];
  }
}

/** Returns whether a remote commit overlaps an unacknowledged local intent. */
export function editorOperationTargetsOverlap(
  operation: EditorOperation,
  remoteTargets: readonly string[],
): boolean {
  const localTargets = editorOperationTargetKeys(operation);
  return remoteTargets.includes("board") ||
    localTargets.includes("board") ||
    localTargets.some((target) => remoteTargets.includes(target));
}

const configTargetLabels: Record<keyof BoardConfig, string> = {
  title: "Board Title",
  size: "Board Size",
  free: "Free Square",
  freeLabel: "Free Square Label",
  theme: "Board Theme",
  accentColor: "Board Color",
  fontMode: "Tile Text Size Mode",
  fontSize: "Tile Text Size",
  sortMode: "Card Pool Sort Order",
  previewSeed: "Preview Shuffle",
};

/** Produces concise user-facing names for the content affected by an operation. */
export function editorOperationTargetLabels(
  operation: EditorOperation,
  editor: EditorState,
): readonly string[] {
  switch (operation.type) {
    case "patch-config":
      return Object.keys(operation.patch).map(
        (field) => configTargetLabels[field as keyof BoardConfig],
      );
    case "patch-presentation":
      return ["Card Position Controls"];
    case "update-card":
    case "delete-card": {
      const text = editor.answers.find((card) => card.id === operation.cardId)?.text.trim();
      return [text ? `Card “${text.slice(0, 40)}${text.length > 40 ? "…" : ""}”` : "A Card"];
    }
    case "add-cards":
      return ["Card Pool Additions"];
    case "sort-cards":
      return ["Card Pool Order"];
    case "replace-editor":
      return ["Entire Board"];
  }
}

/** Merges two compatible routine operations while retaining the newer ID. */
export function coalesceEditorOperations(
  previous: EditorOperation,
  next: EditorOperation,
): EditorOperation {
  if (previous.type === "patch-config" && next.type === "patch-config") {
    return { ...next, patch: { ...previous.patch, ...next.patch } };
  }
  if (
    previous.type === "patch-presentation" &&
    next.type === "patch-presentation"
  ) {
    return next;
  }
  if (
    previous.type === "update-card" &&
    next.type === "update-card" &&
    previous.cardId === next.cardId
  ) {
    return { ...next, patch: { ...previous.patch, ...next.patch } };
  }
  return next;
}

export type EditorOperationFactory = {
  patchConfig(patch: Partial<BoardConfig>): EditorOperation;
  addCards(cards: readonly Answer[]): EditorOperation;
};
