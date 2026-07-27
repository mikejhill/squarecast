import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "../src/components/SiteHeader";
import { EditorDialogs } from "../src/features/editor/EditorDialogs";

/** Asserts visual source order without coupling tests to styling classes. */
const expectBefore = (
  markup: string,
  leftLabel: string,
  rightLabel: string,
): void => {
  const left = markup.indexOf(leftLabel);
  const right = markup.indexOf(rightLabel);
  expect(left, `${leftLabel} was not rendered`).toBeGreaterThanOrEqual(0);
  expect(right, `${rightLabel} was not rendered`).toBeGreaterThanOrEqual(0);
  expect(left, `${leftLabel} should precede ${rightLabel}`).toBeLessThan(right);
};

describe("action ordering", () => {
  it("places New Board before Sample Board in the global header", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteHeader, {
        mode: "edit",
        appearance: "system",
        onAppearanceChange: () => undefined,
        onSampleBoard: () => undefined,
        onNewBoard: () => undefined,
      }),
    );

    expectBefore(markup, "New Board", "Sample Board");
  });

  it("places CSV import before its cancellation action", () => {
    const markup = renderToStaticMarkup(
      createElement(EditorDialogs, {
        csvOpen: true,
        csvText: "Alpha,Beta",
        csvCardCount: 2,
        shareUrl: "",
        copied: null,
        onCsvTextChange: () => undefined,
        onCloseCsv: () => undefined,
        onImportCsv: () => undefined,
        onCloseShare: () => undefined,
        onCopyPlay: () => undefined,
      }),
    );

    expectBefore(markup, "Import 2 Cards", "Cancel");
  });

  it("places play-link opening before dialog dismissal", () => {
    const markup = renderToStaticMarkup(
      createElement(EditorDialogs, {
        csvOpen: false,
        csvText: "",
        csvCardCount: 0,
        shareUrl: "https://example.test/#play",
        copied: null,
        onCsvTextChange: () => undefined,
        onCloseCsv: () => undefined,
        onImportCsv: () => undefined,
        onCloseShare: () => undefined,
        onCopyPlay: () => undefined,
      }),
    );

    expectBefore(markup, "Open play board", ">Close</button>");
    expect(markup).not.toContain(">Done<");
  });
});
