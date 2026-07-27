import {
  ArrowLeft,
  ArrowUpAZ,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Dices,
  ExternalLink,
  FileUp,
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
  TriangleAlert,
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
  type DragEvent as ReactDragEvent,
  type DragEventHandler,
  type ReactNode,
} from "react";
import { BoardFactory } from "./lib/board-factory";
import { StateCodec } from "./lib/codec";
import { CsvAnswerParser, CsvFileImporter } from "./lib/csv";
import { DuplicateCardDetector } from "./lib/duplicates";
import { AutoFontSizePolicy, FontSizeOptimizer } from "./lib/font-size";
import { BoardGenerator, type ValidationResult } from "./lib/generator";
import { UrlHistoryService, type HistoryWriteMode } from "./lib/history";
import { RuntimeLogger } from "./lib/logger";
import {
  BoardModel,
  IdFactory,
  type Answer,
  type EditorState,
  type Placement,
  type PlayState,
} from "./lib/model";
import { AnswerPoolSorter, type AnswerSort } from "./lib/sorting";
import { AppearanceResolver, ColorTheme } from "./lib/theme";
import {
  AppearancePreferenceStore,
  type Appearance,
} from "./lib/preferences";

type ActiveState = EditorState | PlayState;
type StateChangeHandler = (
  state: ActiveState,
  historyMode?: HistoryWriteMode,
) => void;

const logger = new RuntimeLogger("application");
const clipboardLogger = new RuntimeLogger("clipboard");

/**
 * Copies generated links while retaining a legacy DOM fallback for browsers or
 * security contexts where the asynchronous Clipboard API is unavailable.
 */
class ClipboardService {
  /** Copies text or throws after both the modern and fallback strategies fail. */
  public async copy(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        clipboardLogger.info("Copied a Squarecast URL with the Clipboard API.");
        return;
      } catch (error) {
        clipboardLogger.warn("Clipboard API failed; trying the DOM fallback.", {
          errorType: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
    const input = document.createElement("textarea");
    try {
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      if (!document.execCommand("copy")) {
        throw new Error("The browser rejected the copy command.");
      }
      clipboardLogger.info("Copied a Squarecast URL with the DOM fallback.");
    } catch (error) {
      clipboardLogger.error("Could not copy a Squarecast URL.", error);
      throw error;
    } finally {
      input.remove();
    }
  }
}

/**
 * Interprets the initial URL state and converts launch links into a fresh,
 * randomized play session. Invalid launch semantics fall back to a clean editor.
 */
class ApplicationStateService {
  public constructor(
    private readonly codec: StateCodec,
    private readonly generator: BoardGenerator,
    private readonly boardFactory: BoardFactory,
  ) {}

  /** Restores edit/play state or creates a safe new session when restoration fails. */
  public load(hash: string): ActiveState {
    const decoded = this.codec.decode(hash);
    if (decoded?.mode === "launch") {
      try {
        const play = this.generator.generate(decoded.source, IdFactory.seed());
        logger.info("Generated a play session from a launch link.");
        return play;
      } catch (error) {
        logger.error("Launch-link generation failed; opened a new editor.", error);
        return this.boardFactory.createNewEditor();
      }
    }
    if (decoded?.mode === "edit" || decoded?.mode === "play") {
      logger.info("Restored application state.", { mode: decoded.mode });
      return decoded;
    }
    logger.info("Started a fresh editor session.");
    return this.boardFactory.createNewEditor();
  }
}

const codec = new StateCodec();
const generator = new BoardGenerator();
const boardFactory = new BoardFactory();
const csvParser = new CsvAnswerParser();
const csvFileImporter = new CsvFileImporter(csvParser);
const sorter = new AnswerPoolSorter();
const appearanceResolver = new AppearanceResolver();
const fontSizeOptimizer = new FontSizeOptimizer();
const autoFontSizePolicy = new AutoFontSizePolicy();
const duplicateCardDetector = new DuplicateCardDetector();
const clipboard = new ClipboardService();
const stateService = new ApplicationStateService(codec, generator, boardFactory);
const urlHistory = new UrlHistoryService(window.history);
const appearancePreferences = AppearancePreferenceStore.createBrowserStore();

/**
 * Coordinates URL-backed application state, browser history, local appearance,
 * and the edit/play view boundary.
 */
export function App() {
  const [state, setState] = useState<ActiveState>(() =>
    stateService.load(window.location.hash),
  );
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [appearance, setAppearance] = useState<Appearance>(() =>
    appearancePreferences.read(),
  );
  const historyMode = useRef<HistoryWriteMode>("replace");
  const navigate: StateChangeHandler = (nextState, mode = "replace") => {
    historyMode.current = mode;
    logger.debug("Scheduled an application state change.", {
      destinationMode: nextState.mode,
      historyMode: mode,
    });
    setState(nextState);
  };

  // Every state mutation is encoded immediately; the pending mode decides
  // whether this is a major Back-button checkpoint or a replacement edit.
  useEffect(() => {
    urlHistory.write(codec.encode(state), historyMode.current);
    historyMode.current = "replace";
  }, [state]);

  useEffect(() => {
    const restoreHistoryState = () => {
      historyMode.current = "none";
      setState(stateService.load(window.location.hash));
      logger.info("Restored state from browser navigation.");
    };
    window.addEventListener("popstate", restoreHistoryState);
    return () => window.removeEventListener("popstate", restoreHistoryState);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent): void =>
      setSystemIsDark(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const config = state.mode === "edit" ? state.config : state.source.config;
  const resolvedAppearance = appearanceResolver.resolve(
    appearance,
    systemIsDark,
  );

  const changeAppearance = (nextAppearance: Appearance) => {
    appearancePreferences.write(nextAppearance);
    setAppearance(nextAppearance);
    logger.info("Changed the local appearance.", {
      appearance: nextAppearance,
    });
  };

  // Update native browser controls and surrounding page chrome alongside CSS.
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
      data-appearance={appearance}
      data-theme={config.theme}
      style={ColorTheme.style(config.accentColor)}
    >
      <SiteHeader
        mode={state.mode}
        appearance={appearance}
        onAppearanceChange={changeAppearance}
        onNewBoard={() => navigate(boardFactory.createNewEditor(), "push")}
      />
      {state.mode === "edit" ? (
        <Editor state={state} onChange={navigate} />
      ) : (
        <Player state={state} onChange={navigate} />
      )}
    </div>
  );
}

/** Renders global navigation and the device-local appearance controls. */
function SiteHeader({
  mode,
  appearance,
  onAppearanceChange,
  onNewBoard,
}: {
  mode: "edit" | "play";
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  onNewBoard: () => void;
}) {
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
        <div
          className="appearance-switcher"
          role="group"
          aria-label="Site appearance"
        >
          {(
            [
              ["system", "System", <Monitor size={16} />],
              ["light", "Light", <Sun size={16} />],
              ["dark", "Dark", <Moon size={16} />],
            ] as const
          ).map(([option, label, icon]) => (
            <button
              type="button"
              key={option}
              className={appearance === option ? "active" : ""}
              aria-label={`${label} appearance`}
              aria-pressed={appearance === option}
              title={`${label} appearance`}
              onClick={() => onAppearanceChange(option)}
            >
              {icon}
            </button>
          ))}
        </div>
        <button type="button" className="new-board-button" onClick={onNewBoard}>
          <Plus size={16} />
          <span>New Board</span>
        </button>
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

/**
 * Owns editor-only interaction state while delegating shareable board changes
 * to the URL-backed application state handler.
 */
function Editor({
  state,
  onChange,
}: {
  state: EditorState;
  onChange: StateChangeHandler;
}) {
  const [newAnswer, setNewAnswer] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState<"edit" | "play" | null>(null);
  const [isCardPoolDragging, setIsCardPoolDragging] = useState(false);
  const cardPoolDragDepth = useRef(0);
  const validation = useMemo(() => generator.validate(state), [state]);
  const duplicateCardIds = useMemo(
    () => duplicateCardDetector.findDuplicateIds(state.answers),
    [state.answers],
  );
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
    onChange(
      { ...state, config, answers },
      patch.size !== undefined || patch.free !== undefined ? "push" : "replace",
    );
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
    onChange({
      ...state,
      answers: sorter.sort(answers, state.config.sortMode),
    });
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
    onChange(
      { ...state, answers: state.answers.filter((answer) => answer.id !== id) },
      "push",
    );
  };

  const appendImportedCards = (values: readonly string[]) => {
    if (!values.length) return;
    const imported = [
      ...state.answers,
      ...values.map((text) => ({
        id: IdFactory.create(),
        text,
        placement: { kind: "any" as const },
      })),
    ];
    onChange(
      {
        ...state,
        answers: sorter.sort(imported, state.config.sortMode),
      },
      "push",
    );
    logger.info("Added imported cards to the Card Pool.", {
      importedCardCount: values.length,
      resultingCardCount: imported.length,
    });
  };

  const importCsv = () => {
    const values = csvParser.parse(csvText);
    if (!values.length) return;
    appendImportedCards(values);
    setCsvOpen(false);
    setCsvText("");
  };

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
      appendImportedCards(
        await csvFileImporter.parse(Array.from(event.dataTransfer.files)),
      );
    } catch (error) {
      logger.error("The dropped CSV import did not complete.", error);
    }
  };

  const createPlayLink = () => {
    if (!validation.valid) return;
    setShareUrl(
      codec.createUrl(
        { v: 1, mode: "launch", source: state },
        window.location.href,
      ),
    );
    logger.info("Created a shareable play link.");
  };

  const playBoard = () => {
    if (!validation.valid) return;
    onChange(generator.generate(state, IdFactory.seed()), "push");
    logger.info("Opened a test play session.");
  };

  const doCopy = async (kind: "edit" | "play", text: string) => {
    try {
      await clipboard.copy(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch (error) {
      logger.error("A link copy action failed.", error, { kind });
    }
  };

  const sortAnswers = (mode: AnswerSort) => {
    onChange(
      {
        ...state,
        config: { ...state.config, sortMode: mode },
        answers: sorter.sort(state.answers, mode),
      },
      "push",
    );
    logger.info("Changed the persistent Card Pool sort.", { mode });
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

        <Panel
          icon={<Settings2 size={18} />}
          title="Board Setup"
          aside={
            <label className="panel-size-select">
              <span className="sr-only">Board Size</span>
              <select
                value={state.config.size}
                aria-label="Board Size"
                onChange={(event) =>
                  patchConfig({ size: Number(event.target.value) })
                }
              >
                {[3, 4, 5, 6, 7].map((size) => (
                  <option value={size} key={size}>
                    {size} × {size}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
          }
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

          <div
            className={`free-square-section ${
              state.config.free ? "" : "without-label"
            }`}
          >
            <label className="free-square-toggle">
              <span>
                <strong>Centered Free Square</strong>
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
              <label className="free-square-label">
                <span>Label</span>
                <input
                  value={state.config.freeLabel}
                  onChange={(event) =>
                    patchConfig({ freeLabel: event.target.value })
                  }
                  placeholder="FREE"
                  maxLength={36}
                  aria-label="Free-Square Label"
                />
              </label>
            )}
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
          title="Card Pool"
          aside={`${answerCount} / ${needed} needed`}
          className={`card-pool-panel ${
            isCardPoolDragging ? "is-dragging" : ""
          }`}
          onDragEnter={handleCardPoolDragEnter}
          onDragOver={handleCardPoolDragOver}
          onDragLeave={handleCardPoolDragLeave}
          onDrop={handleCardPoolDrop}
        >
          <div className="quick-add">
            <Plus size={18} />
            <input
              value={newAnswer}
              onChange={(event) => setNewAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addAnswer();
              }}
              placeholder="Type a card, then press Enter"
              aria-label="New card"
            />
            <button
              type="button"
              className="quick-add-submit"
              onClick={() => addAnswer()}
              disabled={!newAnswer.trim()}
            >
              Add
            </button>
            <button
              type="button"
              className="quick-add-csv"
              onClick={() => setCsvOpen(true)}
            >
              <Clipboard size={15} />
              Paste CSV
            </button>
          </div>

          <div className="answer-toolbar">
            <p>
              {answerCount >= needed
                ? `${answerCount - needed} extra card${answerCount - needed === 1 ? "" : "s"} add variety.`
                : `${needed - answerCount} more required to fill the board.`}
            </p>
            <label className="sort-control">
              <ArrowUpAZ size={15} />
              <span className="sr-only">Sort Card Pool</span>
              <select
                value={state.config.sortMode}
                aria-label="Sort Card Pool"
                onChange={(event) => {
                  sortAnswers(event.target.value as AnswerSort);
                }}
              >
                <option value="alphabetical">A–Z</option>
                <option value="reverse">Z–A</option>
                <option value="constrained">Locked First</option>
                <option value="shuffle">Shuffle Cards</option>
              </select>
              <ChevronDown size={14} />
            </label>
          </div>

          <div className="answer-list" aria-label="Board cards">
            {state.answers.map((answer, index) => (
              <AnswerRow
                key={answer.id}
                answer={answer}
                duplicate={duplicateCardIds.has(answer.id)}
                index={index}
                size={state.config.size}
                freeIndex={BoardModel.freeCellIndex(
                  state.config.size,
                  state.config.free,
                )}
                onChange={(patch) => updateAnswer(answer.id, patch)}
                onDelete={() => deleteAnswer(answer.id)}
                onEnter={() => addAnswer("New card", answer.id)}
              />
            ))}
            {!state.answers.length && (
              <div className="empty-answers">
                <Clipboard size={24} />
                <strong>Your card pool is empty</strong>
                <span>Use quick add or paste a CSV list.</span>
              </div>
            )}
          </div>
          {isCardPoolDragging && (
            <div className="card-drop-overlay" role="status" aria-live="polite">
              <FileUp size={32} />
              <strong>Drop CSV Files</strong>
              <span>Cards will be imported and sorted automatically.</span>
            </div>
          )}
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
          className="share-play-action"
          disabled={!validation.valid}
          onClick={playBoard}
        >
          <Sparkles size={19} />
          Test This Board
          <span aria-hidden="true">→</span>
        </button>
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
        <Modal title="Paste CSV Cards" onClose={() => setCsvOpen(false)}>
          <p className="modal-copy">
            Paste rows, columns, or quoted values. Every non-empty CSV cell becomes
            one card.
          </p>
          <textarea
            className="csv-input"
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={'Card one,Card two\n"Card with, a comma"'}
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
              Import {csvParser.parse(csvText).length || ""} Cards
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

/** Provides the shared accessible heading/body structure for editor sections. */
function Panel({
  icon,
  title,
  aside,
  children,
  className,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  icon: ReactNode;
  title: string;
  aside: ReactNode;
  children: ReactNode;
  className?: string;
  onDragEnter?: DragEventHandler<HTMLElement>;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}) {
  return (
    <section
      className={`panel${className ? ` ${className}` : ""}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="panel-heading">
        <span className="panel-icon">{icon}</span>
        <h2>{title}</h2>
        <div className="panel-aside">{aside}</div>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Edits one card's text and placement constraint without owning board state. */
function AnswerRow({
  answer,
  duplicate,
  index,
  size,
  freeIndex,
  onChange,
  onDelete,
  onEnter,
}: {
  answer: Answer;
  duplicate: boolean;
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
      <div className="card-text-field">
        <input
          value={answer.text}
          onChange={(event) => onChange({ text: event.target.value })}
          onKeyDown={handleKey}
          aria-label={`Card ${index + 1}`}
        />
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
      <div className={`placement ${answer.placement.kind !== "any" ? "locked" : ""}`}>
        {answer.placement.kind !== "any" && <LockKeyhole size={13} />}
        <select
          value={selectValue}
          onChange={(event) => onChange({ placement: parsePlacement(event.target.value) })}
          aria-label={`Placement for card ${index + 1}`}
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
        aria-label={`Delete card ${index + 1}`}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

/** Renders the current seeded preview, including partial-board placeholders. */
function BoardPreview({ editor }: { editor: EditorState }) {
  const cells = generator.generatePreview(
    editor,
    editor.config.previewSeed,
  );

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

/** Surfaces the highest-priority validation result beside publishing actions. */
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

/** Runs a URL-persisted play session and records marked cells and reshuffles. */
function Player({
  state,
  onChange,
}: {
  state: PlayState;
  onChange: StateChangeHandler;
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
    logger.debug("Changed a play-cell mark.", {
      cellIndex: index,
      checked: checked.has(index),
    });
  };

  const reshuffle = () => {
    onChange(generator.generate(state.source, IdFactory.seed()), "push");
    logger.info("Generated a new play-session shuffle.");
  };

  const copySession = async () => {
    try {
      await clipboard.copy(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      logger.error("The play-session copy action failed.", error);
    }
  };

  return (
    <main className="play-shell">
      <div className="play-toolbar">
        <button
          type="button"
          className="text-button"
          onClick={() => onChange(state.source, "push")}
        >
          <ArrowLeft size={16} />
          Edit This Board
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
      </div>

      <p className="play-footnote">
        {state.checked.length} of {state.size ** 2} marked · Your progress is stored in this URL
      </p>
    </main>
  );
}

/**
 * Measures actual browser layout to fit each tile independently. Range bounds
 * catch partial-glyph overflow that scroll dimensions can round away.
 */
class RenderedTextFitter {
  public constructor(
    private readonly element: HTMLSpanElement,
    private readonly container: HTMLElement,
    private readonly optimizer: FontSizeOptimizer,
  ) {}

  /** Measures the tile and applies the largest verified font size. */
  public fit(): void {
    const availableWidth = this.container.clientWidth;
    const availableHeight = this.container.clientHeight;
    if (availableWidth <= 0 || availableHeight <= 0) return;

    const maximum = autoFontSizePolicy.maximumForHeight(availableHeight);
    const fitted = this.optimizer.findLargest({
      min: 1,
      max: maximum,
      fits: (size) => this.fitsAt(size, availableWidth, availableHeight),
    });
    this.element.style.fontSize = `${fitted}px`;
  }

  /** Tests one candidate against both layout boxes and rendered glyph bounds. */
  private fitsAt(size: number, availableWidth: number, availableHeight: number): boolean {
    this.element.style.fontSize = `${size}px`;

    const range = document.createRange();
    range.selectNodeContents(this.element);
    const rendered = range.getBoundingClientRect();
    const safeWidth = Math.max(1, availableWidth - 1);
    const safeHeight = Math.max(1, availableHeight - 1);

    return (
      this.element.scrollWidth <= availableWidth &&
      this.element.scrollHeight <= availableHeight &&
      rendered.width <= safeWidth &&
      rendered.height <= safeHeight
    );
  }
}

/** Connects rendered text measurement to font readiness and tile resizes. */
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

/** Provides dismissible dialog behavior shared by CSV import and link sharing. */
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
