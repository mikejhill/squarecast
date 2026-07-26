import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Dices,
  ExternalLink,
  Link2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { decodeState, encodeState, stateUrl } from "./lib/codec";
import { parseCsvAnswers } from "./lib/csv";
import {
  generateBoard,
  validateEditor,
  winningCells,
} from "./lib/generator";
import {
  blankSquareCount,
  createDefaultEditor,
  freeCellIndex,
  makeId,
  type Answer,
  type EditorState,
  type Placement,
  type PlayCell,
  type PlayState,
  type Theme,
} from "./lib/model";

type ActiveState = EditorState | PlayState;

function randomSeed(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

function loadInitialState(): ActiveState {
  const decoded = decodeState(window.location.hash);
  if (decoded?.mode === "launch") {
    return generateBoard(decoded.source, randomSeed());
  }
  if (decoded?.mode === "edit" || decoded?.mode === "play") return decoded;
  return createDefaultEditor();
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function App() {
  const [state, setState] = useState<ActiveState>(loadInitialState);

  useEffect(() => {
    window.history.replaceState(null, "", encodeState(state));
  }, [state]);

  return (
    <div className="app" data-theme={state.mode === "edit" ? state.config.theme : state.theme}>
      <SiteHeader mode={state.mode} />
      {state.mode === "edit" ? (
        <Editor state={state} onChange={setState} />
      ) : (
        <Player state={state} onChange={setState} />
      )}
    </div>
  );
}

function SiteHeader({ mode }: { mode: "edit" | "play" }) {
  return (
    <header className="site-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>
          <strong>Squarecast</strong>
          <small>URL-native bingo boards</small>
        </span>
      </div>
      <div className="mode-pill">
        {mode === "edit" ? <Settings2 size={15} /> : <Sparkles size={15} />}
        {mode === "edit" ? "Studio" : "Live board"}
      </div>
    </header>
  );
}

function Editor({
  state,
  onChange,
}: {
  state: EditorState;
  onChange: (state: ActiveState) => void;
}) {
  const [newAnswer, setNewAnswer] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState<"edit" | "play" | null>(null);
  const validation = useMemo(() => validateEditor(state), [state]);
  const needed = blankSquareCount(state);
  const answerCount = state.answers.filter((answer) => answer.text.trim()).length;

  const patchConfig = (patch: Partial<EditorState["config"]>) => {
    const config = { ...state.config, ...patch };
    let answers = state.answers;
    if (patch.size !== undefined || patch.free !== undefined) {
      const freeIndex = freeCellIndex(config.size, config.free);
      answers = answers.map((answer) => {
        const placement = answer.placement;
        const invalid =
          (placement.kind === "cell" &&
            (placement.index >= config.size ** 2 || placement.index === freeIndex)) ||
          ((placement.kind === "row" || placement.kind === "column") &&
            placement.index >= config.size);
        return invalid ? { ...answer, placement: { kind: "any" as const } } : answer;
      });
    }
    onChange({ ...state, config, answers });
  };

  const addAnswer = (text = newAnswer, afterId?: string) => {
    const value = text.trim();
    if (!value) return;
    const answer: Answer = { id: makeId(), text: value, placement: { kind: "any" } };
    const answers = [...state.answers];
    if (afterId) {
      const index = answers.findIndex((item) => item.id === afterId);
      answers.splice(index + 1, 0, answer);
    } else {
      answers.push(answer);
      setNewAnswer("");
    }
    onChange({ ...state, answers });
  };

  const updateAnswer = (id: string, patch: Partial<Answer>) => {
    onChange({
      ...state,
      answers: state.answers.map((answer) =>
        answer.id === id ? { ...answer, ...patch } : answer,
      ),
    });
  };

  const deleteAnswer = (id: string) => {
    onChange({ ...state, answers: state.answers.filter((answer) => answer.id !== id) });
  };

  const importCsv = () => {
    const values = parseCsvAnswers(csvText);
    if (!values.length) return;
    onChange({
      ...state,
      answers: [
        ...state.answers,
        ...values.map((text) => ({
          id: makeId(),
          text,
          placement: { kind: "any" as const },
        })),
      ],
    });
    setCsvOpen(false);
    setCsvText("");
  };

  const createPlayLink = () => {
    if (!validation.valid) return;
    setShareUrl(
      stateUrl({ v: 1, mode: "launch", source: state }, window.location.href),
    );
  };

  const doCopy = async (kind: "edit" | "play", text: string) => {
    await copyText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  return (
    <main className="editor-shell">
      <section className="editor-panel">
        <div className="intro">
          <p className="eyebrow">Board studio</p>
          <h1>Build it once. Let every board land differently.</h1>
          <p>
            Add a generous answer pool, pin the non-negotiables, then share one
            self-contained link.
          </p>
        </div>

        <Panel
          icon={<Settings2 size={18} />}
          title="Board setup"
          aside={`${state.config.size} × ${state.config.size}`}
        >
          <label className="field field-wide">
            <span>Board title</span>
            <input
              value={state.config.title}
              onChange={(event) => patchConfig({ title: event.target.value })}
              placeholder="Friday team bingo"
              maxLength={80}
            />
          </label>

          <div className="field">
            <span>Board size</span>
            <div className="segmented" aria-label="Board size">
              {[3, 4, 5, 6, 7].map((size) => (
                <button
                  type="button"
                  className={state.config.size === size ? "active" : ""}
                  aria-pressed={state.config.size === size}
                  onClick={() => patchConfig({ size })}
                  key={size}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <label className="toggle-row">
            <span>
              <strong>Centered free square</strong>
              <small>Automatically marked for every player</small>
            </span>
            <input
              type="checkbox"
              checked={state.config.free}
              onChange={(event) => patchConfig({ free: event.target.checked })}
            />
            <span className="toggle" aria-hidden="true" />
          </label>

          {state.config.free && (
            <label className="field">
              <span>Free-square label</span>
              <input
                value={state.config.freeLabel}
                onChange={(event) => patchConfig({ freeLabel: event.target.value })}
                placeholder="FREE"
                maxLength={36}
              />
            </label>
          )}

          <div className="field">
            <span>Color theme</span>
            <div className="theme-row">
              {(["ink", "coral", "mint", "violet"] as Theme[]).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  className={`theme-swatch theme-${theme} ${
                    state.config.theme === theme ? "selected" : ""
                  }`}
                  aria-label={`${theme} theme`}
                  aria-pressed={state.config.theme === theme}
                  onClick={() => patchConfig({ theme })}
                >
                  {state.config.theme === theme && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Clipboard size={18} />}
          title="Answer pool"
          aside={`${answerCount} / ${needed} needed`}
        >
          <div className="quick-add">
            <Plus size={18} />
            <input
              value={newAnswer}
              onChange={(event) => setNewAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addAnswer();
              }}
              placeholder="Type an answer, then press Enter"
              aria-label="New answer"
            />
            <button type="button" onClick={() => addAnswer()} disabled={!newAnswer.trim()}>
              Add
            </button>
          </div>

          <div className="answer-toolbar">
            <p>
              {answerCount >= needed
                ? `${answerCount - needed} extra answer${answerCount - needed === 1 ? "" : "s"} add variety.`
                : `${needed - answerCount} more required to fill the board.`}
            </p>
            <button type="button" className="text-button" onClick={() => setCsvOpen(true)}>
              <Clipboard size={15} />
              Paste CSV
            </button>
          </div>

          <div className="answer-list" aria-label="Board answers">
            {state.answers.map((answer, index) => (
              <AnswerRow
                key={answer.id}
                answer={answer}
                index={index}
                size={state.config.size}
                freeIndex={freeCellIndex(state.config.size, state.config.free)}
                onChange={(patch) => updateAnswer(answer.id, patch)}
                onDelete={() => deleteAnswer(answer.id)}
                onEnter={() => addAnswer("New answer", answer.id)}
              />
            ))}
            {!state.answers.length && (
              <div className="empty-answers">
                <Clipboard size={24} />
                <strong>Your answer pool is empty</strong>
                <span>Use quick add or paste a CSV list.</span>
              </div>
            )}
          </div>
        </Panel>
      </section>

      <aside className="preview-panel">
        <div className="preview-topline">
          <span>Live preview</span>
          <button
            type="button"
            className="text-button compact"
            onClick={() => doCopy("edit", window.location.href)}
          >
            {copied === "edit" ? <Check size={15} /> : <Link2 size={15} />}
            {copied === "edit" ? "Copied" : "Copy edit URL"}
          </button>
        </div>
        <BoardPreview editor={state} />
        <ValidationCard validation={validation} />
        <button
          type="button"
          className="primary-action"
          disabled={!validation.valid}
          onClick={createPlayLink}
        >
          <Dices size={19} />
          Create play link
          <span aria-hidden="true">→</span>
        </button>
        <p className="privacy-note">
          Nothing is uploaded. This board lives entirely in its URL.
        </p>
      </aside>

      {csvOpen && (
        <Modal title="Paste CSV answers" onClose={() => setCsvOpen(false)}>
          <p className="modal-copy">
            Paste rows, columns, or quoted values. Every non-empty CSV cell becomes
            one answer.
          </p>
          <textarea
            className="csv-input"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={'Answer one,Answer two\n"Answer with, a comma"'}
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setCsvOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={importCsv}
              disabled={!parseCsvAnswers(csvText).length}
            >
              Import {parseCsvAnswers(csvText).length || ""} answers
            </button>
          </div>
        </Modal>
      )}

      {shareUrl && (
        <Modal title="Your play link is ready" onClose={() => setShareUrl("")}>
          <div className="share-hero">
            <span><Sparkles size={24} /></span>
            <p>
              Each person who opens this link gets a fresh randomized board. Their
              marks then stay in their own URL.
            </p>
          </div>
          <label className="field field-wide">
            <span>Play link</span>
            <div className="link-field">
              <input value={shareUrl} readOnly onFocus={(event) => event.target.select()} />
              <button type="button" onClick={() => doCopy("play", shareUrl)}>
                {copied === "play" ? <Check size={17} /> : <Copy size={17} />}
                {copied === "play" ? "Copied" : "Copy"}
              </button>
            </div>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setShareUrl("")}>
              Done
            </button>
            <a className="primary-button" href={shareUrl} target="_blank" rel="noreferrer">
              Open play board
              <ExternalLink size={16} />
            </a>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Panel({
  icon,
  title,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  aside: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <span className="panel-icon">{icon}</span>
        <h2>{title}</h2>
        <span className="panel-aside">{aside}</span>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function AnswerRow({
  answer,
  index,
  size,
  freeIndex,
  onChange,
  onDelete,
  onEnter,
}: {
  answer: Answer;
  index: number;
  size: number;
  freeIndex: number | null;
  onChange: (patch: Partial<Answer>) => void;
  onDelete: () => void;
  onEnter: () => void;
}) {
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
      onEnter();
    }
  };

  return (
    <div className="answer-row">
      <span className="answer-number">{index + 1}</span>
      <input
        value={answer.text}
        onChange={(event) => onChange({ text: event.target.value })}
        onKeyDown={handleKey}
        aria-label={`Answer ${index + 1}`}
      />
      <div className={`placement ${answer.placement.kind !== "any" ? "locked" : ""}`}>
        {answer.placement.kind !== "any" && <LockKeyhole size={13} />}
        <select
          value={selectValue}
          onChange={(event) => onChange({ placement: parsePlacement(event.target.value) })}
          aria-label={`Placement for answer ${index + 1}`}
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
              cell === freeIndex ? null : (
                <option key={`cell-${cell}`} value={`cell:${cell}`}>
                  Cell {Math.floor(cell / size) + 1}·{(cell % size) + 1}
                </option>
              ),
            )}
          </optgroup>
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      <button
        type="button"
        className="icon-button delete-button"
        onClick={onDelete}
        aria-label={`Delete answer ${index + 1}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function BoardPreview({ editor }: { editor: EditorState }) {
  const validation = validateEditor(editor);
  let cells: PlayCell[];
  if (validation.valid) {
    cells = generateBoard(editor, "squarecast-preview").cells;
  } else {
    const freeIndex = freeCellIndex(editor.config.size, editor.config.free);
    const answers = editor.answers.filter((answer) => answer.text.trim());
    let cursor = 0;
    cells = Array.from({ length: editor.config.size ** 2 }, (_, index) => {
      if (index === freeIndex) {
        return { id: "__free__", text: editor.config.freeLabel || "FREE", free: true };
      }
      const answer = answers[cursor++];
      return {
        id: answer?.id || `placeholder-${index}`,
        text: answer?.text || "Add answer",
      };
    });
  }

  return (
    <div className="board-frame preview-board">
      <div className="board-heading">
        <span>PLAY</span>
        <h2>{editor.config.title || "Untitled board"}</h2>
        <span>WIN</span>
      </div>
      <div
        className="board-grid"
        style={{ "--board-size": editor.config.size } as React.CSSProperties}
      >
        {cells.map((cell, index) => (
          <div
            className={`board-cell ${cell.free ? "free-cell checked" : ""} ${
              cell.id.startsWith("placeholder") ? "placeholder-cell" : ""
            }`}
            key={`${cell.id}-${index}`}
          >
            <AutoFitText text={cell.text} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationCard({
  validation,
}: {
  validation: ReturnType<typeof validateEditor>;
}) {
  if (validation.valid && !validation.warnings.length) {
    return (
      <div className="status-card valid">
        <span><Check size={16} /></span>
        <p><strong>Ready to cast</strong>Your board rules fit cleanly.</p>
      </div>
    );
  }
  const messages = validation.errors.length ? validation.errors : validation.warnings;
  return (
    <div className={`status-card ${validation.valid ? "warning" : "invalid"}`}>
      <span>{validation.valid ? "!" : "×"}</span>
      <p><strong>{validation.valid ? "Check this" : "Needs attention"}</strong>{messages[0]}</p>
    </div>
  );
}

function Player({
  state,
  onChange,
}: {
  state: PlayState;
  onChange: (state: ActiveState) => void;
}) {
  const [copied, setCopied] = useState(false);
  const wins = winningCells(state);
  const hasWin = wins.size > 0;

  const toggleCell = (index: number) => {
    if (state.cells[index].free) return;
    const checked = new Set(state.checked);
    if (checked.has(index)) checked.delete(index);
    else checked.add(index);
    onChange({ ...state, checked: [...checked].sort((a, b) => a - b) });
  };

  const reshuffle = () => {
    onChange(generateBoard(state.source, randomSeed()));
  };

  const copySession = async () => {
    await copyText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="play-shell">
      <div className="play-toolbar">
        <button type="button" className="text-button" onClick={() => onChange(state.source)}>
          <ArrowLeft size={16} />
          Edit source
        </button>
        <div className="play-actions">
          <button type="button" className="secondary-button compact-button" onClick={reshuffle}>
            <RotateCcw size={16} />
            New shuffle
          </button>
          <button type="button" className="secondary-button compact-button" onClick={copySession}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy session"}
          </button>
        </div>
      </div>

      <div className="play-title">
        <p className="eyebrow">Your randomized board</p>
        <h1>{state.title}</h1>
        <p>Tap a square when it happens. Complete any row, column, or diagonal.</p>
      </div>

      {hasWin && (
        <div className="win-banner" role="status">
          <Sparkles size={20} />
          <strong>Bingo.</strong>
          You completed a line.
        </div>
      )}

      <div className="board-frame play-board">
        <div className="board-heading">
          <span>SQUARE</span>
          <h2>{hasWin ? "BINGO!" : "MARK IT"}</h2>
          <span>CAST</span>
        </div>
        <div
          className="board-grid"
          style={{ "--board-size": state.size } as React.CSSProperties}
          aria-label={`${state.size} by ${state.size} bingo board`}
        >
          {state.cells.map((cell, index) => {
            const checked = state.checked.includes(index);
            return (
              <button
                type="button"
                className={`board-cell play-cell ${checked ? "checked" : ""} ${
                  cell.free ? "free-cell" : ""
                } ${wins.has(index) ? "winning" : ""}`}
                key={`${cell.id}-${index}`}
                aria-pressed={checked}
                aria-label={`${cell.text}${cell.free ? ", free square" : ""}`}
                onClick={() => toggleCell(index)}
              >
                <AutoFitText text={cell.text} />
                <span className="check-mark" aria-hidden="true"><Check size={18} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="play-footnote">
        {state.checked.length} of {state.size ** 2} marked · Your progress is stored in this URL
      </p>
    </main>
  );
}

function AutoFitText({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const parent = element.parentElement;
    if (!parent) return;

    const fit = () => {
      let low = 8;
      let high = 30;
      for (let step = 0; step < 7; step += 1) {
        const mid = (low + high) / 2;
        element.style.fontSize = `${mid}px`;
        if (
          element.scrollWidth <= parent.clientWidth - 18 &&
          element.scrollHeight <= parent.clientHeight - 18
        ) {
          low = mid;
        } else {
          high = mid;
        }
      }
      element.style.fontSize = `${low}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [text]);

  return <span ref={ref} className="auto-fit">{text}</span>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
