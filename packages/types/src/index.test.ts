import { describe, expect, it } from "vitest";
import { MetadataSchema } from "./index";

describe("MetadataSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = MetadataSchema.parse({
      title: "Receipt",
      categories: ["RECEIPT"],
      tags: [],
      entityLinks: [{ type: "PROFILE", id: "user_1" }],
    });
    expect(result.title).toBe("Receipt");
  });

  it("rejects missing title", () => {
    const parseResult = MetadataSchema.safeParse({
      categories: ["RECEIPT"],
      tags: [],
      entityLinks: [{ type: "PROFILE", id: "user_1" }],
    });
    expect(parseResult.success).toBe(false);
  });
});
