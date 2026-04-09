import { extractCoverUploadImageUrl } from "../cover-upload-response";

describe("extractCoverUploadImageUrl", () => {
  test("reads data.s3_link", () => {
    expect(
      extractCoverUploadImageUrl({
        data: { s3_link: "https://cdn.example.com/a.jpg" },
      })
    ).toBe("https://cdn.example.com/a.jpg");
  });

  test("reads nested url aliases", () => {
    expect(
      extractCoverUploadImageUrl({
        data: { image_url: "https://img.example.com/b.png" },
      })
    ).toBe("https://img.example.com/b.png");
  });

  test("finds first https string in nested object", () => {
    expect(
      extractCoverUploadImageUrl({
        result: { nested: { file: "https://deep.example/c.jpg" } },
      })
    ).toBe("https://deep.example/c.jpg");
  });

  test("returns empty when no url", () => {
    expect(extractCoverUploadImageUrl({ data: { foo: "bar" } })).toBe("");
  });
});
