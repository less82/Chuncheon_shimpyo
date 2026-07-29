/**
 * 사진 dataURL 축소.
 *
 * 요즘 휴대폰 사진은 3~8MB 이고 dataURL(base64)로 바꾸면 약 1.33배로 커진다.
 * 브라우저 localStorage 는 4MB 안팎에서 막히므로, 저장 전에 반드시 줄여야 한다.
 *
 * 줄이지 못하는 환경(테스트용 jsdom 등)에서는 원본을 그대로 돌려준다 — 기능을 깨지 않는다.
 */

/** 저장용 사진의 긴 변 상한(px). 현장 확인에 원본 해상도는 필요 없다. */
export const PHOTO_MAX_EDGE_PX = 1024;

/** 저장용 사진 재인코딩 품질. */
export const PHOTO_JPEG_QUALITY = 0.7;

/** base64 dataURL 을 Blob 으로 바꾼다. 형태가 다르면 null. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  if (!header.startsWith("data:image/") || !header.includes(";base64")) return null;
  try {
    const mime = header.slice(5, header.indexOf(";"));
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * 사진 dataURL 을 긴 변 1024px JPEG 로 다시 인코딩한다.
 * 결과가 원본보다 크면(이미 작고 잘 눌린 사진이면) 원본을 돌려준다.
 * createImageBitmap 이 없거나 실패하면 원본을 그대로 돌려준다.
 */
export async function shrinkPhotoDataUrl(dataUrl: string): Promise<string> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return dataUrl;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const shrunk = canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
    if (!shrunk.startsWith("data:image/")) return dataUrl;
    return shrunk.length < dataUrl.length ? shrunk : dataUrl;
  } catch {
    return dataUrl;
  }
}
