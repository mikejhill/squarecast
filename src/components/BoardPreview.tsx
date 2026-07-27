import type { CSSProperties } from "react";
import { applicationServices } from "../app/application-services";
import type { EditorState } from "../lib/model";
import { AutoFitText } from "./AutoFitText";

/** Renders the current seeded preview, including partial-board placeholders. */
export function BoardPreview({ editor }: { editor: EditorState }) {
  const cells = applicationServices.generator.generatePreview(
    editor,
    editor.config.previewSeed,
  );

  return (
    <div className="board-frame preview-board">
      <div className="board-heading">
        <span>PREVIEW</span>
        <h2>{editor.config.title || "Untitled board"}</h2>
        <span>
          {editor.config.size} × {editor.config.size}
        </span>
      </div>
      <div
        className="board-grid"
        style={{ "--board-size": editor.config.size } as CSSProperties}
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
