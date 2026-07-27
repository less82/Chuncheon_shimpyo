// 임시 개발용 테스트 컴포넌트 — OpenRouter Qwen3 VL 8B Instruct 연동 확인용.
// CitizenHome에서 import.meta.env.DEV 일 때만 렌더링한다. 배포 전 제거 전제.

import { useState } from "react";
import { checkFacilityDamage } from "../../lib/facilityCheck";

export default function FacilityAiTest() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  async function onCheck() {
    if (!preview) return;
    setLoading(true);
    setResult(null);
    const res = await checkFacilityDamage(preview);
    setResult(res.text);
    setLoading(false);
  }

  return (
    <section
      style={{
        margin: "8px 16px",
        padding: "10px 12px",
        border: "1px dashed #999",
        borderRadius: 8,
        fontSize: 14,
      }}
    >
      <p style={{ fontWeight: 600, margin: "0 0 8px" }}>
        AI 시설 파손 판별 테스트 (개발용, 배포 전 제거)
      </p>
      <input type="file" accept="image/*" onChange={onFile} />
      {preview && (
        <div style={{ marginTop: 8 }}>
          <img
            src={preview}
            alt="선택한 시설 사진"
            style={{ maxWidth: 200, display: "block", marginBottom: 8 }}
          />
          <button type="button" onClick={onCheck} disabled={loading}>
            {loading ? "판별 중…" : "AI로 파손 확인"}
          </button>
        </div>
      )}
      {result && <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{result}</p>}
    </section>
  );
}
