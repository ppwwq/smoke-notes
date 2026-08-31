/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "packages/ui/src/styles.css"),
  "utf8",
);

function declarationBlock(selector: string): string {
  const escaped = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  return stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("Smoke Notes styling contracts", () => {
  it("keeps recent-note tabs outside the visible note body", () => {
    expect(declarationBlock(".note-window")).toMatch(/padding-left:\s*100px/);
    expect(declarationBlock(".note-window::before")).toMatch(
      /inset:\s*0 0 0 100px/,
    );
    expect(declarationBlock(".recent-note-tabs")).toMatch(/width:\s*100px/);
    expect(declarationBlock(".recent-note-tab")).toMatch(/width:\s*30px/);
    expect(declarationBlock(".recent-note-tab")).toMatch(/justify-self:\s*end/);
    expect(
      declarationBlock(
        ".recent-note-tab:hover,\r\n.recent-note-tab:focus-visible",
      ),
    ).toMatch(/width:\s*100px/);
  });

  it("uses a compact note-kind menu", () => {
    const menuItem = declarationBlock(".note-window-create-menu button");
    expect(menuItem).toMatch(/font-size:\s*10px/);
    expect(menuItem).toMatch(/padding:\s*5px 6px/);
    expect(menuItem).toMatch(/gap:\s*5px/);
  });

  it("hides only the notebook scrollbar without disabling scrolling", () => {
    const notebookScroll = declarationBlock(".notebook-scroll");
    expect(notebookScroll).toMatch(/overflow-y:\s*auto/);
    expect(notebookScroll).toMatch(/scrollbar-width:\s*none/);
    expect(notebookScroll).toMatch(
      /scrollbar-color:\s*transparent transparent/,
    );
  });

  it("dims and crosses out checked task text", () => {
    const completedTask = declarationBlock(
      '.rich-note-content li.task-list-item[data-checked="true"] > div',
    );
    expect(completedTask).toMatch(/color:\s*#727b82/);
    expect(completedTask).toMatch(/text-decoration:\s*line-through/);
  });

  it("keeps task checkboxes circular and on the same row as their text", () => {
    const taskItem = declarationBlock(".rich-note-content li.task-list-item");
    const checkbox = declarationBlock(
      '.rich-note-content li.task-list-item input[type="checkbox"]',
    );

    expect(taskItem).toMatch(/display:\s*flex/);
    expect(checkbox).toMatch(/border-radius:\s*50%/);
  });
});
