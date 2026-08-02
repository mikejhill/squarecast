import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { applicationServices } from "../../app/application-services";
import type { StateChangeHandler } from "../../app/types";
import { EditorController } from "../../controllers/EditorController";
import { RuntimeLogger } from "../../lib/logger";
import type { EditorState } from "../../lib/model";
import { BoardSetupPanel } from "./BoardSetupPanel";
import { CardPoolPanel } from "./CardPoolPanel";
import { EditorDialogs } from "./EditorDialogs";
import { EditorPreviewPanel } from "./EditorPreviewPanel";
import { StorageStatusBar } from "../../components/StorageStatusBar";
import type { StorageKind, WorkspaceReadySession } from "../../lib/board-repository";
import type { AuthUser } from "../../services/cloud-auth-service";
import type { BoardPresence } from "../../services/cloud-board-repository";

const logger = new RuntimeLogger("editor-page");

type EditorPageProps = {
  state: EditorState;
  onChange: StateChangeHandler;
  session: WorkspaceReadySession;
  authUser: AuthUser | null;
  guestUser: AuthUser | null;
  preferredStorage: StorageKind;
  statusMessage: string;
  presence: readonly BoardPresence[];
  editorUrl: string;
  onPreferredStorageChange: (kind: StorageKind) => void;
  onCopyToDevice: () => void;
  onCopyToCloud: () => void;
  onUseUrlOnly: () => void;
  onOpenShare: () => void;
  onOpenHistory: () => void;
  onRestoreHistorical: () => void;
  onReturnToCurrent: () => void;
};

/**
 * Owns editor-only presentation state and delegates board behavior to the
 * controller and domain services.
 */
export function EditorPage({
  state,
  onChange,
  session,
  authUser,
  guestUser,
  preferredStorage,
  statusMessage,
  presence,
  editorUrl,
  onPreferredStorageChange,
  onCopyToDevice,
  onCopyToCloud,
  onUseUrlOnly,
  onOpenShare,
  onOpenHistory,
  onRestoreHistorical,
  onReturnToCurrent,
}: EditorPageProps) {
  const controller = useMemo(
    () => new EditorController(state, onChange, applicationServices),
    [onChange, state],
  );
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [boardImportError, setBoardImportError] = useState("");
  const [copied, setCopied] = useState<"edit" | "play" | null>(null);
  const [isCardPoolDragging, setIsCardPoolDragging] = useState(false);
  const cardPoolDragDepth = useRef(0);
  const csvCardCount = applicationServices.csvParser.parse(csvText).length;

  // An invalid-file message belongs only to the state against which that
  // import was attempted. Any successful edit or navigation clears it.
  useEffect(() => {
    setBoardImportError("");
  }, [state]);

  const hasDraggedFiles = (event: ReactDragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleCardPoolDragEnter = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    cardPoolDragDepth.current += 1;
    setIsCardPoolDragging(true);
  };

  const handleCardPoolDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCardPoolDragLeave = (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    cardPoolDragDepth.current = Math.max(0, cardPoolDragDepth.current - 1);
    if (cardPoolDragDepth.current === 0) setIsCardPoolDragging(false);
  };

  const handleCardPoolDrop = async (event: ReactDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    cardPoolDragDepth.current = 0;
    setIsCardPoolDragging(false);
    try {
      await controller.importCsvFiles(Array.from(event.dataTransfer.files));
    } catch (error) {
      logger.error("The dropped CSV import did not complete.", error);
    }
  };

  const importCsv = () => {
    if (!controller.importCsvText(csvText)) return;
    setCsvOpen(false);
    setCsvText("");
  };

  const importBoardJson = async (file: File) => {
    try {
      controller.importBoardJson(await file.text());
      setBoardImportError("");
    } catch (error) {
      logger.warn("A selected board file could not be imported.", {
        fileName: file.name,
        errorType: error instanceof Error ? error.name : "Unknown",
      });
      setBoardImportError(
        "This is not a valid Squarecast board file. Check the JSON format and try again.",
      );
    }
  };

  const copyUrl = async (kind: "edit" | "play", text: string) => {
    try {
      await controller.copyUrl(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch (error) {
      logger.error("A link copy action failed.", error, { kind });
    }
  };

  const createPlayLink = () => {
    const url = controller.createPlayLink(window.location.href);
    if (url) setShareUrl(url);
  };

  return (
    <main className="editor-shell">
      <StorageStatusBar
        session={session}
        authUser={authUser}
        guestUser={guestUser}
        preferredStorage={preferredStorage}
        statusMessage={statusMessage}
        presence={presence}
        onPreferredStorageChange={onPreferredStorageChange}
        onCopyToDevice={onCopyToDevice}
        onCopyToCloud={onCopyToCloud}
        onUseUrlOnly={onUseUrlOnly}
        onOpenShare={onOpenShare}
        onOpenHistory={onOpenHistory}
        onRestoreHistorical={onRestoreHistorical}
        onReturnToCurrent={onReturnToCurrent}
      />
      <BoardSetupPanel
        config={state.config}
        collapsed={state.setupCollapsed}
        importError={boardImportError}
        onPatch={(patch) => controller.patchConfig(patch)}
        onCollapsedChange={(collapsed) =>
          controller.setSetupCollapsed(collapsed)
        }
        onImportJson={importBoardJson}
        onExportJson={() => controller.exportBoardJson()}
      />

      <section className="editor-workspace">
        <div className="editor-panel">
          <CardPoolPanel
            controller={controller}
            isDragging={isCardPoolDragging}
            onOpenCsv={() => setCsvOpen(true)}
            onDragEnter={handleCardPoolDragEnter}
            onDragOver={handleCardPoolDragOver}
            onDragLeave={handleCardPoolDragLeave}
            onDrop={handleCardPoolDrop}
          />
        </div>

        <EditorPreviewPanel
          controller={controller}
          copied={copied}
          onCopyEditor={() => copyUrl("edit", editorUrl)}
          onCreatePlayLink={createPlayLink}
        />
      </section>

      <EditorDialogs
        csvOpen={csvOpen}
        csvText={csvText}
        csvCardCount={csvCardCount}
        shareUrl={shareUrl}
        copied={copied}
        onCsvTextChange={setCsvText}
        onCloseCsv={() => setCsvOpen(false)}
        onImportCsv={importCsv}
        onCloseShare={() => setShareUrl("")}
        onCopyPlay={() => copyUrl("play", shareUrl)}
      />
    </main>
  );
}
