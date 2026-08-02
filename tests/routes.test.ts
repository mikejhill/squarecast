import { describe, expect, it } from "vitest";
import { ApplicationRoutes } from "../src/lib/routes";

describe("application routes", () => {
  it("recognizes the stable new-board fragment", () => {
    expect(ApplicationRoutes.newBoardHash).toBe("#new");
    expect(ApplicationRoutes.isNewBoard("#new")).toBe(true);
    expect(ApplicationRoutes.isNewBoard("#NEW")).toBe(true);
    expect(ApplicationRoutes.isNewBoard("#sq1:new")).toBe(false);
  });

  it("distinguishes the hash-free front page from stateful routes", () => {
    expect(ApplicationRoutes.isFrontPage("")).toBe(true);
    expect(ApplicationRoutes.isFrontPage("#")).toBe(true);
    expect(ApplicationRoutes.isFrontPage("#new")).toBe(false);
    expect(ApplicationRoutes.isFrontPage("#sq1:state")).toBe(false);
  });

  it("parses and creates every versioned saved-board pointer", () => {
    const routes = [
      [ApplicationRoutes.deviceBoard("device-id"), "device"],
      [ApplicationRoutes.cloudBoard("cloud-id"), "cloud"],
      [ApplicationRoutes.publicView("view-token"), "view"],
      [ApplicationRoutes.publicPlay("play-token"), "play"],
      [ApplicationRoutes.editorInvite("invite-token"), "invite"],
    ] as const;
    for (const [hash, kind] of routes) {
      expect(ApplicationRoutes.parseStoredRoute(hash)).toEqual({
        kind,
        id: hash.slice(hash.indexOf(":") + 1),
      });
    }
    expect(ApplicationRoutes.parseStoredRoute("#sqb1:bad/id")).toBeNull();
    expect(ApplicationRoutes.parseStoredRoute("#sq1:payload")).toBeNull();
    expect(ApplicationRoutes.hasStoredRoutePrefix("#sql1:short")).toBe(true);
    expect(ApplicationRoutes.hasStoredRoutePrefix("#sq1:payload")).toBe(false);
  });
});
