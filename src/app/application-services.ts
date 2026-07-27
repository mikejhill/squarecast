import { ApplicationStateService } from "../lib/application-state";
import { BoardFactory } from "../lib/board-factory";
import { BoardDocumentService } from "../lib/board-document";
import { StateCodec } from "../lib/codec";
import {
  CsvAnswerParser,
  CsvAnswerSerializer,
  CsvFileImporter,
} from "../lib/csv";
import { DuplicateCardDetector } from "../lib/duplicates";
import { EditorStateService } from "../lib/editor-state";
import { AutoFontSizePolicy, FontSizeOptimizer } from "../lib/font-size";
import { BoardGenerator } from "../lib/generator";
import { UrlHistoryService } from "../lib/history";
import { PlayerSessionService } from "../lib/player-session";
import { AppearancePreferenceStore } from "../lib/preferences";
import { SampleBoardCatalog } from "../lib/sample-boards";
import { AnswerPoolSorter } from "../lib/sorting";
import { AppearanceResolver } from "../lib/theme";
import { ClipboardService } from "../services/clipboard-service";
import { FileDownloadService } from "../services/file-download-service";

/**
 * Constructs and exposes the application's long-lived service graph.
 *
 * Keeping composition in one class makes dependencies explicit while React
 * components consume stable service instances across every render.
 */
export class ApplicationServices {
  public readonly codec = new StateCodec();
  public readonly generator = new BoardGenerator();
  public readonly boardFactory = new BoardFactory();
  public readonly sampleBoards = new SampleBoardCatalog();
  public readonly boardDocuments = new BoardDocumentService();
  public readonly csvParser = new CsvAnswerParser();
  public readonly csvSerializer = new CsvAnswerSerializer();
  public readonly csvFileImporter = new CsvFileImporter(this.csvParser);
  public readonly sorter = new AnswerPoolSorter();
  public readonly editorState = new EditorStateService(this.sorter);
  public readonly playerSession = new PlayerSessionService(this.generator);
  public readonly appearanceResolver = new AppearanceResolver();
  public readonly fontSizeOptimizer = new FontSizeOptimizer();
  public readonly autoFontSizePolicy = new AutoFontSizePolicy();
  public readonly duplicateCardDetector = new DuplicateCardDetector();
  public readonly clipboard = new ClipboardService();
  public readonly downloads = new FileDownloadService();
  public readonly state = new ApplicationStateService(
    this.codec,
    this.generator,
    this.boardFactory,
    this.sampleBoards,
  );
  public readonly history = new UrlHistoryService(window.history);
  public readonly appearancePreferences =
    AppearancePreferenceStore.createBrowserStore();
}

export const applicationServices = new ApplicationServices();
