// 로컬(오프라인) QR 코드 생성. 네트워크/키 불필요 — data URL 로 즉시 이미지화.
// "키보드 0": 자녀가 공유 버튼을 누르면 이 QR 을 부모가 카메라로 스캔해 링크가 열린다.

import QRCode from "qrcode";

/** 텍스트(공유 URL)를 QR PNG data URL 로 만든다. 빈 문자열이면 throw(방어). */
export async function toQrDataUrl(text: string): Promise<string> {
  if (!text || !text.trim()) {
    throw new Error("QR 로 만들 텍스트가 비어 있습니다.");
  }
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#1c1917", light: "#ffffff" },
  });
}
