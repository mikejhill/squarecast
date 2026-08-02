import { Copy, Dices } from "lucide-react";
import { BoardPreview } from "../components/BoardPreview";
import type { EditorState } from "../lib/model";

type PublicBoardPageProps = {
  editor: EditorState;
  onPlay: () => void;
  onEditCopy: () => void;
};

/** Renders a live public board without exposing mutation controls. */
export function PublicBoardPage({ editor, onPlay, onEditCopy }: PublicBoardPageProps) {
  return (
    <main className="public-board-shell">
      <header>
        <span>Shared Board</span>
        <h1>{editor.config.title || "Untitled Board"}</h1>
        <p>This view follows the owner’s latest saved revision.</p>
      </header>
      <div className="public-board-preview">
        <BoardPreview editor={editor} />
      </div>
      <div className="public-board-actions">
        <button type="button" className="primary-button" onClick={onPlay}>
          <Dices size={17} /> Play This Board
        </button>
        <button type="button" className="secondary-button" onClick={onEditCopy}>
          <Copy size={17} /> Edit a Copy
        </button>
      </div>
    </main>
  );
}
