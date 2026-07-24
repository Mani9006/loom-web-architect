import { describe, expect, it } from "vitest";
import { isMissingStorageObjectError } from "@/lib/storage-errors";

describe("Storage deletion errors", () => {
  it("allows an already-missing object to be treated idempotently", () => {
    expect(isMissingStorageObjectError({ statusCode: 404, message: "Object not found" })).toBe(true);
  });

  it("does not hide missing-bucket or authorization failures", () => {
    expect(isMissingStorageObjectError({ statusCode: 404, message: "Bucket not found" })).toBe(false);
    expect(isMissingStorageObjectError({ statusCode: 403, message: "Object access denied" })).toBe(false);
  });
});
