import { useEffect, useState } from "react";
import { Eye, History, RotateCcw } from "lucide-react";
import type { BoardCheckpoint } from "../lib/board-repository";
import { Modal } from "./Modal";

type CheckpointDialogProps = {
  onClose: () => void;
  loadCheckpoints: () => Promise<readonly BoardCheckpoint[]>;
  onView: (checkpoint: BoardCheckpoint) => Promise<void>;
  onRestore: (revision: number) => Promise<void>;
  viewingRevision?: number;
};

/** Lists immutable saved checkpoints and restores one as a new head revision. */
export function CheckpointDialog({
  onClose,
  loadCheckpoints,
  onView,
  onRestore,
  viewingRevision,
}: CheckpointDialogProps) {
  const [checkpoints, setCheckpoints] = useState<readonly BoardCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadCheckpoints()
      .then((value) => {
        if (active) setCheckpoints(value);
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Version history could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadCheckpoints]);

  const restore = async (revision: number) => {
    setRestoring(revision);
    setMessage("");
    try {
      await onRestore(revision);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The version could not be restored.");
    } finally {
      setRestoring(null);
    }
  };

  const view = async (checkpoint: BoardCheckpoint) => {
    setViewing(checkpoint.revision);
    setMessage("");
    try {
      await onView(checkpoint);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The version could not be opened.");
    } finally {
      setViewing(null);
    }
  };

  return (
    <Modal title="Version History" onClose={onClose}>
      <p className="dialog-intro">
        Up to 25 meaningful checkpoints are retained. Restoring creates a new revision.
      </p>
      {message && <p className="form-error" role="alert">{message}</p>}
      {loading ? (
        <p role="status">Loading version history…</p>
      ) : checkpoints.length === 0 ? (
        <p>No saved versions are available for this board.</p>
      ) : (
        <ol className="checkpoint-list">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.revision}>
              <History size={17} />
              <div>
                <strong>{checkpoint.reason}</strong>
                <span>
                  Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}
                  {checkpoint.isCurrent ? " · Current" : ""}
                </span>
              </div>
              <div className="checkpoint-actions">
                <button
                  type="button"
                  disabled={
                    restoring !== null ||
                    viewing !== null ||
                    viewingRevision === checkpoint.revision ||
                    (viewingRevision === undefined && checkpoint.isCurrent)
                  }
                  onClick={() => void view(checkpoint)}
                >
                  <Eye size={15} />
                  {viewing === checkpoint.revision
                    ? "Opening…"
                    : viewingRevision === checkpoint.revision ||
                        (viewingRevision === undefined && checkpoint.isCurrent)
                      ? "Viewing"
                      : "View"}
                </button>
                <button
                  type="button"
                  disabled={restoring !== null || viewing !== null || checkpoint.isCurrent}
                  onClick={() => void restore(checkpoint.revision)}
                >
                  <RotateCcw size={15} />
                  {restoring === checkpoint.revision ? "Restoring…" : "Restore"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
