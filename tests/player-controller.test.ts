import { describe, expect, it, vi } from "vitest";
import type { ApplicationServices } from "../src/app/application-services";
import { PlayerController } from "../src/controllers/PlayerController";
import { BoardGenerator } from "../src/lib/generator";
import { BoardModel } from "../src/lib/model";
import { PlayerSessionService } from "../src/lib/player-session";

const createServices = () => {
  const generator = new BoardGenerator();
  return {
    generator,
    playerSession: new PlayerSessionService(generator),
    clipboard: { copy: vi.fn(async () => undefined) },
  } as unknown as ApplicationServices;
};

describe("player controller", () => {
  it("coordinates marks, reshuffling, source editing, wins, and copying", async () => {
    const services = createServices();
    const play = services.generator.generate(
      BoardModel.createDefaultEditor(),
      "controller",
    );
    play.checked = [0, 1, 2, 3, 4];
    const onChange = vi.fn();
    const controller = new PlayerController(play, onChange, services);

    expect(controller.winningCells.size).toBe(5);
    controller.toggleCell(5);
    controller.toggleCell(
      BoardModel.freeCellIndexes(play.size, play.source.config.free)[0]!,
    );
    controller.reshuffle();
    controller.editSource();
    await controller.copySession("https://example.test/session");

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledWith(play.source, "push");
    expect(services.clipboard.copy).toHaveBeenCalledWith(
      "https://example.test/session",
    );
  });
});
