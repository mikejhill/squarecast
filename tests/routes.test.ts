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
});
