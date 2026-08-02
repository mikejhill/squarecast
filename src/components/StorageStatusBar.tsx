import { Cloud, Database, History, Link2, RotateCcw, Share2, Users } from "lucide-react";
import type {
  StorageKind,
  WorkspaceReadySession,
} from "../lib/board-repository";
import type { AuthUser } from "../services/cloud-auth-service";
import type { BoardPresence } from "../services/cloud-board-repository";

type StorageStatusBarProps = {
  session: WorkspaceReadySession;
  authUser: AuthUser | null;
  preferredStorage: StorageKind;
  statusMessage: string;
  presence: readonly BoardPresence[];
  onPreferredStorageChange: (kind: StorageKind) => void;
  onCopyToDevice: () => void;
  onCopyToCloud: () => void;
  onUseUrlOnly: () => void;
  onOpenShare: () => void;
  onOpenHistory: () => void;
  onRestoreHistorical: () => void;
};

const storageLabels: Record<StorageKind, string> = {
  url: "URL Only",
  device: "On This Device",
  cloud: "Saved To Account",
};

/** Shows the active persistence boundary and actionable save/sync state. */
export function StorageStatusBar({
  session,
  authUser,
  preferredStorage,
  statusMessage,
  presence,
  onPreferredStorageChange,
  onCopyToDevice,
  onCopyToCloud,
  onUseUrlOnly,
  onOpenShare,
  onOpenHistory,
  onRestoreHistorical,
}: StorageStatusBarProps) {
  const Icon =
    session.storageKind === "cloud"
      ? Cloud
      : session.storageKind === "device"
        ? Database
        : Link2;
  const otherEditors = [
    ...new Map(
      presence
        .filter((entry) => entry.uid !== authUser?.uid)
        .map((entry) => [entry.uid, entry] as const),
    ).values(),
  ];
  const activeStorageLabel = session.editorToken
    ? "Shared Editor Link"
    : storageLabels[session.storageKind];

  return (
    <section className="storage-status" aria-label="Board storage">
      <div className="storage-status-main">
        <Icon size={17} />
        <div>
          <strong>{activeStorageLabel}</strong>
          <span role="status">
            {session.historicalRevision !== undefined
              ? `Viewing historical revision ${session.historicalRevision}`
              : session.storageKind === "url"
              ? `First edit saves to ${storageLabels[preferredStorage]}`
              : syncLabel(session.syncStatus)}
            {statusMessage ? ` — ${statusMessage}` : ""}
          </span>
        </div>
      </div>
      {otherEditors.length > 0 && (
        <span className="presence-label" title={otherEditors.map((entry) => entry.displayName).join(", ")}>
          <Users size={15} />
          {otherEditors.length} editing
        </span>
      )}
      <div className="storage-actions">
        {session.historicalRevision !== undefined && (
          <button type="button" onClick={onRestoreHistorical}>
            <RotateCcw size={15} /> Restore This Version
          </button>
        )}
        {session.storageKind === "url" ? (
          <label>
            <span className="sr-only">Save new changes</span>
            <select
              value={preferredStorage}
              onChange={(event) =>
                onPreferredStorageChange(event.target.value as StorageKind)
              }
            >
              <option value="url">Keep URL Only</option>
              <option value="device">Save On This Device</option>
              <option value="cloud" disabled={!authUser?.emailVerified}>
                Save To Account
              </option>
            </select>
          </label>
        ) : (
          <>
            <button type="button" onClick={onUseUrlOnly}>
              <Link2 size={15} /> URL-Only Copy
            </button>
            {session.storageKind !== "device" && (
              <button type="button" onClick={onCopyToDevice}>
                <Database size={15} /> Device Copy
              </button>
            )}
            {session.storageKind !== "cloud" && authUser?.emailVerified && (
              <button type="button" onClick={onCopyToCloud}>
                <Cloud size={15} /> Account Copy
              </button>
            )}
          </>
        )}
        {session.storageKind === "cloud" && session.permission === "owner" && (
          <button type="button" className="storage-share-button" onClick={onOpenShare}>
            <Share2 size={15} /> Share
          </button>
        )}
        {session.storageKind !== "url" && (
          <button type="button" onClick={onOpenHistory}>
            <History size={15} /> History
          </button>
        )}
      </div>
    </section>
  );
}

function syncLabel(status: WorkspaceReadySession["syncStatus"]): string {
  switch (status) {
    case "saved":
      return "Saved";
    case "saving":
      return "Saving…";
    case "offline":
      return "Offline — Changes Pending";
    case "conflict":
      return "Conflict";
    case "unavailable":
      return "Cloud Unavailable";
  }
}
