import { arrivalsForRoutes, getArrival, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import type { TripOption } from "../../types/trip";

export interface ResolvedTrip {
  option: TripOption;
  arrival: Arrival;
  firstArrivalMin: number | null;
}

function arrivalCandidates(options: TripOption[], maximum: number): TripOption[] {
  const selected: TripOption[] = [];
  const coveredRoutes = new Set<string>();
  for (const option of options) {
    const routeNos = option.legs[0]?.routeNos ?? [];
    if (selected.length > 0 && routeNos.every((routeNo) => coveredRoutes.has(routeNo))) continue;
    selected.push(option);
    routeNos.forEach((routeNo) => coveredRoutes.add(routeNo));
    if (selected.length >= maximum) break;
  }
  return selected;
}

/** 목적지행 후보의 실시간 도착정보를 비교해 가장 빨리 오는 버스를 앞에 둔다. */
export async function rankTripArrivals(
  options: TripOption[],
  stops: Stop[],
  maximumRequests = 8,
): Promise<ResolvedTrip[]> {
  const items = await Promise.all(arrivalCandidates(options, maximumRequests).map(async (option): Promise<ResolvedTrip | null> => {
    const boardStop = stops.find((stop) => stop.id === option.boardStopId);
    if (!boardStop) return null;
    try {
      const arrival = await getArrival(boardStop);
      const firstArrivalMin = arrivalsForRoutes(arrival, option.legs[0]?.routeNos ?? [])[0]?.min ?? null;
      return { option, arrival, firstArrivalMin };
    } catch {
      return null;
    }
  }));

  return items
    .filter((item): item is ResolvedTrip => item !== null)
    .sort((a, b) => {
      if (a.firstArrivalMin !== null && b.firstArrivalMin === null) return -1;
      if (a.firstArrivalMin === null && b.firstArrivalMin !== null) return 1;
      if (a.firstArrivalMin !== null && b.firstArrivalMin !== null && a.firstArrivalMin !== b.firstArrivalMin) {
        return a.firstArrivalMin - b.firstArrivalMin;
      }
      return (a.option.walkMin + (a.option.destinationWalkMin ?? 0))
        - (b.option.walkMin + (b.option.destinationWalkMin ?? 0));
    });
}
