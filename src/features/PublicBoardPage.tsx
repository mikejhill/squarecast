import { Copy, Dices } from "lucide-react";
import { BoardPreview } from "../components/BoardPreview";
import type { EditorState } from "../lib/model";
import { RouteLink } from "../components/RouteLink";

type PublicBoardPageProps = {
  editor: EditorState;
  playUrl: string;
  onPlay: () => void;
  onEditCopy: () => void;
};

/** Renders a live public board without exposing mutation controls. */
export function PublicBoardPage({ editor, playUrl, onPlay, onEditCopy }: PublicBoardPageProps) {
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
        <RouteLink href={playUrl} className="primary-button" onNavigate={onPlay}>
          <Dices size={17} /> Play This Board
        </RouteLink>
        <button type="button" className="secondary-button" onClick={onEditCopy}>
          <Copy size={17} /> Edit a Copy
        </button>
      </div>
    </main>
  );
}
