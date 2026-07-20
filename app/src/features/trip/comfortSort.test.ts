import { describe, it, expect } from "vitest";
import type { Stop, FacilityInfo } from "../../types/stop";
import { makeUnknown } from "../../types/stop";
import type { TripOption } from "../../types/trip";
import { sortByComfort, comfortSentence } from "./comfortSort";

function yes(source: FacilityInfo["source"] = "bench_registry"): FacilityInfo {
  return { status: "yes", source };
}

function mkStop(
  id: string,
  overrides?: Partial<Stop["facilities"]>,
): Stop {
  return {
    id,
    stopNo: id,
    name: `정류장${id}`,
    lat: 37.88,
    lng: 127.73,
    routes: [],
    facilities: {
      shade: makeUnknown(),
      seat: makeUnknown(),
      light: makeUnknown(),
      sign: makeUnknown(),
      ...overrides,
    },
  };
}

function mkOption(boardStopId: string, walkMin: number): TripOption {
  return {
    boardStopId,
    walkMin,
    walkReal: false,
    directBus: true,
    legs: [{ routeNos: ["7"], boardStopId, alightStopId: "DEST" }],
  };
}

describe("sortByComfort", () => {
  it("(a) mode 토글별 정렬 결과가 다르다", () => {
    const confirmed = mkStop("A", { seat: yes() }); // 시설 확인, 도보 조금 더 김
    const unconfirmed = mkStop("B"); // 시설 미확인, 도보 더 짧음
    const stopsById = new Map([
      ["A", confirmed],
      ["B", unconfirmed],
    ]);
    const options = [mkOption("A", 5), mkOption("B", 3)];

    const nearest = sortByComfort(options, stopsById, "nearest");
    const comfort = sortByComfort(options, stopsById, "comfort");

    expect(nearest[0].boardStopId).toBe("B");
    expect(comfort[0].boardStopId).toBe("A");
    expect(nearest.map((o) => o.boardStopId)).not.toEqual(
      comfort.map((o) => o.boardStopId),
    );
  });

  it("(b) 의자·그늘 확인 + 도보 +1분인 후보가 미확인·최단 후보보다 comfort 모드에서 앞선다", () => {
    const confirmed = mkStop("A", { seat: yes(), shade: yes() });
    const unconfirmed = mkStop("B");
    const stopsById = new Map([
      ["A", confirmed],
      ["B", unconfirmed],
    ]);
    // A가 1분 더 걸림에도 확인된 시설(seat+shade)이 있으므로 앞서야 한다.
    const options = [mkOption("B", 3), mkOption("A", 4)];

    const comfort = sortByComfort(options, stopsById, "comfort");
    expect(comfort[0].boardStopId).toBe("A");
  });

  it("(c) 도보 차이가 크면(+8분) 최단 후보가 앞선다(패널티 동작)", () => {
    const confirmed = mkStop("A", { seat: yes(), shade: yes() });
    const unconfirmed = mkStop("B");
    const stopsById = new Map([
      ["A", confirmed],
      ["B", unconfirmed],
    ]);
    const options = [mkOption("B", 2), mkOption("A", 10)];

    const comfort = sortByComfort(options, stopsById, "comfort");
    expect(comfort[0].boardStopId).toBe("B");
  });

  it("stopsById에 없는 정류장은 comfort 0 취급으로 처리된다(에러 없음)", () => {
    const stopsById = new Map<string, Stop>();
    const options = [mkOption("X", 3), mkOption("Y", 5)];
    const comfort = sortByComfort(options, stopsById, "comfort");
    expect(comfort.map((o) => o.boardStopId)).toEqual(["X", "Y"]);
  });
});

describe("comfortSentence", () => {
  it("(d) 반환 문구에 점수 숫자(0. · 점) 패턴이 없다", () => {
    const stop = mkStop("A", { seat: yes() });
    const sentence = comfortSentence(stop);
    expect(sentence).not.toMatch(/0\./);
    expect(sentence).not.toMatch(/점/);
  });

  it("(e) 시설별 문구 4종이 정확하다", () => {
    const seatStop = mkStop("A", { seat: yes() });
    expect(comfortSentence(seatStop)).toMatch(/앉아서 기다릴 수 있어요/);

    const shadeOnly = mkStop("B", { shade: yes() });
    expect(comfortSentence(shadeOnly)).toBe("그늘이 확인된 정류장이에요");

    const lightOnly = mkStop("C", { light: yes() });
    expect(comfortSentence(lightOnly, { night: true })).toBe(
      "조명이 확인된 정류장이에요",
    );

    const none = mkStop("D");
    expect(comfortSentence(none)).toBe("시설 정보가 아직 확인되지 않았어요");
  });

  it("(f) 의자 미확인(그늘만 yes) 카드 문구에 '앉아서'가 포함되지 않는다", () => {
    const shadeOnly = mkStop("B", { shade: yes() });
    expect(comfortSentence(shadeOnly)).not.toMatch(/앉아서/);
  });

  it("의자 yes면 sourceBadge가 병기된다", () => {
    const stop = mkStop("A", { seat: yes("bench_registry") });
    const sentence = comfortSentence(stop);
    expect(sentence).toMatch(/벤치대장 기준/);
  });
});
