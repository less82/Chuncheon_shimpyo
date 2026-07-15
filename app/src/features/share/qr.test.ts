import { describe, it, expect } from "vitest";
import { toQrDataUrl } from "./qr";

describe("toQrDataUrl", () => {
  it("문자열을 data:image/ 로 시작하는 data URL 로 변환한다", async () => {
    const url = await toQrDataUrl("https://x");
    expect(url.startsWith("data:image/")).toBe(true);
  });

  it("빈 문자열이면 throw 한다(방어)", async () => {
    await expect(toQrDataUrl("")).rejects.toThrow();
    await expect(toQrDataUrl("   ")).rejects.toThrow();
  });
});
