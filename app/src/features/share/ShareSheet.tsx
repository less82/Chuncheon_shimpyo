// 가족에게 공유 — "키보드 0" 공유 흐름.
// 자녀: 큰 "가족에게 공유" 버튼 탭 → 네이티브 공유시트(있으면) 또는 QR 표시.
// 부모: QR 을 카메라로 스캔 → 링크 열림 → ImportOnLoad 가 즐겨찾기 자동 등록.
// 주소 타이핑 불필요. 모든 동작은 탭·스캔만으로 완결된다.

import { useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { buildShareUrl } from "./shareLink";
import { toQrDataUrl } from "./qr";
import "./ShareSheet.css";

interface Props {
  /** 공유할 정류장 id 목록(보통 즐겨찾기). 비면 홈 링크. */
  ids: string[];
  /** 닫기(옵션) */
  onClose?: () => void;
}

export default function ShareSheet({ ids, onClose }: Props) {
  const url = buildShareUrl(ids);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  // QR 은 로컬 생성(오프라인). 네이티브 공유가 없거나 사용자가 QR 을 요청하면 만든다.
  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    toQrDataUrl(url)
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [showQr, url]);

  const onShare = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: "춘천 정류장 정보",
          text: "가족이 자주 가는 정류장을 별표로 저장해 두었어요.",
          url,
        });
        return;
      } catch {
        // 사용자가 취소했거나 실패 → QR 폴백을 보여준다.
      }
    }
    setShowQr(true);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="sharesheet" aria-label="가족에게 공유">
      <button type="button" className="sharesheet__cta" onClick={onShare}>
        <span className="sharesheet__cta-icon" aria-hidden="true">
          {/* 공유 아이콘 */}
          <Share2 width={28} height={28} aria-hidden="true" />
        </span>
        <span className="sharesheet__cta-label">가족에게 공유</span>
      </button>

      {showQr && (
        <div className="sharesheet__qr" role="group" aria-label="QR 코드로 공유">
          <p className="sharesheet__hint">
            가족이 휴대폰 카메라로 아래 QR 을 비추면 바로 열려요.
          </p>
          {qr ? (
            <img className="sharesheet__qr-img" src={qr} alt="공유 링크 QR 코드" width={240} height={240} />
          ) : (
            <p className="sharesheet__hint">QR 을 만드는 중…</p>
          )}
          <button type="button" className="sharesheet__copy" onClick={onCopy}>
            <span className="sharesheet__copy-icon" aria-hidden="true">
              <Copy width={24} height={24} aria-hidden="true" />
            </span>
            <span>{copied ? "복사했어요" : "링크 복사"}</span>
          </button>
        </div>
      )}

      {onClose && (
        <button type="button" className="sharesheet__close" onClick={onClose}>
          닫기
        </button>
      )}
    </section>
  );
}
