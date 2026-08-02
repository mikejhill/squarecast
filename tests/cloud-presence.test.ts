import { describe, expect, it } from "vitest";
import {
  activeBoardPresence,
  type BoardPresence,
} from "../src/services/cloud-board-repository";

describe("cloud board presence", () => {
  it("expires abandoned sessions and counts each user once", () => {
    const now = 1_000_000;
    const entries: BoardPresence[] = [
      { uid: "same-user", displayName: "Old session", lastSeen: now - 60_000 },
      { uid: "same-user", displayName: "Current session", lastSeen: now - 1_000 },
      { uid: "active-user", displayName: "Active", lastSeen: now - 2_000 },
      { uid: "expired-user", displayName: "Expired", lastSeen: now - 120_001 },
    ];

    expect(activeBoardPresence(entries, now)).toEqual([
      { uid: "same-user", displayName: "Current session", lastSeen: now - 1_000 },
      { uid: "active-user", displayName: "Active", lastSeen: now - 2_000 },
    ]);
  });

  it("keeps a session through the exact two-minute boundary", () => {
    const now = 1_000_000;
    expect(
      activeBoardPresence(
        [{ uid: "user", displayName: "Editor", lastSeen: now - 120_000 }],
        now,
      ),
    ).toHaveLength(1);
  });
});
