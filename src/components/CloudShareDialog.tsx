import { useEffect, useState } from "react";
import { Copy, Link2, RefreshCw, Trash2, UserPlus } from "lucide-react";
import type { ClipboardService } from "../services/clipboard-service";
import type { CloudBoardRepository, PublicShareKind } from "../services/cloud-board-repository";
import { ApplicationRoutes } from "../lib/routes";
import { Modal } from "./Modal";

type CloudShareDialogProps = {
  boardId: string;
  repository: CloudBoardRepository;
  clipboard: ClipboardService;
  onClose: () => void;
};

type ShareTokens = { view?: string; play?: string; invite?: string };

/** Manages owner-controlled mutable links and editor membership. */
export function CloudShareDialog({
  boardId,
  repository,
  clipboard,
  onClose,
}: CloudShareDialogProps) {
  const [tokens, setTokens] = useState<ShareTokens>({});
  const [members, setMembers] = useState<Readonly<Record<string, "owner" | "editor">>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [nextTokens, nextMembers] = await Promise.all([
      repository.activeShareTokens(boardId),
      repository.members(boardId),
    ]);
    setTokens(nextTokens);
    setMembers(nextMembers);
  };

  useEffect(() => {
    void refresh().catch((error: unknown) =>
      setMessage(error instanceof Error ? error.message : "Sharing could not load."),
    );
  }, [boardId, repository]);

  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sharing action failed.");
    } finally {
      setBusy(false);
    }
  };

  const url = (kind: "view" | "play" | "invite", token: string) => {
    const route =
      kind === "view"
        ? ApplicationRoutes.publicView(token)
        : kind === "play"
          ? ApplicationRoutes.publicPlay(token)
          : ApplicationRoutes.editorInvite(token);
    return `${window.location.href.split("#")[0]}${route}`;
  };

  const create = async (kind: PublicShareKind | "invite") => {
    await act(async () => {
      if (kind === "invite") await repository.createEditorInvite(boardId);
      else await repository.createPublicShare(boardId, kind);
    });
  };

  return (
    <Modal title="Share Saved Board" onClose={onClose}>
      <p className="modal-copy">
        Public links are bearer links. Anyone holding one can read the published board. Editor links require a verified account.
      </p>
      <div className="cloud-share-list">
        {(["view", "play", "invite"] as const).map((kind) => (
          <section key={kind}>
            <div>
              <strong>{kind === "view" ? "Live View Link" : kind === "play" ? "Live Play Link" : "Editor Invitation"}</strong>
              <span>{kind === "invite" ? "Expires seven days after creation" : "Always follows the latest saved revision"}</span>
            </div>
            {tokens[kind] ? (
              <div className="share-token-actions">
                <button type="button" disabled={busy} onClick={() => void clipboard.copy(url(kind, tokens[kind]!))}>
                  <Copy size={15} /> Copy
                </button>
                <button type="button" disabled={busy} onClick={() => void create(kind)} title="Rotate link">
                  <RefreshCw size={15} /> Rotate
                </button>
                <button type="button" className="danger-icon" disabled={busy} onClick={() => void act(() => repository.revokeShare(boardId, kind))} title="Revoke link">
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => void create(kind)}>
                {kind === "invite" ? <UserPlus size={15} /> : <Link2 size={15} />}
                Create
              </button>
            )}
          </section>
        ))}
      </div>
      <section className="member-list">
        <h3>Editors</h3>
        <ul>
          {Object.entries(members).map(([uid, role]) => (
            <li key={uid}>
              <code>{uid.slice(0, 12)}</code>
              <span>{role}</span>
              {role === "editor" && (
                <div>
                  <button type="button" disabled={busy} onClick={() => void act(() => repository.transferOwnership(boardId, uid))}>Make Owner</button>
                  <button type="button" className="danger-icon" disabled={busy} onClick={() => void act(() => repository.removeMember(boardId, uid))} aria-label={`Remove editor ${uid}`}><Trash2 size={14} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      {message && <p className="form-error" role="alert">{message}</p>}
    </Modal>
  );
}
