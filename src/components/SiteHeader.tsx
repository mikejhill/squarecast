import {
  Github,
  LayoutTemplate,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import type { Appearance } from "../lib/preferences";

type SiteHeaderProps = {
  mode: "edit" | "play";
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  onSampleBoard: () => void;
  onNewBoard: () => void;
};

/** Renders global navigation and the device-local appearance controls. */
export function SiteHeader({
  mode,
  appearance,
  onAppearanceChange,
  onSampleBoard,
  onNewBoard,
}: SiteHeaderProps) {
  return (
    <header className="site-header">
      <a
        className="brand"
        href={import.meta.env.BASE_URL}
        aria-label="Squarecast home"
      >
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
        <button
          type="button"
          className="new-board-button"
          onClick={onNewBoard}
          title="Create a blank board"
        >
          <Plus size={16} />
          <span>New Board</span>
        </button>
        <button
          type="button"
          className="sample-board-button"
          onClick={onSampleBoard}
          title="Open a random sample board"
        >
          <LayoutTemplate size={16} />
          <span>Sample Board</span>
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
