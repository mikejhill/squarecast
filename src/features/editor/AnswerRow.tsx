import {
  ChevronDown,
  LockKeyhole,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { MatchedText } from "../../components/MatchedText";
import type { CardSearchRange } from "../../lib/card-pool-search";
import type { Answer, Placement } from "../../lib/model";

type AnswerRowProps = {
  answer: Answer;
  duplicate: boolean;
  index: number;
  size: number;
  freeIndexes: readonly number[];
  showPlacement: boolean;
  matchRanges?: readonly CardSearchRange[];
  onChange: (patch: Partial<Answer>) => void;
  onDelete: () => void;
};

/** Edits one card's text and placement constraint without owning board state. */
export function AnswerRow({
  answer,
  duplicate,
  index,
  size,
  freeIndexes,
  showPlacement,
  matchRanges,
  onChange,
  onDelete,
}: AnswerRowProps) {
  const selectValue =
    answer.placement.kind === "any"
      ? "any"
      : `${answer.placement.kind}:${answer.placement.index}`;

  const parsePlacement = (value: string): Placement => {
    if (value === "any") return { kind: "any" };
    const [kind, rawIndex] = value.split(":");
    return {
      kind: kind as "cell" | "row" | "column",
      index: Number(rawIndex),
    };
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div className={`answer-row ${showPlacement ? "has-placement-controls" : ""}`}>
      <span className="answer-number">{index + 1}</span>
      <div className="card-text-field">
        <div className="card-text-editor">
          <input
            className={matchRanges?.length ? "has-search-highlight" : undefined}
            value={answer.text}
            onChange={(event) => onChange({ text: event.target.value })}
            onKeyDown={handleKey}
            onBlur={(event) => {
              event.currentTarget.scrollLeft = 0;
            }}
            aria-label={`Card ${index + 1}`}
          />
          {!!matchRanges?.length && (
            <span className="card-search-highlight" aria-hidden="true">
              <MatchedText text={answer.text} ranges={matchRanges} />
            </span>
          )}
        </div>
        {duplicate && (
          <span
            className="duplicate-card-warning"
            role="img"
            tabIndex={0}
            title="Duplicate card text. This card appears more than once."
            aria-label="Warning: duplicate card text. This card appears more than once."
          >
            <TriangleAlert size={17} />
          </span>
        )}
      </div>
      {showPlacement && (
        <div
          className={`placement ${
            answer.placement.kind !== "any" ? "locked" : ""
          }`}
        >
          {answer.placement.kind !== "any" && <LockKeyhole size={13} />}
          <select
            value={selectValue}
            onChange={(event) =>
              onChange({ placement: parsePlacement(event.target.value) })
            }
            aria-label={`Position for card ${index + 1}`}
          >
            <option value="any">Anywhere</option>
            <optgroup label="Specific row">
              {Array.from({ length: size }, (_, row) => (
                <option key={`row-${row}`} value={`row:${row}`}>
                  Row {row + 1}
                </option>
              ))}
            </optgroup>
            <optgroup label="Specific column">
              {Array.from({ length: size }, (_, column) => (
                <option key={`column-${column}`} value={`column:${column}`}>
                  Column {column + 1}
                </option>
              ))}
            </optgroup>
            <optgroup label="Exact square">
              {Array.from({ length: size ** 2 }, (_, cell) =>
                freeIndexes.includes(cell) ? null : (
                  <option key={`cell-${cell}`} value={`cell:${cell}`}>
                    Cell {Math.floor(cell / size) + 1}·{(cell % size) + 1}
                  </option>
                ),
              )}
            </optgroup>
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
      )}
      <button
        type="button"
        className="icon-button delete-button"
        onClick={onDelete}
        aria-label={`Delete card ${index + 1}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
