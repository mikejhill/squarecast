import {
  Check,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Modal } from "../../components/Modal";

type EditorDialogsProps = {
  csvOpen: boolean;
  csvText: string;
  csvCardCount: number;
  shareUrl: string;
  copied: "edit" | "play" | null;
  onCsvTextChange: (value: string) => void;
  onCloseCsv: () => void;
  onImportCsv: () => void;
  onCloseShare: () => void;
  onCopyPlay: () => void;
};

/** Renders the transient CSV and play-link dialogs. */
export function EditorDialogs({
  csvOpen,
  csvText,
  csvCardCount,
  shareUrl,
  copied,
  onCsvTextChange,
  onCloseCsv,
  onImportCsv,
  onCloseShare,
  onCopyPlay,
}: EditorDialogsProps) {
  return (
    <>
      {csvOpen && (
        <Modal title="Paste CSV Cards" onClose={onCloseCsv}>
          <p className="modal-copy">
            Paste rows, columns, or quoted values. Every non-empty CSV cell
            becomes one card.
          </p>
          <textarea
            className="csv-input"
            value={csvText}
            onChange={(event) => onCsvTextChange(event.target.value)}
            placeholder={'Card one,Card two\n"Card with, a comma"'}
            autoFocus
          />
          <div className="modal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={onImportCsv}
              disabled={!csvCardCount}
            >
              Import {csvCardCount || ""} Cards
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onCloseCsv}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {shareUrl && (
        <Modal title="Your Play Link Is Ready" onClose={onCloseShare}>
          <div className="share-hero">
            <span>
              <Sparkles size={24} />
            </span>
            <p>
              Each person who opens this link gets a fresh randomized board.
              Their marks then stay in their own URL.
            </p>
          </div>
          <label className="field field-wide">
            <span>Play link</span>
            <div className="link-field">
              <input
                value={shareUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <button type="button" onClick={onCopyPlay}>
                {copied === "play" ? (
                  <Check size={17} />
                ) : (
                  <Copy size={17} />
                )}
                {copied === "play" ? "Copied" : "Copy"}
              </button>
            </div>
          </label>
          <div className="modal-actions">
            <a
              className="primary-button"
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open play board
              <ExternalLink size={16} />
            </a>
            <button
              type="button"
              className="secondary-button"
              onClick={onCloseShare}
            >
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
