// 목적지 길찾기 엔진 (순수 함수).
// 현위치 도보권의 출발 후보 정류장 각각에서 목적지 정류장까지
// 직행(같은 노선, 출발<목적지) 또는 1환승(환승역 공유) 경로를 찾는다.
// 네트워크·키 불필요 — 로컬 routes.json 만으로 동작. 미도달이면 [].

import type { Stop } from "../../types/stop";
import type { RouteInfo } from "../../types/route";
import type { TripLeg, TripOption } from "../../types/trip";
import { haversine, type LatLng } from "../../lib/geo";

export interface PlanOptions {
  /** 지정하면 현위치 주변 탐색 대신 이 정류장만 출발지로 사용한다. */
  boardStopId?: string;
  /** 출발 후보 도보 반경(m). 기본 500m(≈도보 6분). */
  walkRadiusM?: number;
  /** 출발 후보 정류장 최대 개수(가까운 순). 기본 5. */
  maxCandidates?: number;
  /** 허용 환승 횟수(0=직행만, 1=1환승). 기본 1. */
  maxTransfers?: number;
  /** 도보속도(m/분). 기본 80. */
  walkSpeed?: number;
}

const DEFAULTS: Required<Omit<PlanOptions, "boardStopId">> = {
  walkRadiusM: 500,
  maxCandidates: 5,
  maxTransfers: 1,
  walkSpeed: 80,
};

interface RouteIndex {
  routeNo: string;
  /** 관리번호 → 정류장순서 index */
  pos: Map<string, number>;
  stops: string[];
}

function buildRouteIndexes(routes: RouteInfo[]): RouteIndex[] {
  return routes.map((r) => {
    const pos = new Map<string, number>();
    r.stops.forEach((s, i) => {
      // 노선에 같은 정류장이 두 번 나오면 첫 등장만 index 로 사용.
      if (!pos.has(s)) pos.set(s, i);
    });
    return { routeNo: r.routeNo, pos, stops: r.stops };
  });
}

/** 특정 정류장을 경유하는 노선 index 목록. */
function routesServing(indexes: RouteIndex[], stopId: string): RouteIndex[] {
  return indexes.filter((r) => r.pos.has(stopId));
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * 현위치(fromPos)에서 목적지(destStop)로 가는 버스 경로 후보를 찾는다.
 * directBus 우선, 같은 종류 안에서는 도보시간 짧은 순으로 정렬.
 */
export function planTrip(
  fromPos: LatLng,
  destStop: Stop,
  stops: Stop[],
  routes: RouteInfo[],
  opts?: PlanOptions,
): TripOption[] {
  const cfg = { ...DEFAULTS, ...opts };
  const indexes = buildRouteIndexes(routes);

  // 출발 후보: 도보권 내 정류장(목적지 제외), 가까운 순으로 제한.
  const candidates = stops
    .filter((s) => s.id !== destStop.id)
    .filter((s) => !opts?.boardStopId || s.id === opts.boardStopId)
    .map((s) => ({
      stop: s,
      dist: haversine(fromPos, { lat: s.lat, lng: s.lng }),
    }))
    .filter((c) => c.dist <= cfg.walkRadiusM)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, cfg.maxCandidates);

  const directOptions: TripOption[] = [];
  const transferOptions: TripOption[] = [];

  for (const cand of candidates) {
    const boardId = cand.stop.id;
    const walkMin = Math.max(1, Math.round(cand.dist / cfg.walkSpeed));
    const boardRoutes = routesServing(indexes, boardId);
    if (boardRoutes.length === 0) continue;

    // ── 직행: board < dest 순서인 노선.
    const directRouteNos: string[] = [];
    for (const r of boardRoutes) {
      const bi = r.pos.get(boardId)!;
      const di = r.pos.get(destStop.id);
      if (di !== undefined && bi < di) directRouteNos.push(r.routeNo);
    }
    if (directRouteNos.length > 0) {
      directOptions.push({
        boardStopId: boardId,
        walkMin,
        walkReal: false,
        directBus: true,
        legs: [
          {
            routeNos: uniq(directRouteNos),
            boardStopId: boardId,
            alightStopId: destStop.id,
          },
        ],
      });
      continue; // 직행이 있으면 이 출발지에서 환승 탐색 생략.
    }

    if (cfg.maxTransfers < 1) continue;

    // ── 1환승: board 하류 정류장 T 에서 목적지 노선(T<dest)으로 갈아탐.
    // T 별로 leg1(→T)·leg2(T→dest) 노선을 모은다.
    const perTransfer = new Map<
      string,
      { leg1: Set<string>; leg2: Set<string> }
    >();

    for (const r1 of boardRoutes) {
      const bi = r1.pos.get(boardId)!;
      for (let i = bi + 1; i < r1.stops.length; i++) {
        const t = r1.stops[i];
        if (t === destStop.id) continue; // 그건 직행(위에서 처리됨)
        // T 에서 목적지로 가는 노선이 있는가?
        const r2s = routesServing(indexes, t).filter((r2) => {
          const ti = r2.pos.get(t)!;
          const di = r2.pos.get(destStop.id);
          return di !== undefined && ti < di;
        });
        if (r2s.length === 0) continue;
        let entry = perTransfer.get(t);
        if (!entry) {
          entry = { leg1: new Set(), leg2: new Set() };
          perTransfer.set(t, entry);
        }
        entry.leg1.add(r1.routeNo);
        for (const r2 of r2s) entry.leg2.add(r2.routeNo);
      }
    }

    for (const [t, legsData] of perTransfer) {
      const legs: TripLeg[] = [
        {
          routeNos: Array.from(legsData.leg1),
          boardStopId: boardId,
          alightStopId: t,
        },
        {
          routeNos: Array.from(legsData.leg2),
          boardStopId: t,
          alightStopId: destStop.id,
        },
      ];
      transferOptions.push({
        boardStopId: boardId,
        walkMin,
        walkReal: false,
        directBus: false,
        transferStopId: t,
        legs,
      });
    }
  }

  directOptions.sort((a, b) => a.walkMin - b.walkMin);
  transferOptions.sort((a, b) => a.walkMin - b.walkMin);

  // 직행 우선, 그다음 환승.
  return [...directOptions, ...transferOptions];
}
