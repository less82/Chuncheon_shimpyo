// 앱 내 QR 스캔 — 정류장 QR을 읽고 해당 정류장을 출발지로 고정한 qr_main으로 이동.
// 폰 기본 카메라로도 동일하게 동작하지만(권장), 이 버튼은 어르신 친화 + 시연용.
// 보안: 해독한 텍스트는 extractFavIdsFromScan 화이트리스트로만 통과(주입 방어).

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import jsQR from "jsqr";
import { useStops } from "../../store/useStops";
import { parseQrStopId } from "./shareLink";
import "./QrScanner.css";

interface Props {
  onClose: () => void;
}

type Phase = "starting" | "scanning" | "error";

export default function QrScanner({ onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);

  const stops = useStops((s) => s.stops);
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("starting");
  const [notMine, setNotMine] = useState(false); // 우리 QR 아님(재시도 안내)

  useEffect(() => {
    let alive = true;

    const stop = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const tick = () => {
      if (!alive || handledRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx && w && h) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            const validIds = stops.map((s) => s.id);
            const stopId = parseQrStopId(code.data, validIds);
            if (stopId) {
              handledRef.current = true;
              stop();
              navigate(`/qr_main?from=${encodeURIComponent(stopId)}`, { replace: true });
              return;
            }
            setNotMine(true); // 코드는 읽혔지만 우리 QR 아님 → 계속 스캔
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute("playsinline", "true");
          await video.play().catch(() => {});
        }
        setPhase("scanning");
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (alive) setPhase("error");
      }
    })();

    return () => {
      alive = false;
      stop();
    };
    // stops 는 로드 후 고정 목록 — 최초 마운트 기준으로 스캔 루프 구성.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="qrscan" role="dialog" aria-modal="true" aria-label="QR 스캔">
      <div className="qrscan__stage">
        <video ref={videoRef} className="qrscan__video" muted playsInline />
        <canvas ref={canvasRef} className="qrscan__canvas" hidden />

        {phase !== "error" && (
          <div className="qrscan__frame" aria-hidden="true">
            <span className="qrscan__corner qrscan__corner--tl" />
            <span className="qrscan__corner qrscan__corner--tr" />
            <span className="qrscan__corner qrscan__corner--bl" />
            <span className="qrscan__corner qrscan__corner--br" />
          </div>
        )}

        <p className="qrscan__hint" role="status">
          {phase === "starting" && "카메라를 켜는 중…"}
          {phase === "scanning" &&
            (notMine
              ? "쉼표 정류장 QR이 아니에요. 정류장 QR을 비춰 주세요."
              : "정류장의 QR을 네모 안에 맞춰 주세요.")}
          {phase === "error" &&
            "카메라를 사용할 수 없어요. 휴대폰 기본 카메라로 QR을 비추면 바로 열려요."}
        </p>
      </div>

      <button type="button" className="qrscan__close" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
