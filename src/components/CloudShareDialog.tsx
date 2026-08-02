import { useEffect, useState } from "react";
import { Check, Copy, Link2, LoaderCircle, RefreshCw, Trash2, UserPlus } from "lucide-react";
import type { ClipboardService } from "../services/clipboard-service";
import type { CloudBoardRepository } from "../services/cloud-board-repository";
import { ApplicationRoutes } from "../lib/routes";
import { Modal } from "./Modal";

type CloudShareDialogProps = {
  boardId: string;
  repository: CloudBoardRepository;
  clipboard: ClipboardService;
  onClose: () => void;
};

type ShareTokens = { view?: string; play?: string; invite?: string };
type ShareKind = "view" | "play" | "invite";
type PendingAction =
  | "loading"
  | `${"copy" | "create" | "rotate" | "revoke"}:${ShareKind}`
  | `remove:${string}`
  | `transfer:${string}`;
type StatusMessage = { text: string; error: boolean };

/** Manages owner-controlled mutable links and editor membership. */
export function CloudShareDialog({
  boardId,
  repository,
  clipboard,
  onClose,
}: CloudShareDialogProps) {
  const [tokens, setTokens] = useState<ShareTokens>({});
  const [members, setMembers] = useState<Readonly<Record<string, "owner" | "editor">>>({});
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [pending, setPending] = useState<PendingAction | null>("loading");
  const [copied, setCopied] = useState<ShareKind | null>(null);

  const refresh = async () => {
    const [nextTokens, nextMembers] = await Promise.all([
      repository.activeShareTokens(boardId),
      repository.members(boardId),
    ]);
    setTokens(nextTokens);
    setMembers(nextMembers);
  };

  useEffect(() => {
    let active = true;
    void refresh()
      .catch((error: unknown) => {
        if (active) {
          setMessage({
            text: error instanceof Error ? error.message : "Sharing could not load.",
            error: true,
          });
        }
      })
      .finally(() => {
        if (active) setPending(null);
      });
    return () => {
      active = false;
    };
  }, [boardId, repository]);

  const act = async (
    actionKey: PendingAction,
    action: () => Promise<void>,
    success: string,
  ) => {
    setPending(actionKey);
    setMessage(null);
    try {
      await action();
      setMessage({ text: success, error: false });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Sharing action failed.",
        error: true,
      });
    } finally {
      setPending(null);
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

  const create = async (kind: ShareKind, rotate: boolean) => {
    const verb = rotate ? "rotate" : "create";
    await act(`${verb}:${kind}`, async () => {
      const token = kind === "invite"
        ? await repository.createEditorInvite(boardId, rotate)
        : await repository.createPublicShare(boardId, kind, rotate);
      setTokens((current) => ({ ...current, [kind]: token }));
      setCopied(null);
    }, `${rotate ? "Rotated" : "Created"} ${label(kind).toLowerCase()}.`);
  };

  const copy = async (kind: ShareKind, token: string) => {
    await act(`copy:${kind}`, async () => {
      if (!(await repository.isShareActive(boardId, kind, token))) {
        await refresh();
        throw new Error("This link changed or expired. Copy the current link again.");
      }
      await clipboard.copy(url(kind, token));
      setCopied(kind);
    }, `${label(kind)} copied.`);
  };

  const revoke = async (kind: ShareKind) => {
    await act(`revoke:${kind}`, async () => {
      await repository.revokeShare(boardId, kind);
      setTokens((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      setCopied(null);
    }, `${label(kind)} revoked.`);
  };

  const label = (kind: ShareKind) =>
    kind === "view" ? "Live View Link" : kind === "play" ? "Live Play Link" : "Editor Link";

  const busy = pending !== null;

  return (
    <Modal title="Share Saved Board" onClose={onClose}>
      <p className="modal-copy">
        Public and editor links are bearer links. Anyone holding an editor link can change the board without signing in.
      </p>
      <div className="cloud-share-list">
        {(["view", "play", "invite"] as const).map((kind) => (
          <section key={kind}>
            <div>
              <strong>{label(kind)}</strong>
              <span>{kind === "invite" ? "Active until rotated or revoked" : "Always follows the latest saved revision"}</span>
            </div>
            {tokens[kind] ? (
              <div className="share-token-actions">
                <button type="button" disabled={busy} onClick={() => void copy(kind, tokens[kind]!)}>
                  {pending === `copy:${kind}`
                    ? <LoaderCircle className="route-spinner" size={15} />
                    : copied === kind ? <Check size={15} /> : <Copy size={15} />}
                  {pending === `copy:${kind}` ? "Copying…" : copied === kind ? "Copied" : "Copy"}
                </button>
                <button type="button" disabled={busy} onClick={() => void create(kind, true)} title="Rotate link">
                  <RefreshCw className={pending === `rotate:${kind}` ? "route-spinner" : undefined} size={15} />
                  {pending === `rotate:${kind}` ? "Rotating…" : "Rotate"}
                </button>
                <button type="button" className="danger-icon" disabled={busy} onClick={() => void revoke(kind)} title="Revoke link">
                  {pending === `revoke:${kind}`
                    ? <LoaderCircle className="route-spinner" size={15} />
                    : <Trash2 size={15} />}
                  {pending === `revoke:${kind}` ? "Revoking…" : "Revoke"}
                </button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => void create(kind, false)}>
                {pending === `create:${kind}`
                  ? <LoaderCircle className="route-spinner" size={15} />
                  : kind === "invite" ? <UserPlus size={15} /> : <Link2 size={15} />}
                {pending === `create:${kind}` ? "Creating…" : "Create"}
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
                  <button type="button" disabled={busy} onClick={() => void act(`transfer:${uid}`, async () => {
                    await repository.transferOwnership(boardId, uid);
                    await refresh();
                  }, "Ownership transferred.")}>{pending === `transfer:${uid}` ? "Transferring…" : "Make Owner"}</button>
                  <button type="button" className="danger-icon" disabled={busy} onClick={() => void act(`remove:${uid}`, async () => {
                    await repository.removeMember(boardId, uid);
                    await refresh();
                  }, "Editor removed.")} aria-label={`Remove editor ${uid}`}>
                    {pending === `remove:${uid}` ? <LoaderCircle className="route-spinner" size={14} /> : <Trash2 size={14} />}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      {pending === "loading" && <p className="account-message" role="status">Loading sharing settings…</p>}
      {message && (
        <p className={message.error ? "form-error" : "account-message"} role={message.error ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </Modal>
  );
}
