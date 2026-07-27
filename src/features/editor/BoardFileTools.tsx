import { Download, FileJson, Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { InfoTooltip } from "../../components/InfoTooltip";

type BoardFileToolsProps = {
  importError: string;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
};

/**
 * Groups complete-board import and export actions beside a concise explanation
 * of their scope. The native file input remains keyboard-accessible through
 * the explicit button while staying out of the visual layout.
 */
export function BoardFileTools({
  importError,
  onImport,
  onExport,
}: BoardFileToolsProps) {
  const input = useRef<HTMLInputElement>(null);

  /** Allows the same file to be selected again after an unsuccessful import. */
  const handleSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await onImport(file);
  };

  return (
    <div className="board-file-tools">
      <div className="board-file-description">
        <FileJson size={19} aria-hidden="true" />
        <strong>Board File</strong>
        <InfoTooltip label="About board JSON files">
          Includes the complete board configuration and Card Pool in one JSON
          file.
        </InfoTooltip>
      </div>
      <div className="board-file-actions">
        <input
          ref={input}
          className="sr-only"
          type="file"
          accept=".json,.squarecast.json,application/json"
          onChange={handleSelection}
          aria-label="Choose a Squarecast board JSON file"
        />
        <button type="button" onClick={() => input.current?.click()}>
          <Upload size={16} />
          Import JSON
        </button>
        <button type="button" onClick={onExport}>
          <Download size={16} />
          Export JSON
        </button>
      </div>
      {importError && (
        <p className="board-file-error" role="alert">
          {importError}
        </p>
      )}
    </div>
  );
}
