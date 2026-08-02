import { useEffect, useState } from "react";
import { Cloud, Copy, Database, ExternalLink, Trash2 } from "lucide-react";
import type { BoardSummary } from "../lib/board-repository";
import { ApplicationRoutes } from "../lib/routes";
import { Modal } from "./Modal";

type BoardLists = {
  device: readonly BoardSummary[];
  cloud: readonly BoardSummary[];
};

type MyBoardsDialogProps = {
  onClose: () => void;
  loadBoards: () => Promise<BoardLists>;
  onOpenRoute: (hash: string) => void;
  onDuplicate: (board: BoardSummary) => Promise<void>;
  onDelete: (board: BoardSummary) => Promise<void>;
};

/** Lists device and account boards without conflating their privacy scopes. */
export function MyBoardsDialog({
  onClose,
  loadBoards,
  onOpenRoute,
  onDuplicate,
  onDelete,
}: MyBoardsDialogProps) {
  const [boards, setBoards] = useState<BoardLists>({ device: [], cloud: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setBoards(await loadBoards());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saved boards could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const act = async (action: () => Promise<void>) => {
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Board action failed.");
    }
  };

  return (
    <Modal title="My Boards" onClose={onClose}>
      {loading && <p role="status">Loading saved boards…</p>}
      {message && <p className="form-error" role="alert">{message}</p>}
      {!loading && (
        <div className="board-library">
          <BoardSection
            title="Saved To Account"
            icon={<Cloud size={18} />}
            boards={boards.cloud}
            onOpenRoute={onOpenRoute}
            onDuplicate={(board) => act(() => onDuplicate(board))}
            onDelete={(board) => act(() => onDelete(board))}
            pendingDelete={pendingDelete}
            onRequestDelete={setPendingDelete}
          />
          <BoardSection
            title="On This Device"
            icon={<Database size={18} />}
            boards={boards.device}
            onOpenRoute={onOpenRoute}
            onDuplicate={(board) => act(() => onDuplicate(board))}
            onDelete={(board) => act(() => onDelete(board))}
            pendingDelete={pendingDelete}
            onRequestDelete={setPendingDelete}
          />
        </div>
      )}
    </Modal>
  );
}

function BoardSection({
  title,
  icon,
  boards,
  onOpenRoute,
  onDuplicate,
  onDelete,
  pendingDelete,
  onRequestDelete,
}: {
  title: string;
  icon: React.ReactNode;
  boards: readonly BoardSummary[];
  onOpenRoute: (hash: string) => void;
  onDuplicate: (board: BoardSummary) => void;
  onDelete: (board: BoardSummary) => void;
  pendingDelete: string | null;
  onRequestDelete: (key: string | null) => void;
}) {
  return (
    <section className="board-library-section">
      <h3>{icon}{title}</h3>
      {!boards.length ? (
        <p>No boards saved here.</p>
      ) : (
        <ul>
          {boards.map((board) => (
            <li key={`${board.storageKind}:${board.id}`}>
              <div>
                <strong>{board.title || "Untitled Board"}</strong>
                <span>{board.permission} · {new Date(board.updatedAt).toLocaleString()}</span>
              </div>
              <div className="board-library-actions">
                <button
                  type="button"
                  onClick={() =>
                    onOpenRoute(
                      board.storageKind === "device"
                        ? ApplicationRoutes.deviceBoard(board.id)
                        : ApplicationRoutes.cloudBoard(board.id),
                    )
                  }
                  aria-label={`Open ${board.title}`}
                >
                  <ExternalLink size={15} /> Open
                </button>
                <button type="button" onClick={() => onDuplicate(board)} aria-label={`Duplicate ${board.title}`}>
                  <Copy size={15} />
                </button>
                {pendingDelete === `${board.storageKind}:${board.id}` ? (
                  <>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        onRequestDelete(null);
                        onDelete(board);
                      }}
                    >
                      Confirm Delete
                    </button>
                    <button type="button" onClick={() => onRequestDelete(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="danger-icon"
                    onClick={() => onRequestDelete(`${board.storageKind}:${board.id}`)}
                    aria-label={`Delete ${board.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
