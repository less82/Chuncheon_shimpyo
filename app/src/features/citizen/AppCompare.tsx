import "./AppCompare.css";

const screens = [
  { key: "current", title: "현재 앱 화면", note: "390 × 844 CSS px", width: 390, height: 844 },
  { key: "folder", title: "스마트 폴더폰", note: "320 × 533 CSS px · 갤럭시 폴더2 기준", width: 320, height: 533 },
] as const;

export default function AppCompare() {
  return (
    <main className="appcompare">
      <header className="appcompare__head"><h1>앱 화면 크기 비교</h1><p>같은 앱 메인을 일반 스마트폰과 작은 폴더폰 화면에서 함께 확인합니다.</p></header>
      <div className="appcompare__screens">
        {screens.map((screen) => (
          <section className="appcompare__item" key={screen.key}>
            <div className="appcompare__label"><h2>{screen.title}</h2><span>{screen.note}</span></div>
            <div className="appcompare__device" style={{ width: screen.width + 16, height: screen.height + 16 }}>
              <iframe title={`${screen.title} 앱 화면`} src="/app?single=1" width={screen.width} height={screen.height} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
