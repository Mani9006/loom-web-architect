// Splits a streamed SSE body into complete lines. Network chunks can end in
// the middle of a `data: {...}` line, so the trailing partial line is held
// back and prepended to the next chunk instead of being parsed (and dropped).
export function createSseLineSplitter() {
  let buffer = "";
  return {
    push(text: string): string[] {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
