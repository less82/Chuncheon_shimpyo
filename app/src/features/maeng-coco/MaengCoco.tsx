import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  inspectBusStopImage,
  type MaengCocoResult,
} from "./maengCocoApi";
import "./MaengCoco.css";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function MaengCoco() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<MaengCocoResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (selected: File | undefined) => {
    setError("");
    setResult(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.has(selected.type)) {
      setFile(null);
      setError("JPG, PNG, WEBP 사진만 선택할 수 있습니다.");
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("사진은 12MB 이하만 선택할 수 있습니다.");
      return;
    }
    setFile(selected);
  };

  const inspect = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await inspectBusStopImage(file, 0.5));
    } catch (requestError) {
      const message =
        requestError instanceof TypeError
          ? "검사 서버에 연결하지 못했습니다. maeng_coco 실행 스크립트를 먼저 켜주세요."
          : requestError instanceof Error
          ? requestError.message
          : "검사 서버에 연결하지 못했습니다.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const suspected = result?.verdict === "damage_suspected";
  const bestConfidence = result?.detections.reduce(
    (best, detection) => Math.max(best, detection.confidence),
    0,
  );

  return (
    <main className="maengcoco">
      <header className="maengcoco__bar">
        <Link to="/app" aria-label="앱 메인으로 돌아가기">
          <ChevronLeft aria-hidden="true" />
          <span className="sr-only">메인</span>
        </Link>
        <strong>maeng_coco</strong>
        <span aria-hidden="true" />
      </header>

      <section className="maengcoco__content">
        <div className="maengcoco__intro">
          <span><ScanSearch aria-hidden="true" /></span>
          <div>
            <p>정류장 사진 검사</p>
            <h1>사진에서 파손 의심<br />영역을 찾아봅니다</h1>
          </div>
        </div>

        {!file && (
          <label className="maengcoco__picker" htmlFor="maeng-coco-image">
            <ImagePlus aria-hidden="true" />
            <strong>정류장 사진 넣기</strong>
            <small>카메라 촬영 또는 사진 선택 · 최대 12MB</small>
          </label>
        )}

        <input
          ref={inputRef}
          className="sr-only"
          id="maeng-coco-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => chooseFile(event.target.files?.[0])}
        />

        {file && (
          <figure className="maengcoco__preview">
            <img
              src={result?.annotated_image || previewUrl}
              alt={result ? "파손 검사 결과" : "선택한 정류장 사진"}
            />
            {!result && <figcaption>{file.name}</figcaption>}
          </figure>
        )}

        {result && (
          <section
            className="maengcoco__result"
            data-suspected={suspected}
            aria-live="polite"
          >
            {suspected ? (
              <AlertTriangle aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            <div>
              <strong>
                {suspected
                  ? "파손 의심 영역이 있습니다"
                  : "파손 의심 영역을 찾지 못했습니다"}
              </strong>
              <p>
                {suspected
                  ? `${result.detections.length}개 영역 · 최고 신뢰도 ${Math.round((bestConfidence ?? 0) * 100)}%`
                  : "정상 확정이 아니므로 사진을 사람이 다시 확인해주세요."}
              </p>
            </div>
          </section>
        )}

        {error && (
          <p className="maengcoco__error" role="alert">
            <AlertTriangle aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="maengcoco__actions">
          {file && !result && (
            <>
              <button type="button" className="maengcoco__secondary" onClick={reset}>
                다시 선택
              </button>
              <button
                type="button"
                className="maengcoco__primary"
                disabled={loading}
                onClick={() => void inspect()}
              >
                {loading ? (
                  <><LoaderCircle className="maengcoco__spinner" aria-hidden="true" />검사 중</>
                ) : (
                  <><Camera aria-hidden="true" />검사 시작</>
                )}
              </button>
            </>
          )}
          {result && (
            <button type="button" className="maengcoco__primary maengcoco__primary--wide" onClick={reset}>
              <RotateCcw aria-hidden="true" />다른 사진 검사
            </button>
          )}
        </div>

        <p className="maengcoco__notice">
          16장으로 학습한 시험용 모델입니다. 민원 접수나 보수 판단 전에 반드시 사람이 확인해야 합니다.
        </p>
      </section>
    </main>
  );
}
