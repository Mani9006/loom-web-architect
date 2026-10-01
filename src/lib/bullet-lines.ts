/** Split "one bullet per line" textarea text into non-empty bullets. */
export function parseBulletLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim());
}
