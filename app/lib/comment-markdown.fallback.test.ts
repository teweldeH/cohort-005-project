import { describe, it, expect, vi } from "vitest";
import { renderComment } from "./comment-markdown.server";
import { markdown } from "./text";

vi.mock("shiki", () => ({
  createHighlighter: async () => ({
    codeToHtml: () => {
      throw new Error("highlighting failed");
    },
  }),
}));

describe("renderComment when shiki fails", () => {
  it("falls back to an escaped plain block", async () => {
    const html = await renderComment(
      markdown("```typescript\n<b>bold</b>\n```")
    );

    expect(html).toBe("<pre><code>&lt;b&gt;bold&lt;/b&gt;</code></pre>");
  });
});
