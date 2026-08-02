import {
  Check,
  Dices,
  Link2,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { BoardPreview } from "../../components/BoardPreview";
import { ValidationCard } from "../../components/ValidationCard";
import type { EditorController } from "../../controllers/EditorController";
import type { PlayState } from "../../lib/model";
import { RouteLink } from "../../components/RouteLink";

type EditorPreviewPanelProps = {
  controller: EditorController;
  copied: "edit" | "play" | null;
  testBoard: PlayState | null;
  testBoardUrl?: string;
  onCopyEditor: () => void;
  onCreatePlayLink: () => void;
};

/** Renders the sticky preview and all editor-to-play actions. */
export function EditorPreviewPanel({
  controller,
  copied,
  testBoard,
  testBoardUrl,
  onCopyEditor,
  onCreatePlayLink,
}: EditorPreviewPanelProps) {
  const validation = controller.validation;
  return (
    <aside className="preview-panel">
      <div className="preview-topline">
        <span>Live Preview</span>
        <button
          type="button"
          className="preview-shuffle-button"
          onClick={() => controller.shufflePreview()}
        >
          <Shuffle size={15} />
          Shuffle Preview
        </button>
      </div>
      <BoardPreview editor={controller.editor} />
      <ValidationCard validation={validation} />
      <RouteLink
        href={testBoardUrl}
        disabled={!testBoard}
        className="share-play-action"
        onNavigate={() => controller.openTestBoard(testBoard)}
      >
        <Sparkles size={19} />
        Test This Board
        <span aria-hidden="true">→</span>
      </RouteLink>
      <button
        type="button"
        className="copy-editor-action"
        onClick={onCopyEditor}
      >
        {copied === "edit" ? <Check size={21} /> : <Link2 size={21} />}
        <span>
          <strong>
            {copied === "edit" ? "Editor Link Copied" : "Copy Editor Link"}
          </strong>
          <small>Save or share this editable board</small>
        </span>
      </button>
      <button
        type="button"
        className="primary-action"
        disabled={!validation.valid}
        onClick={onCreatePlayLink}
      >
        <Dices size={19} />
        Create Play Link
        <span aria-hidden="true">→</span>
      </button>
    </aside>
  );
}
