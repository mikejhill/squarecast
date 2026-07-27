import {
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

const logger = new RuntimeLogger("editor-page");

type EditorPageProps = {
  state: EditorState;
  onChange: StateChangeHandler;
};

/**
 * Owns editor-only presentation state and delegates board behavior to the
 * controller and domain services.
 */
export function EditorPage({ state, onChange }: EditorPageProps) {
  const controller = useMemo(
    () => new EditorController(state, onChange, applicationServices),
    [onChange, state],
  );
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState<"edit" | "play" | null>(null);
  const [isCardPoolDragging, setIsCardPoolDragging] = useState(false);
  const cardPoolDragDepth = useRef(0);
  const csvCardCount = applicationServices.csvParser.parse(csvText).length;

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
      <section className="editor-panel">
        <div className="intro">
          <p className="eyebrow">Board Studio</p>
          <h1>Make a Board. Share the Fun.</h1>
          <p>
            Add a generous card pool, pin the non-negotiables, then share one
            self-contained link.
          </p>
        </div>

        <BoardSetupPanel
          config={state.config}
          onPatch={(patch) => controller.patchConfig(patch)}
        />
        <CardPoolPanel
          controller={controller}
          isDragging={isCardPoolDragging}
          onOpenCsv={() => setCsvOpen(true)}
          onDragEnter={handleCardPoolDragEnter}
          onDragOver={handleCardPoolDragOver}
          onDragLeave={handleCardPoolDragLeave}
          onDrop={handleCardPoolDrop}
        />
      </section>

      <EditorPreviewPanel
        controller={controller}
        copied={copied}
        onCopyEditor={() => copyUrl("edit", window.location.href)}
        onCreatePlayLink={createPlayLink}
      />

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
