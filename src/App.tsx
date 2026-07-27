import {
  ArrowLeft,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Dices,
  ExternalLink,
  Github,
  Link2,
  LockKeyhole,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Sun,
  Trash2,
  Type,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { StateCodec } from "./lib/codec";
import { CsvAnswerParser } from "./lib/csv";
import { FontSizeOptimizer } from "./lib/font-size";
import { BoardGenerator, type ValidationResult } from "./lib/generator";
import {
  BoardModel,
  IdFactory,
  type Answer,
  type EditorState,
  type Placement,
  type PlayCell,
  type PlayState,
} from "./lib/model";
import { AnswerPoolSorter, type AnswerSort } from "./lib/sorting";
import { AppearanceResolver, ColorTheme } from "./lib/theme";

type ActiveState = EditorState | PlayState;

class ClipboardService {
  public async copy(text: string): Promise<void> {
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
}

class ApplicationStateService {
  public constructor(
    private readonly codec: StateCodec,
    private readonly generator: BoardGenerator,
  ) {}

  public load(hash: string): ActiveState {
    const decoded = this.codec.decode(hash);
    if (decoded?.mode === "launch") {
      return this.generator.generate(decoded.source, IdFactory.seed());
    }
    if (decoded?.mode === "edit" || decoded?.mode === "play") return decoded;
    return BoardModel.createDefaultEditor();
  }
}

const codec = new StateCodec();
const generator = new BoardGenerator();
const csvParser = new CsvAnswerParser();
const sorter = new AnswerPoolSorter();
const appearanceResolver = new AppearanceResolver();
const fontSizeOptimizer = new FontSizeOptimizer();
const clipboard = new ClipboardService();
const stateService = new ApplicationStateService(codec, generator);

export function App() {
  const [state, setState] = useState<ActiveState>(() =>
    stateService.load(window.location.hash),
  );
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    window.history.replaceState(null, "", codec.encode(state));
  }, [state]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent): void =>
      setSystemIsDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const config = state.mode === "edit" ? state.config : state.source.config;
  const resolvedAppearance = appearanceResolver.resolve(
    config.appearance,
    systemIsDark,
  );

  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedAppearance;
    document.body.style.backgroundColor =
      resolvedAppearance === "dark" ? "#111114" : "#f4f1eb";
    const themeColor = document.querySelector<HTMLMetaElement>("#theme-color");
    themeColor?.setAttribute(
      "content",
      resolvedAppearance === "dark" ? "#111114" : "#f4f1eb",
    );
  }, [resolvedAppearance]);

  return (
    <div
      className={`app is-${resolvedAppearance}`}
      data-appearance={config.appearance}
      data-theme={config.theme}
      style={ColorTheme.style(config.accentColor)}
    >
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
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Squarecast home">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
        <span>
          <strong>Squarecast</strong>
          <small>URL-Native Bingo Boards</small>
        </span>
      </a>
      <div className="header-actions">
        <div className="mode-label">
          {mode === "edit" ? <Settings2 size={15} /> : <Sparkles size={15} />}
          {mode === "edit" ? "Studio" : "Live Board"}
        </div>
        <a
          className="github-link"
          href="https://github.com/mikejhill/squarecast"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
          <span>GitHub</span>
        </a>
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
  const validation = useMemo(() => generator.validate(state), [state]);
  const needed = BoardModel.blankSquareCount(state);
  const answerCount = state.answers.filter((answer) => answer.text.trim()).length;

  const patchConfig = (patch: Partial<EditorState["config"]>) => {
    const config = { ...state.config, ...patch };
    let answers = state.answers;
    if (patch.size !== undefined || patch.free !== undefined) {
      const freeIndex = BoardModel.freeCellIndex(config.size, config.free);
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
    const answer: Answer = {
      id: IdFactory.create(),
      text: value,
      placement: { kind: "any" },
    };
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
    const values = csvParser.parse(csvText);
    if (!values.length) return;
    onChange({
      ...state,
      answers: [
        ...state.answers,
        ...values.map((text) => ({
          id: IdFactory.create(),
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
      codec.createUrl(
        { v: 1, mode: "launch", source: state },
        window.location.href,
      ),
    );
  };

  const doCopy = async (kind: "edit" | "play", text: string) => {
    await clipboard.copy(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const sortAnswers = (mode: AnswerSort) => {
    onChange({ ...state, answers: sorter.sort(state.answers, mode) });
  };

  return (
    <main className="editor-shell">
      <section className="editor-panel">
        <div className="intro">
          <p className="eyebrow">Board Studio</p>
          <h1>Build It Once. Let Every Board Land Differently.</h1>
          <p>
            Add a generous answer pool, pin the non-negotiables, then share one
            self-contained link.
          </p>
        </div>

        <Panel
          icon={<Settings2 size={18} />}
          title="Board Setup"
          aside={`${state.config.size} × ${state.config.size}`}
        >
          <label className="field field-wide">
            <span>Board Title</span>
            <input
              value={state.config.title}
              onChange={(event) => patchConfig({ title: event.target.value })}
              placeholder="Weekend Adventure Bingo"
              maxLength={80}
            />
          </label>

          <div className="field">
            <span>Board Size</span>
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
              <span>Free-Square Label</span>
              <input
                value={state.config.freeLabel}
                onChange={(event) => patchConfig({ freeLabel: event.target.value })}
                placeholder="FREE"
                maxLength={36}
              />
            </label>
          )}

          <div className="field field-wide">
            <span>Appearance</span>
            <div className="appearance-options" aria-label="Site appearance">
              {(
                [
                  ["system", "System", <Monitor size={16} />],
                  ["light", "Light", <Sun size={16} />],
                  ["dark", "Dark", <Moon size={16} />],
                ] as const
              ).map(([appearance, label, icon]) => (
                <button
                  type="button"
                  key={appearance}
                  className={state.config.appearance === appearance ? "active" : ""}
                  aria-pressed={state.config.appearance === appearance}
                  onClick={() => patchConfig({ appearance })}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="field field-wide">
            <span>Board Color</span>
            <div className="theme-row">
              {ColorTheme.presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={`theme-swatch ${
                    state.config.theme === preset.id ? "selected" : ""
                  }`}
                  style={{ background: preset.color }}
                  aria-label={`${preset.label} board color`}
                  title={preset.label}
                  aria-pressed={state.config.theme === preset.id}
                  onClick={() =>
                    patchConfig({
                      theme: preset.id,
                      accentColor: preset.color,
                    })
                  }
                >
                  {state.config.theme === preset.id && <Check size={15} />}
                </button>
              ))}
              <label
                className={`custom-color ${
                  state.config.theme === "custom" ? "selected" : ""
                }`}
                title="Choose a custom board color"
              >
                <Palette size={16} />
                <input
                  type="color"
                  value={state.config.accentColor}
                  onChange={(event) =>
                    patchConfig({
                      theme: "custom",
                      accentColor: event.target.value,
                    })
                  }
                  aria-label="Custom board color"
                />
              </label>
              <button
                type="button"
                className="random-color-button"
                onClick={() =>
                  patchConfig({
                    theme: "custom",
                    accentColor: ColorTheme.random(),
                  })
                }
              >
                <Shuffle size={15} />
                Randomize
              </button>
            </div>
          </div>

          <div className="field field-wide">
            <span>Tile Text Size</span>
            <div className="font-size-controls">
              <div className="segmented compact-segmented">
                <button
                  type="button"
                  className={state.config.fontMode === "auto" ? "active" : ""}
                  aria-pressed={state.config.fontMode === "auto"}
                  onClick={() => patchConfig({ fontMode: "auto" })}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={state.config.fontMode === "fixed" ? "active" : ""}
                  aria-pressed={state.config.fontMode === "fixed"}
                  onClick={() => patchConfig({ fontMode: "fixed" })}
                >
                  Fixed
                </button>
              </div>
              <label className="font-slider">
                <Type size={17} />
                <input
                  type="range"
                  min="10"
                  max="32"
                  step="1"
                  value={state.config.fontSize}
                  disabled={state.config.fontMode === "auto"}
                  onChange={(event) =>
                    patchConfig({ fontSize: Number(event.target.value) })
                  }
                  aria-label="Fixed tile font size"
                />
                <output>{state.config.fontSize}px</output>
              </label>
            </div>
            <small className="field-help">
              Auto sizes every tile independently. Fixed applies one size to the
              entire board.
            </small>
          </div>
        </Panel>

        <Panel
          icon={<Clipboard size={18} />}
          title="Answer Pool"
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
            <label className="sort-control">
              <ArrowUpAZ size={15} />
              <span className="sr-only">Sort Answer Pool</span>
              <select
                defaultValue=""
                aria-label="Sort Answer Pool"
                onChange={(event) => {
                  if (event.target.value) {
                    sortAnswers(event.target.value as AnswerSort);
                    event.target.value = "";
                  }
                }}
              >
                <option value="" disabled>Sort</option>
                <option value="alphabetical">A–Z</option>
                <option value="reverse">Z–A</option>
                <option value="constrained">Locked First</option>
                <option value="shuffle">Shuffle Answers</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>

          <div className="answer-list" aria-label="Board answers">
            {state.answers.map((answer, index) => (
              <AnswerRow
                key={answer.id}
                answer={answer}
                index={index}
                size={state.config.size}
                freeIndex={BoardModel.freeCellIndex(
                  state.config.size,
                  state.config.free,
                )}
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
          <span>Live Preview</span>
          <button
            type="button"
            className="text-button compact"
            onClick={() => patchConfig({ previewSeed: IdFactory.seed() })}
          >
            <Shuffle size={15} />
            Shuffle Preview
          </button>
        </div>
        <button
          type="button"
          className="copy-editor-action"
          onClick={() => doCopy("edit", window.location.href)}
        >
          {copied === "edit" ? <Check size={21} /> : <Link2 size={21} />}
          <span>
            <strong>
              {copied === "edit" ? "Editor Link Copied" : "Copy Editor Link"}
            </strong>
            <small>Save or share this editable board</small>
          </span>
        </button>
        <BoardPreview editor={state} />
        <ValidationCard validation={validation} />
        <button
          type="button"
          className="primary-action"
          disabled={!validation.valid}
          onClick={createPlayLink}
        >
          <Dices size={19} />
          Create Play Link
          <span aria-hidden="true">→</span>
        </button>
        <p className="privacy-note">
          Nothing is uploaded. This board lives entirely in its URL.
        </p>
      </aside>

      {csvOpen && (
        <Modal title="Paste CSV Answers" onClose={() => setCsvOpen(false)}>
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
              disabled={!csvParser.parse(csvText).length}
            >
              Import {csvParser.parse(csvText).length || ""} Answers
            </button>
          </div>
        </Modal>
      )}

      {shareUrl && (
        <Modal title="Your Play Link Is Ready" onClose={() => setShareUrl("")}>
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
  const validation = generator.validate(editor);
  let cells: PlayCell[];
  if (validation.valid) {
    cells = generator.generate(editor, editor.config.previewSeed).cells;
  } else {
    const freeIndex = BoardModel.freeCellIndex(
      editor.config.size,
      editor.config.free,
    );
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
        <span>PREVIEW</span>
        <h2>{editor.config.title || "Untitled board"}</h2>
        <span>{editor.config.size} × {editor.config.size}</span>
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
            <AutoFitText
              text={cell.text}
              mode={editor.config.fontMode}
              fixedSize={editor.config.fontSize}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationCard({
  validation,
}: {
  validation: ValidationResult;
}) {
  if (validation.valid && !validation.warnings.length) {
    return (
      <div className="status-card valid">
        <span><Check size={16} /></span>
        <p><strong>Ready to Cast</strong>Your board rules fit cleanly.</p>
      </div>
    );
  }
  const messages = validation.errors.length ? validation.errors : validation.warnings;
  return (
    <div className={`status-card ${validation.valid ? "warning" : "invalid"}`}>
      <span>{validation.valid ? "!" : "×"}</span>
      <p><strong>{validation.valid ? "Check This" : "Needs Attention"}</strong>{messages[0]}</p>
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
  const wins = generator.winningCells(state);
  const hasWin = wins.size > 0;

  const toggleCell = (index: number) => {
    if (state.cells[index]?.free) return;
    const checked = new Set(state.checked);
    if (checked.has(index)) checked.delete(index);
    else checked.add(index);
    onChange({ ...state, checked: [...checked].sort((a, b) => a - b) });
  };

  const reshuffle = () => {
    onChange(generator.generate(state.source, IdFactory.seed()));
  };

  const copySession = async () => {
    await clipboard.copy(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="play-shell">
      <div className="play-toolbar">
        <button type="button" className="text-button" onClick={() => onChange(state.source)}>
          <ArrowLeft size={16} />
          Edit Source
        </button>
        <div className="play-actions">
          <button type="button" className="secondary-button compact-button" onClick={reshuffle}>
            <RotateCcw size={16} />
            New Shuffle
          </button>
          <button type="button" className="secondary-button compact-button" onClick={copySession}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy Session"}
          </button>
        </div>
      </div>

      <div className="play-title">
        <p className="eyebrow">Your Randomized Board</p>
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
          <span>{hasWin ? "COMPLETED" : "BINGO BOARD"}</span>
          <h2>{state.title}</h2>
          <span>{state.size} × {state.size}</span>
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
                <AutoFitText
                  text={cell.text}
                  mode={state.fontMode}
                  fixedSize={state.fontSize}
                />
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

class RenderedTextFitter {
  public constructor(
    private readonly element: HTMLSpanElement,
    private readonly container: HTMLElement,
    private readonly optimizer: FontSizeOptimizer,
  ) {}

  public fit(): void {
    const availableWidth = this.container.clientWidth;
    const availableHeight = this.container.clientHeight;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const maximum = Math.max(1, Math.min(96, availableHeight * 0.92));
    const fitted = this.optimizer.findLargest({
      min: 1,
      max: maximum,
      fits: (size) => this.fitsAt(size, availableWidth, availableHeight),
    });
    this.element.style.fontSize = `${fitted}px`;
  }

  private fitsAt(size: number, availableWidth: number, availableHeight: number): boolean {
    this.element.style.fontSize = `${size}px`;

    const range = document.createRange();
    range.selectNodeContents(this.element);
    const rendered = range.getBoundingClientRect();

    return (
      this.element.scrollWidth <= availableWidth + 0.5 &&
      this.element.scrollHeight <= availableHeight + 0.5 &&
      rendered.width <= availableWidth + 0.5 &&
      rendered.height <= availableHeight + 0.5
    );
  }
}

function AutoFitText({
  text,
  mode,
  fixedSize,
}: {
  text: string;
  mode: "auto" | "fixed";
  fixedSize: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (mode === "fixed") {
      element.style.fontSize = `${fixedSize}px`;
      return;
    }
    const container = element.parentElement;
    if (!container) return;

    const fitter = new RenderedTextFitter(element, container, fontSizeOptimizer);
    let active = true;
    let frame = 0;
    const fit = () => {
      if (active) fitter.fit();
    };
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };

    fit();
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(container);
    void document.fonts.ready.then(scheduleFit);

    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fixedSize, mode, text]);

  return (
    <span className="auto-fit-slot">
      <span ref={ref} className="auto-fit">{text}</span>
    </span>
  );
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
