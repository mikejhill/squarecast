import {
  applyDocumentCommand,
  defineDocument,
  type DocumentDefinition,
  type DocumentFailure,
  type ReducerResult,
} from "@mikejhill/portable-document-core";
import { z } from "zod";
import type { EditorStateService } from "./editor-state";
import {
  answerSchema,
  answerSortSchema,
  boardConfigPatchSchema,
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
    patch: boardConfigPatchSchema,
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
    mode: answerSortSchema,
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

/** Signals that a validated portable-document command could not be applied. */
export class EditorOperationApplicationError extends Error {
  public constructor(public readonly failure: DocumentFailure) {
    super(`The editor operation failed: ${failure.code}.`);
    this.name = "EditorOperationApplicationError";
  }
}

/** Stable, content-free summary stored beside portable document snapshots. */
export type SquarecastDocumentSummary = {
  readonly title: string;
  readonly cardCount: number;
};

/**
 * Adapts Squarecast's existing editor state and operation protocol to the
 * portable document contract without changing any persisted representation.
 */
export class SquarecastDocument {
  public readonly definition: DocumentDefinition<
    EditorState,
    EditorOperation,
    SquarecastDocumentSummary
  >;

  public constructor(private readonly service: EditorStateService) {
    this.definition = defineDocument({
      type: "squarecast.board",
      currentSchemaVersion: 1,
      stateSchema: editorStateSchema,
      commandSchema: editorOperationSchema,
      migrations: [],
      reduce: (state, command) => this.reduce(state, command),
      summarize: (state) => ({
        title: state.config.title,
        cardCount: state.answers.length,
      }),
      commandPolicy: {
        inspect: (command) => {
          const coalescingKey = editorOperationCoalescingKey(command);
          return {
            targets: editorOperationTargetKeys(command),
            ...(coalescingKey === null ? {} : { coalescingKey }),
            durability: this.isStructural(command) ? "immediate" : "coalesced",
            conflictLabel: this.conflictLabel(command),
          };
        },
        coalesce: coalesceEditorOperations,
      },
    });
  }

  /** Applies one untrusted command through validation and reducer checks. */
  public apply(editor: unknown, operation: unknown): EditorState {
    const result = applyDocumentCommand(this.definition, editor, operation);
    if (result.ok) return result.state;

    if (result.failure.code === "missing-target") {
      const parsed = editorOperationSchema.safeParse(operation);
      if (parsed.success) throw new EditorConflictError(parsed.data);
    }
    throw new EditorOperationApplicationError(result.failure);
  }

  private reduce(
    editor: EditorState,
    operation: EditorOperation,
  ): ReducerResult<EditorState> {
    switch (operation.type) {
      case "patch-config":
        return {
          ok: true,
          state: this.service.patchConfig(editor, operation.patch).state,
        };
      case "patch-presentation":
        return {
          ok: true,
          state: this.service.setPlacementControlsVisible(
            editor,
            operation.patch.placementControlsVisible,
          ),
        };
      case "add-cards":
        return {
          ok: true,
          state: this.service.appendAnswers(editor, operation.cards),
        };
      case "update-card":
        if (!editor.answers.some((answer) => answer.id === operation.cardId)) {
          return {
            ok: false,
            code: "missing-target",
            message:
              "The target card no longer exists in the latest board revision.",
            recoverable: operation.patch,
          };
        }
        return {
          ok: true,
          state: this.service.updateCard(
            editor,
            operation.cardId,
            operation.patch,
          ),
        };
      case "delete-card":
        return {
          ok: true,
          state: this.service.deleteCard(editor, operation.cardId),
        };
      case "sort-cards":
        return {
          ok: true,
          state: this.service.sortCards(editor, operation.mode),
        };
      case "replace-editor":
        return { ok: true, state: operation.editor };
    }
  }

  private isStructural(operation: EditorOperation): boolean {
    return (
      operation.type === "add-cards" ||
      operation.type === "delete-card" ||
      operation.type === "sort-cards" ||
      operation.type === "replace-editor"
    );
  }

  private conflictLabel(operation: EditorOperation): string {
    switch (operation.type) {
      case "patch-config":
        return "Board configuration";
      case "patch-presentation":
        return "Card position controls";
      case "update-card":
      case "delete-card":
        return "Card";
      case "add-cards":
      case "sort-cards":
        return "Card Pool";
      case "replace-editor":
        return "Entire board";
    }
  }
}

const squarecastDocuments = new WeakMap<
  EditorStateService,
  SquarecastDocument
>();

function documentFor(service: EditorStateService): SquarecastDocument {
  const existing = squarecastDocuments.get(service);
  if (existing) return existing;
  const document = new SquarecastDocument(service);
  squarecastDocuments.set(service, document);
  return document;
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
  return documentFor(service).apply(editor, operation);
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
  return (
    remoteTargets.includes("board") ||
    localTargets.includes("board") ||
    localTargets.some((target) => remoteTargets.includes(target))
  );
}

const configTargetLabels: Record<keyof BoardConfig, string> = {
  title: "Board Title",
  size: "Board Size",
  free: "Free Squares",
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
      const text = editor.answers
        .find((card) => card.id === operation.cardId)
        ?.text.trim();
      return [
        text
          ? `Card “${text.slice(0, 40)}${text.length > 40 ? "…" : ""}”`
          : "A Card",
      ];
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
