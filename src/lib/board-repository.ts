import { z } from "zod";
import type { EditorOperation } from "./editor-operation";
import type { EditorState } from "./model";

export const storageKindSchema = z.enum(["url", "device", "cloud"]);
export type StorageKind = z.infer<typeof storageKindSchema>;

export const boardPermissionSchema = z.enum([
  "owner",
  "editor",
  "viewer",
]);
export type BoardPermission = z.infer<typeof boardPermissionSchema>;

export const syncStatusSchema = z.enum([
  "saved",
  "saving",
  "offline",
  "conflict",
  "unavailable",
]);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export type BoardSummary = {
  id: string;
  title: string;
  storageKind: Exclude<StorageKind, "url">;
  permission: BoardPermission;
  revision: number;
  updatedAt: number;
};

export type SavedBoard = BoardSummary & {
  editor: EditorState;
  createdAt: number;
  cloudAccess?: CloudAccessSnapshot;
  lastOperationTargets?: readonly string[];
  lastEditorUid?: string;
};

export type CloudAccessSnapshot = {
  shareTokens: Readonly<Partial<Record<"view" | "play" | "invite", string>>>;
  members: Readonly<Record<string, "owner" | "editor">>;
};

export type BoardCheckpoint = {
  revision: number;
  stateHash: string;
  createdAt: number;
  reason: string;
  isCurrent?: boolean;
};

/** Common persistence behavior consumed by the workspace orchestration layer. */
export interface BoardRepository {
  list(): Promise<readonly BoardSummary[]>;
  load(id: string): Promise<SavedBoard | null>;
  create(editor: EditorState): Promise<SavedBoard>;
  applyOperation(
    id: string,
    operation: EditorOperation,
    checkpointReason?: string,
  ): Promise<SavedBoard>;
  savePresentation(id: string, editor: EditorState): Promise<SavedBoard>;
  duplicate(id: string): Promise<SavedBoard>;
  delete(id: string): Promise<void>;
  listCheckpoints(id: string): Promise<readonly BoardCheckpoint[]>;
  restore(id: string, revision: number): Promise<SavedBoard>;
}

export type WorkspaceReadySession = {
  status: "ready";
  state: EditorState | import("./model").PlayState;
  storageKind: StorageKind;
  recordId?: string;
  permission: BoardPermission;
  revision: number;
  syncStatus: SyncStatus;
  readOnly: boolean;
  historicalRevision?: number;
  editorToken?: string;
  cloudAccess?: CloudAccessSnapshot;
};

export type WorkspaceSession =
  | WorkspaceReadySession
  | { status: "loading"; route: string }
  | {
      status: "error";
      route: string;
      reason: "not-found" | "auth-required" | "access-removed" | "unavailable";
      message: string;
    };
