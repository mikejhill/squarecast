import { IdFactory, type EditorState } from "./model";
import { ColorTheme } from "./theme";

export class BoardFactory {
  public createNewEditor(random: () => number = Math.random): EditorState {
    const accentColor = ColorTheme.random(random);
    return {
      v: 1,
      mode: "edit",
      config: {
        title: "",
        size: 5,
        free: true,
        freeLabel: "FREE",
        theme: "custom",
        accentColor,
        fontMode: "auto",
        fontSize: 18,
        sortMode: "alphabetical",
        previewSeed: IdFactory.seed(),
      },
      answers: [],
    };
  }
}
