import {
  ArrowUpAZ,
  ChevronDown,
  Clipboard,
  Download,
  FileUp,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useState,
  type DragEventHandler,
} from "react";
import { Panel } from "../../components/Panel";
import { ControlTooltip } from "../../components/ControlTooltip";
import type { EditorController } from "../../controllers/EditorController";
import { BoardModel } from "../../lib/model";
import { CardPoolSearch, type CardSearchRange } from "../../lib/card-pool-search";
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
  const [search] = useState(() => new CardPoolSearch());
  const [searchText, setSearchText] = useState("");
  const [searchMatches, setSearchMatches] = useState(
    () => new Map<string, readonly CardSearchRange[]>(),
  );
  const editor = controller.editor;
  const answerCount = controller.populatedCardCount;
  const needed = controller.neededCardCount;
  const duplicateCardIds = controller.duplicateCardIds;

  const addCard = () => {
    if (controller.addCard(newCard)) setNewCard("");
  };

  // Search snapshots change only here. Unrelated editor renders preserve the
  // current result membership and highlights until the user changes the query.
  const applySearch = (value: string) => {
    setSearchText(value);
    setSearchMatches(
      new Map(
        search.search(editor.answers, value).map((match) => [
          match.cardId,
          match.ranges,
        ]),
      ),
    );
  };

  const filtering = searchText.trim().length > 0;
  const visibleAnswers = editor.answers
    .map((answer, index) => ({ answer, index }))
    .filter(({ answer }) => !filtering || searchMatches.has(answer.id));

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
        <label className="answer-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search Card Pool</span>
          <input
            type="search"
            value={searchText}
            placeholder="Search cards"
            aria-label="Search Card Pool"
            onChange={(event) => applySearch(event.target.value)}
          />
          {searchText.length > 0 && (
            <button
              type="button"
              aria-label="Clear Card Pool search"
              title="Clear search"
              onClick={() => applySearch("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="answer-toolbar-actions">
          <ControlTooltip
            label={editor.placementControlsVisible ? "Hide Positions" : "Show Positions"}
          >
            <button
              type="button"
              className={`pool-tool-button icon-only ${
                editor.placementControlsVisible ? "is-active" : ""
              }`}
              aria-label={editor.placementControlsVisible ? "Hide Positions" : "Show Positions"}
              aria-pressed={editor.placementControlsVisible}
              onClick={() =>
                controller.setPlacementControlsVisible(
                  !editor.placementControlsVisible,
                )
              }
            >
              <MapPin size={16} />
            </button>
          </ControlTooltip>
          <ControlTooltip label="Paste CSV">
            <button
              type="button"
              className="pool-tool-button icon-only"
              aria-label="Paste CSV"
              onClick={onOpenCsv}
            >
              <Clipboard size={16} />
            </button>
          </ControlTooltip>
          <ControlTooltip label="Export CSV">
            <button
              type="button"
              className="pool-tool-button icon-only"
              aria-label="Export CSV"
              onClick={() => controller.exportCardPoolCsv()}
              disabled={answerCount === 0}
            >
              <Download size={16} />
            </button>
          </ControlTooltip>
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
        {visibleAnswers.map(({ answer, index }) => (
          <AnswerRow
            key={answer.id}
            answer={answer}
            duplicate={duplicateCardIds.has(answer.id)}
            index={index}
            size={editor.config.size}
            freeIndexes={BoardModel.freeCellIndexes(
              editor.config.size,
              editor.config.free,
            )}
            showPlacement={editor.placementControlsVisible}
            matchRanges={searchMatches.get(answer.id)}
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
        {!!editor.answers.length && filtering && !visibleAnswers.length && (
          <div className="empty-answers search-empty">
            <Search size={24} />
            <strong>No matching cards</strong>
            <span>Change or clear the search.</span>
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
