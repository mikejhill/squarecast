import { useEffect, useState } from "react";
import { History, RotateCcw } from "lucide-react";
import type { BoardCheckpoint } from "../lib/board-repository";
import { Modal } from "./Modal";

type CheckpointDialogProps = {
  onClose: () => void;
  loadCheckpoints: () => Promise<readonly BoardCheckpoint[]>;
  onRestore: (revision: number) => Promise<void>;
};

/** Lists immutable saved checkpoints and restores one as a new head revision. */
export function CheckpointDialog({
  onClose,
  loadCheckpoints,
  onRestore,
}: CheckpointDialogProps) {
  const [checkpoints, setCheckpoints] = useState<readonly BoardCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
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

  return (
    <Modal title="Version History" onClose={onClose}>
      <p className="dialog-intro">
        Up to 25 meaningful checkpoints are retained. Restoring creates a new revision.
      </p>
      {message && <p className="form-error" role="alert">{message}</p>}
      {loading ? (
        <p role="status">Loading version history…</p>
      ) : checkpoints.length === 0 ? (
        <p>No meaningful checkpoints have been saved yet.</p>
      ) : (
        <ol className="checkpoint-list">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint.revision}>
              <History size={17} />
              <div>
                <strong>{checkpoint.reason}</strong>
                <span>
                  Revision {checkpoint.revision} · {new Date(checkpoint.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                disabled={restoring !== null}
                onClick={() => void restore(checkpoint.revision)}
              >
                <RotateCcw size={15} />
                {restoring === checkpoint.revision ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
