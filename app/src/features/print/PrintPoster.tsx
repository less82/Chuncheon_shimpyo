// A4 안내문 인쇄 — /print/:id. 큰 글씨로 4시설 3상태를 보여주고 브라우저 인쇄.
// 가족·복지사가 출력해 정류장/경로당에 붙일 수 있게.

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Printer } from "lucide-react";
import { useStops } from "../../store/useStops";
import {
  facilityLabel,
  sourceBadge,
  statusColor,
  KIND_LABEL,
  type FacilityKind,
} from "../../lib/facilityText";
import type { FacilityInfo } from "../../types/stop";
import { buildQrEntryUrl } from "../share/shareLink";
import { toQrDataUrl } from "../share/qr";
import "./print.css";

const ORDER: FacilityKind[] = ["shade", "seat", "light", "sign"];

function Row({ kind, info }: { kind: FacilityKind; info: FacilityInfo }) {
  const source = sourceBadge(info);
  return (
    <div className="poster__row" data-color={statusColor(info.status)}>
      <span className="poster__row-kind">{KIND_LABEL[kind]}</span>
      <span className="poster__row-status">{facilityLabel(info)}</span>
      <span className="poster__row-source">{source}</span>
    </div>
  );
}

export default function PrintPoster() {
  const { id } = useParams();
  const stops = useStops((s) => s.stops);
  const stop = stops.find((s) => s.id === id);
  const [qr, setQr] = useState<string | null>(null);

  // 정류장 QR — 출발 정류장을 고정한 qr_main 링크를 오프라인으로 생성한다.
  useEffect(() => {
    if (!stop) return;
    let alive = true;
    toQrDataUrl(buildQrEntryUrl(stop.id))
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [stop?.id]);

  if (!stop) {
    return (
      <main className="poster poster--missing">
        <p>정류장을 찾을 수 없어요.</p>
        <Link className="poster__back" to="/app">
          지도로 돌아가기
        </Link>
      </main>
    );
  }

  const captured = ORDER.map((k) => stop.facilities[k].capturedAt).find(Boolean);

  return (
    <main className="poster">
      <div className="poster__toolbar">
        <Link className="poster__back" to="/app">
          <ChevronLeft aria-hidden="true" /> 돌아가기
        </Link>
        <button
          type="button"
          className="poster__printbtn"
          onClick={() => window.print()}
        >
          <Printer aria-hidden="true" /> 인쇄하기
        </button>
      </div>

      <article className="poster__sheet">
        <header className="poster__head">
          <span className="poster__brand">춘천 정류장 안내문</span>
          <h1 className="poster__name">{stop.name}</h1>
          {stop.routes.length > 0 && (
            <p className="poster__routes">경유 노선 {stop.routes.join(" · ")}</p>
          )}
        </header>

        <section className="poster__rows" aria-label="시설 현황">
          {ORDER.map((k) => (
            <Row key={k} kind={k} info={stop.facilities[k]} />
          ))}
        </section>

        <section className="poster__qr" aria-label="정류장 즐겨찾기 QR">
          {qr && (
            <img
              className="poster__qr-img"
              src={qr}
              alt={`${stop.name} 정류장 QR 코드`}
              width={140}
              height={140}
            />
          )}
          <p className="poster__qr-text">
            휴대폰 카메라로 찍고 목적지를 말하면 탈 버스와 도착시간을 알려드립니다
          </p>
        </section>

        <footer className="poster__foot">
          <p className="poster__legend">
            <b>있음</b> 확인됨 · <b>없음</b> 없음 · <b>미확인</b> 자료 없음
          </p>
          {captured && <p className="poster__captured">로드뷰 조사 {captured} 기준</p>}
          <p className="poster__made">춘천시 정류장 정보</p>
        </footer>
      </article>
    </main>
  );
}
