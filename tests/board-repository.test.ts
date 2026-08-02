import { describe, expect, it } from "vitest";
import {
  boardPermissionSchema,
  storageKindSchema,
  syncStatusSchema,
} from "../src/lib/board-repository";

describe("board repository schemas", () => {
  it("accepts only supported storage, permission, and sync states", () => {
    expect(storageKindSchema.parse("device")).toBe("device");
    expect(boardPermissionSchema.parse("editor")).toBe("editor");
    expect(syncStatusSchema.parse("offline")).toBe("offline");
    expect(storageKindSchema.safeParse("server").success).toBe(false);
  });
});
