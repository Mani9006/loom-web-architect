import { describe, expect, it } from "vitest";
import { createSseLineSplitter } from "../../supabase/functions/_shared/sse-lines";

// Regression: the Anthropic -> OpenAI stream converters in resume-chat and
// chat split each network chunk on "\n" independently, so a `data: {...}`
// line cut by a chunk boundary failed JSON.parse and was silently dropped.
describe("SSE line splitter", () => {
  it("carries a partial line across chunks", () => {
    const splitter = createSseLineSplitter();
    const event = 'data: {"type":"content_block_delta","delta":{"text":"Hello"}}';
    const cut = 20;

    expect(splitter.push(`event: content_block_delta\n${event.slice(0, cut)}`)).toEqual([
      "event: content_block_delta",
    ]);
    expect(splitter.push(`${event.slice(cut)}\n\n`)).toEqual([event, ""]);
    expect(JSON.parse(event.slice(6)).delta.text).toBe("Hello");
  });

  it("flushes a trailing line without a newline", () => {
    const splitter = createSseLineSplitter();
    expect(splitter.push('data: {"type":"message_stop"}')).toEqual([]);
    expect(splitter.flush()).toEqual(['data: {"type":"message_stop"}']);
    expect(splitter.flush()).toEqual([]);
  });
});
