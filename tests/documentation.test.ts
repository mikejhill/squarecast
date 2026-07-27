import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import {
  dirname,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type DocumentationLink = {
  readonly source: string;
  readonly target: string;
  readonly anchor?: string;
};

/**
 * Discovers repository Markdown and resolves its local links using the same
 * relative-path model used by GitHub's renderer.
 */
class DocumentationCatalog {
  private readonly root = fileURLToPath(new URL("../", import.meta.url));

  /** Returns the public README and every technical guide in stable order. */
  public files(): string[] {
    const guides = readdirSync(resolve(this.root, "docs"))
      .filter((name) => name.endsWith(".md"))
      .sort()
      .map((name) => resolve(this.root, "docs", name));
    return [resolve(this.root, "README.md"), ...guides];
  }

  /** Extracts non-remote Markdown links and resolves them from their source. */
  public links(file: string): DocumentationLink[] {
    const content = readFileSync(file, "utf8");
    return Array.from(content.matchAll(/\[[^\]]*]\(([^)]+)\)/g))
      .map((match) => match[1]!)
      .filter(
        (target) =>
          !target.startsWith("http://") &&
          !target.startsWith("https://") &&
          !target.startsWith("mailto:"),
      )
      .map((target) => {
        const [path = "", anchor] = target.split("#", 2);
        return {
          source: file,
          target: path ? resolve(dirname(file), path) : file,
          anchor,
        };
      });
  }

  /** Produces GitHub-compatible heading anchors for local section checks. */
  public anchors(file: string): Set<string> {
    const headings = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
        return match?.[1] ? [this.slug(match[1])] : [];
      });
    return new Set(headings);
  }

  public displayPath(file: string): string {
    return relative(this.root, file).replaceAll("\\", "/");
  }

  private slug(heading: string): string {
    return heading
      .trim()
      .toLowerCase()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }
}

describe("project documentation", () => {
  const catalog = new DocumentationCatalog();

  it("keeps every local Markdown link and heading anchor resolvable", () => {
    for (const source of catalog.files()) {
      for (const link of catalog.links(source)) {
        expect(
          existsSync(link.target),
          `${catalog.displayPath(source)} links to missing ${catalog.displayPath(
            link.target,
          )}`,
        ).toBe(true);
        if (link.anchor) {
          expect(
            catalog.anchors(link.target).has(link.anchor),
            `${catalog.displayPath(source)} links to missing #${
              link.anchor
            } in ${catalog.displayPath(link.target)}`,
          ).toBe(true);
        }
      }
    }
  });

  it("lists every technical guide in the documentation index", () => {
    const index = readFileSync(
      fileURLToPath(new URL("../docs/README.md", import.meta.url)),
      "utf8",
    );
    const guideNames = readdirSync(
      fileURLToPath(new URL("../docs", import.meta.url)),
    ).filter((name) => name.endsWith(".md") && name !== "README.md");

    for (const guide of guideNames) {
      expect(index, `${guide} is absent from docs/README.md`).toContain(
        `(${guide})`,
      );
    }
  });

  it("retains the repository social preview referenced by the README", () => {
    expect(
      existsSync(
        fileURLToPath(new URL("../public/og.png", import.meta.url)),
      ),
    ).toBe(true);
  });
});
