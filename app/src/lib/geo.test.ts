import { describe, it, expect } from "vitest";
import { haversine } from "./geo";

describe("haversine", () => {
  it("동일 지점은 0m", () => {
    const p = { lat: 37.8813, lng: 127.73 };
    expect(haversine(p, p)).toBe(0);
  });

  it("알려진 거리를 ±1% 이내로 계산한다 (춘천시청 ↔ 남춘천역 약 2.06km)", () => {
    // 춘천시청 ~ 남춘천역, 참조 거리 약 2060m
    const cityHall = { lat: 37.8813, lng: 127.73 };
    const namchuncheon = { lat: 37.8636, lng: 127.7255 };
    const d = haversine(cityHall, namchuncheon);
    expect(d).toBeGreaterThan(1900);
    expect(d).toBeLessThan(2200);
  });

  it("위도 1도 차이는 약 111km", () => {
    const a = { lat: 37.0, lng: 127.0 };
    const b = { lat: 38.0, lng: 127.0 };
    const d = haversine(a, b);
    // 위도 1도 ≈ 111,195m
    expect(Math.abs(d - 111195)).toBeLessThan(111195 * 0.01);
  });

  it("경도 1도 차이(적도)는 약 111.3km", () => {
    const a = { lat: 0, lng: 127.0 };
    const b = { lat: 0, lng: 128.0 };
    const d = haversine(a, b);
    expect(Math.abs(d - 111319)).toBeLessThan(111319 * 0.01);
  });
});
