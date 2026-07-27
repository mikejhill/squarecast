import { describe, expect, it } from "vitest";
import { NavigationCoordinator } from "../src/lib/navigation";

describe("navigation coordinator", () => {
  it("preserves the new-board action route for the initial write", () => {
    const coordinator = new NavigationCoordinator("#new");

    expect(coordinator.consume("#sq1:blank")).toEqual({
      hash: "#new",
      mode: "replace",
    });
  });

  it("schedules special and encoded history writes then resets", () => {
    const coordinator = new NavigationCoordinator("");

    coordinator.schedule("push", "#new");
    expect(coordinator.consume("#sq1:ignored")).toEqual({
      hash: "#new",
      mode: "push",
    });
    expect(coordinator.consume("#sq1:next")).toEqual({
      hash: "#sq1:next",
      mode: "replace",
    });
  });

  it("suppresses writes during Back and Forward restoration", () => {
    const coordinator = new NavigationCoordinator("");

    coordinator.schedule("push");
    coordinator.restore();

    expect(coordinator.consume("#sq1:restored")).toEqual({
      hash: "#sq1:restored",
      mode: "none",
    });
  });
});
