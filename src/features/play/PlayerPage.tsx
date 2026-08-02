import {
  ArrowLeft,
  Check,
  Copy,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { applicationServices } from "../../app/application-services";
import type { StateChangeHandler } from "../../app/types";
import { AutoFitText } from "../../components/AutoFitText";
import { PlayerController } from "../../controllers/PlayerController";
import { RuntimeLogger } from "../../lib/logger";
import type { PlayState } from "../../lib/model";
import { RouteLink } from "../../components/RouteLink";

const logger = new RuntimeLogger("player-page");

type PlayerPageProps = {
  state: PlayState;
  onChange: StateChangeHandler;
};

/** Renders and coordinates one URL-persisted play session. */
export function PlayerPage({ state, onChange }: PlayerPageProps) {
  const controller = useMemo(
    () => new PlayerController(state, onChange, applicationServices),
    [onChange, state],
  );
  const [copied, setCopied] = useState(false);
  const wins = controller.winningCells;
  const hasWin = wins.size > 0;
  const shuffle = useMemo(() => controller.createShuffle(), [controller]);
  const shuffleUrl = useMemo(
    () => applicationServices.codec.createUrl(shuffle, window.location.href),
    [shuffle],
  );
  const editorUrl = useMemo(
    () => applicationServices.codec.createUrl(state.source, window.location.href),
    [state.source],
  );

  const copySession = async () => {
    try {
      await controller.copySession(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      logger.error("The play-session copy action failed.", error);
    }
  };

  return (
    <main className="play-shell">
      <div className="play-toolbar">
        <RouteLink
          href={editorUrl}
          className="text-button"
          onNavigate={() => controller.editSource()}
        >
          <ArrowLeft size={16} />
          Edit This Board
        </RouteLink>
        <div className="play-actions">
          <RouteLink
            href={shuffleUrl}
            className="secondary-button compact-button"
            onNavigate={() => controller.openShuffle(shuffle)}
          >
            <RotateCcw size={16} />
            New Shuffle
          </RouteLink>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={copySession}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy Session"}
          </button>
        </div>
      </div>

      <div className="play-title">
        <p className="eyebrow">Your Randomized Board</p>
        <h1>{state.title}</h1>
        <p>
          Tap a square when it happens. Complete any row, column, or diagonal.
        </p>
      </div>

      <div className="play-board-stage">
        {hasWin && (
          <div className="win-banner" role="status">
            <Sparkles size={20} />
            <strong>Bingo.</strong>
            You completed a line.
          </div>
        )}

        <div className="board-frame play-board">
          <div className="board-heading">
            <span>{hasWin ? "COMPLETED" : "BINGO BOARD"}</span>
            <h2>{state.title}</h2>
            <span>
              {state.size} × {state.size}
            </span>
          </div>
          <div
            className="board-grid"
            style={{ "--board-size": state.size } as CSSProperties}
            aria-label={`${state.size} by ${state.size} bingo board`}
          >
            {state.cells.map((cell, index) => {
              const checked = state.checked.includes(index);
              return (
                <button
                  type="button"
                  className={`board-cell play-cell ${
                    checked ? "checked" : ""
                  } ${cell.free ? "free-cell" : ""} ${
                    wins.has(index) ? "winning" : ""
                  }`}
                  key={`${cell.id}-${index}`}
                  aria-pressed={checked}
                  aria-label={`${cell.text}${
                    cell.free ? ", free square" : ""
                  }`}
                  onClick={() => controller.toggleCell(index)}
                >
                  <AutoFitText
                    text={cell.text}
                    mode={state.fontMode}
                    fixedSize={state.fontSize}
                  />
                  <span className="check-mark" aria-hidden="true">
                    <Check size={18} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="play-footnote">
        {state.checked.length} of {state.size ** 2} marked · Your progress is
        stored in this URL
      </p>
    </main>
  );
}
