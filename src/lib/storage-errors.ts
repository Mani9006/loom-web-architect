type StorageErrorShape = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  error?: unknown;
};

/**
 * Removing an already-missing object is idempotent. Other Storage failures
 * (authorization, networking, or a missing bucket) must stop the database-row
 * deletion so the UI does not report a false success.
 */
export function isMissingStorageObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as StorageErrorShape;
  const message = [candidate.message, candidate.error]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const status = Number(candidate.statusCode ?? candidate.status);

  if (/bucket\b.*(?:not found|does not exist)/i.test(message)) return false;

  return (
    status === 404 &&
    /(?:object|file|resource)\b.*(?:not found|does not exist)|(?:not found|does not exist)\b.*(?:object|file|resource)/i.test(
      message,
    )
  );
}
