import { describe, expect, it, vi } from "vitest";
import { UrlHistoryService } from "../src/lib/history";
import { ApplicationRoutes } from "../src/lib/routes";

describe("URL history service", () => {
  const createHistory = () => ({
    pushState: vi.fn(),
    replaceState: vi.fn(),
  });

  it("creates a history entry for major transitions", () => {
    const history = createHistory();
    new UrlHistoryService(history).write("#sq1:new-board", "push");

    expect(history.pushState).toHaveBeenCalledWith(null, "", "#sq1:new-board");
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("pushes the special new-board route as a Back-button checkpoint", () => {
    const history = createHistory();
    new UrlHistoryService(history).write(
      ApplicationRoutes.newBoardHash,
      "push",
    );

    expect(history.pushState).toHaveBeenCalledWith(null, "", "#new");
  });

  it("updates the current entry for routine state changes", () => {
    const history = createHistory();
    new UrlHistoryService(history).write("#sq1:typing", "replace");

    expect(history.replaceState).toHaveBeenCalledWith(null, "", "#sq1:typing");
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it("stores a restorable snapshot beside stable pointer routes", () => {
    const history = createHistory();
    const state = { squarecast: { snapshotHash: "#sq1:state" } };
    new UrlHistoryService(history).write("#sql1:device-id", "replace", state);

    expect(history.replaceState).toHaveBeenCalledWith(
      state,
      "",
      "#sql1:device-id",
    );
  });

  it("does not rewrite history while restoring Back or Forward state", () => {
    const history = createHistory();
    new UrlHistoryService(history).write("#sq1:restored", "none");

    expect(history.pushState).not.toHaveBeenCalled();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
