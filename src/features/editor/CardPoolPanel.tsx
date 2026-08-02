import {
  ArrowUpAZ,
  ChevronDown,
  Clipboard,
  Download,
  FileUp,
  MapPin,
  Plus,
} from "lucide-react";
import {
  useState,
  type DragEventHandler,
} from "react";
import { Panel } from "../../components/Panel";
import type { EditorController } from "../../controllers/EditorController";
import { BoardModel } from "../../lib/model";
import type { AnswerSort } from "../../lib/sorting";
import { AnswerRow } from "./AnswerRow";

type CardPoolPanelProps = {
  controller: EditorController;
  isDragging: boolean;
  onOpenCsv: () => void;
  onDragEnter: DragEventHandler<HTMLElement>;
  onDragOver: DragEventHandler<HTMLElement>;
  onDragLeave: DragEventHandler<HTMLElement>;
  onDrop: DragEventHandler<HTMLElement>;
};

const sortLabels: Record<AnswerSort, string> = {
  manual: "Manual Order",
  alphabetical: "A–Z",
  reverse: "Z–A",
  constrained: "Locked First",
  shuffle: "Shuffle Cards",
};

/** Renders quick entry, sorting, constraints, and CSV drop affordances. */
export function CardPoolPanel({
  controller,
  isDragging,
  onOpenCsv,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: CardPoolPanelProps) {
  const [newCard, setNewCard] = useState("");
  const editor = controller.editor;
  const answerCount = controller.populatedCardCount;
  const needed = controller.neededCardCount;
  const duplicateCardIds = controller.duplicateCardIds;

  const addCard = () => {
    if (controller.addCard(newCard)) setNewCard("");
  };

  return (
    <Panel
      icon={<Clipboard size={18} />}
      title="Card Pool"
      aside={`${answerCount} / ${needed} needed`}
      className={`card-pool-panel ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="quick-add">
        <Plus size={18} />
        <input
          value={newCard}
          onChange={(event) => setNewCard(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addCard();
          }}
          placeholder="Type a card, then press Enter"
          aria-label="New card"
        />
        <button
          type="button"
          className="quick-add-submit"
          onClick={addCard}
          disabled={!newCard.trim()}
        >
          Add
        </button>
      </div>

      <div className="answer-toolbar">
        <p>
          {answerCount >= needed
            ? `${answerCount - needed} extra card${
                answerCount - needed === 1 ? "" : "s"
              } add variety.`
            : `${needed - answerCount} more required to fill the board.`}
        </p>
        <div className="answer-toolbar-actions">
          <button
            type="button"
            className={`pool-tool-button ${
              editor.placementControlsVisible ? "is-active" : ""
            }`}
            aria-pressed={editor.placementControlsVisible}
            onClick={() =>
              controller.setPlacementControlsVisible(
                !editor.placementControlsVisible,
              )
            }
          >
            <MapPin size={15} />
            {editor.placementControlsVisible ? "Hide Positions" : "Show Positions"}
          </button>
          <button
            type="button"
            className="pool-tool-button"
            onClick={onOpenCsv}
          >
            <Clipboard size={15} />
            Paste CSV
          </button>
          <button
            type="button"
            className="pool-tool-button"
            onClick={() => controller.exportCardPoolCsv()}
            disabled={answerCount === 0}
          >
            <Download size={15} />
            Export CSV
          </button>
          <label className="sort-control">
            <ArrowUpAZ size={15} />
            <span className="sort-control-value">
              {sortLabels[editor.config.sortMode]}
            </span>
            <select
              value={editor.config.sortMode}
              aria-label="Sort Card Pool"
              onChange={(event) =>
                controller.sortCards(event.target.value as AnswerSort)
              }
            >
              <option value="manual">Manual Order</option>
              <option value="alphabetical">A–Z</option>
              <option value="reverse">Z–A</option>
              <option value="constrained">Locked First</option>
              <option value="shuffle">Shuffle Cards</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </div>

      <div className="answer-list" aria-label="Board cards">
        {editor.answers.map((answer, index) => (
          <AnswerRow
            key={answer.id}
            answer={answer}
            duplicate={duplicateCardIds.has(answer.id)}
            index={index}
            size={editor.config.size}
            freeIndex={BoardModel.freeCellIndex(
              editor.config.size,
              editor.config.free,
            )}
            showPlacement={editor.placementControlsVisible}
            onChange={(patch) => controller.updateCard(answer.id, patch)}
            onDelete={() => controller.deleteCard(answer.id)}
          />
        ))}
        {!editor.answers.length && (
          <div className="empty-answers">
            <Clipboard size={24} />
            <strong>Your card pool is empty</strong>
            <span>Use quick add, paste CSV, or drop a CSV file.</span>
          </div>
        )}
      </div>
      {isDragging && (
        <div className="card-drop-overlay" role="status" aria-live="polite">
          <FileUp size={32} />
          <strong>Drop CSV Files</strong>
          <span>Cards will be imported and sorted automatically.</span>
        </div>
      )}
    </Panel>
  );
}
