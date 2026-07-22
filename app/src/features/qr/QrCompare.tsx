import "./QrCompare.css";

const screens = [
  {
    key: "current",
    title: "현재 앱 화면",
    note: "390 × 844 CSS px",
    width: 390,
    height: 844,
  },
  {
    key: "folder",
    title: "효도폰형 스마트 폴더폰",
    note: "320 × 533 CSS px · 갤럭시 폴더2 기준",
    width: 320,
    height: 533,
  },
] as const;

export default function QrCompare() {
  return (
    <main className="qrcompare">
      <header className="qrcompare__head">
        <h1>QR 화면 크기 비교</h1>
        <p>같은 QR 화면을 현재 스마트폰과 효도폰형 갤럭시 폴더2 화면으로 비교합니다.</p>
      </header>
      <div className="qrcompare__screens">
        {screens.map((screen) => (
          <section className="qrcompare__item" key={screen.key}>
            <div className="qrcompare__label">
              <h2>{screen.title}</h2>
              <span>{screen.note}</span>
            </div>
            <div className="qrcompare__device" style={{ width: screen.width + 16, height: screen.height + 16 }}>
              <iframe
                title={`${screen.title} QR 화면`}
                src="/qr_main?single=1"
                width={screen.width}
                height={screen.height}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
