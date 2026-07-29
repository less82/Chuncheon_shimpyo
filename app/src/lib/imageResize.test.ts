import { afterEach, describe, expect, it, vi } from "vitest";
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX, shrinkPhotoDataUrl } from "./imageResize";

const JPEG_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

afterEach(() => vi.unstubAllGlobals());

describe("shrinkPhotoDataUrl", () => {
  it("기본값은 긴 변 1024px, 품질 0.7 이다", () => {
    expect(PHOTO_MAX_EDGE_PX).toBe(1024);
    expect(PHOTO_JPEG_QUALITY).toBe(0.7);
  });

  it("createImageBitmap 이 없는 환경에서는 원본을 그대로 돌려준다", async () => {
    // jsdom 에는 createImageBitmap 이 없다. 기능이 깨지지 않아야 한다.
    expect(typeof createImageBitmap).not.toBe("function");
    await expect(shrinkPhotoDataUrl(JPEG_DATA_URL)).resolves.toBe(JPEG_DATA_URL);
  });

  it("축소가 실패하면 원본을 그대로 돌려준다", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.reject(new Error("decode 실패")));
    await expect(shrinkPhotoDataUrl(JPEG_DATA_URL)).resolves.toBe(JPEG_DATA_URL);
  });

  it("dataURL 형태가 아니면 원본을 그대로 돌려준다", async () => {
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 100, height: 100 }));
    await expect(shrinkPhotoDataUrl("그냥 문자열")).resolves.toBe("그냥 문자열");
  });

  it("줄인 결과가 더 짧으면 축소본을 돌려준다", async () => {
    const shrunk = "data:image/jpeg;base64,AAA=";
    vi.stubGlobal("createImageBitmap", () => Promise.resolve({ width: 4000, height: 3000 }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: () => shrunk,
    };
    vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLElement);

    const long = `data:image/jpeg;base64,${"A".repeat(200)}`;
    await expect(shrinkPhotoDataUrl(long)).resolves.toBe(shrunk);
    // 긴 변이 1024px 로 맞춰진다(4000 x 3000 → 1024 x 768)
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
    vi.restoreAllMocks();
  });
});
