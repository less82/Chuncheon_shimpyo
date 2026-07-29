// 찾기 허브 — 정류장·노선을 한 화면의 두 탭으로 묶는다.
// 탭은 URL 로 지정한다: /find?tab=stops|routes (기본 stops).
// 조회 기능을 새로 만들지 않고, 이미 만들어 둔 조각들을 그대로 붙인다.
//
// 문의처 탭은 없앴다. 문의는 알리기(/app/report) 한 흐름으로 모은다 —
// 시민이 전화번호 목록에서 담당 부서를 스스로 고르게 하지 않는다.

import { ChevronLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { StopSearch } from "./StopSearch";
import { RouteSearch } from "./RouteSearch";
import "./FindHub.css";

/** 탭 식별자. URL 의 ?tab= 값과 같다. */
export type FindTab = "stops" | "routes";

const TABS: { key: FindTab; label: string }[] = [
  { key: "stops", label: "정류장" },
  { key: "routes", label: "노선" },
];

/** 모르는 값이 오면 기본 탭(정류장)으로 둔다. */
export function parseTab(value: string | null): FindTab {
  return TABS.some((tab) => tab.key === value) ? (value as FindTab) : "stops";
}

export default function FindHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = parseTab(searchParams.get("tab"));

  const select = (tab: FindTab) => setSearchParams({ tab }, { replace: true });

  return (
    <main className="findhub">
      <header className="findhub__bar">
        <Link to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <strong>정류장·노선 찾기</strong>
        <span aria-hidden="true" />
      </header>

      <div className="findhub__tabs" role="tablist" aria-label="찾기 분류">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            id={`findhub-tab-${tab.key}`}
            className={active === tab.key ? "findhub__tab findhub__tab--on" : "findhub__tab"}
            role="tab"
            aria-selected={active === tab.key}
            aria-controls={`findhub-panel-${tab.key}`}
            onClick={() => select(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="findhub__panel"
        id={`findhub-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`findhub-tab-${active}`}
        tabIndex={0}
      >
        {active === "stops" && <StopSearch />}
        {active === "routes" && <RouteSearch />}
      </div>
    </main>
  );
}
