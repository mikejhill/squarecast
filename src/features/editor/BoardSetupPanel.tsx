import {
  Check,
  ChevronDown,
  Palette,
  Settings2,
  Shuffle,
  Type,
} from "lucide-react";
import { Panel } from "../../components/Panel";
import type { BoardConfig } from "../../lib/model";
import { ColorTheme } from "../../lib/theme";
import { BoardFileTools } from "./BoardFileTools";

type BoardSetupPanelProps = {
  config: BoardConfig;
  importError: string;
  onPatch: (patch: Partial<BoardConfig>) => void;
  onImportJson: (file: File) => Promise<void>;
  onExportJson: () => void;
};

/** Renders board geometry, free-square, color, and typography controls. */
export function BoardSetupPanel({
  config,
  importError,
  onPatch,
  onImportJson,
  onExportJson,
}: BoardSetupPanelProps) {
  return (
    <Panel
      icon={<Settings2 size={18} />}
      title="Board Setup"
      aside={
        <label className="panel-size-select">
          <span className="sr-only">Board Size</span>
          <select
            value={config.size}
            aria-label="Board Size"
            onChange={(event) =>
              onPatch({ size: Number(event.target.value) })
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
          value={config.title}
          onChange={(event) => onPatch({ title: event.target.value })}
          placeholder="Weekend Adventure Bingo"
          maxLength={80}
        />
      </label>

      <div
        className={`free-square-section ${
          config.free ? "" : "without-label"
        }`}
      >
        <label className="free-square-toggle">
          <span>
            <strong>Centered Free Square</strong>
            <small>Automatically marked for every player</small>
          </span>
          <input
            type="checkbox"
            checked={config.free}
            onChange={(event) => onPatch({ free: event.target.checked })}
          />
          <span className="toggle" aria-hidden="true" />
        </label>

        {config.free && (
          <label className="free-square-label">
            <span>Label</span>
            <input
              value={config.freeLabel}
              onChange={(event) => onPatch({ freeLabel: event.target.value })}
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
                config.theme === preset.id ? "selected" : ""
              }`}
              style={{ background: preset.color }}
              aria-label={`${preset.label} board color`}
              title={preset.label}
              aria-pressed={config.theme === preset.id}
              onClick={() =>
                onPatch({
                  theme: preset.id,
                  accentColor: preset.color,
                })
              }
            >
              {config.theme === preset.id && <Check size={15} />}
            </button>
          ))}
          <label
            className={`custom-color ${
              config.theme === "custom" ? "selected" : ""
            }`}
            title="Choose a custom board color"
          >
            <Palette size={16} />
            <input
              type="color"
              value={config.accentColor}
              onChange={(event) =>
                onPatch({
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
              onPatch({
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
              className={config.fontMode === "auto" ? "active" : ""}
              aria-pressed={config.fontMode === "auto"}
              onClick={() => onPatch({ fontMode: "auto" })}
            >
              Auto
            </button>
            <button
              type="button"
              className={config.fontMode === "fixed" ? "active" : ""}
              aria-pressed={config.fontMode === "fixed"}
              onClick={() => onPatch({ fontMode: "fixed" })}
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
              value={config.fontSize}
              disabled={config.fontMode === "auto"}
              onChange={(event) =>
                onPatch({ fontSize: Number(event.target.value) })
              }
              aria-label="Fixed tile font size"
            />
            <output>{config.fontSize}px</output>
          </label>
        </div>
        <small className="field-help">
          Auto sizes every tile independently. Fixed applies one size to the
          entire board.
        </small>
      </div>

      <BoardFileTools
        importError={importError}
        onImport={onImportJson}
        onExport={onExportJson}
      />
    </Panel>
  );
}
