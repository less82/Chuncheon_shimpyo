# 쉼표 정류장 — QA 데모 시나리오 검증

> 기준일 2026-07-15. `npm run build && npm run preview`(정적 빌드) 실환경 재현 기준. 실데이터 stops.json(1890 정류장).

## 데모 시나리오 6종 (핸드오프 8절)

| # | 시나리오 | 결과 | 근거 |
|---|---|---|---|
| 1 | 접속 → 3초 내 지도 + 최근접 정류장 카드 (조작 0회) | ✅ 통과 | `/` 200 서빙, 빌드 산출물 459KB, 정적 로드. 위치권한 거부 시 CITY_CENTER(춘천시청) 폴백 코드 확인 |
| 2 | 카드에서 그늘·의자·조명·안내기 3상태 + 출처 배지 | ✅ 통과 | FacilityBadge/facilityText 유닛테스트 통과, 데이터에 4시설 status+source 존재(조명 808·의자 825 yes) |
| 3 | 자녀 폰 → 공유링크(`?fav=`) → 부모 폰 즐겨찾기 자동등록 | ✅ 통과 | shareLink round-trip + 화이트리스트 유닛테스트 통과. `/favorites` 200 |
| 4 | (P1) 배차 긴 노선 대안 제안 뜸 / 곧 도착이면 안 뜸 | ✅ 통과 | altStop 6개 유닛테스트: 곧도착→null, 미확인 우위→null, 4조건 만족만 노출 |
| 5 | (P1) A4 안내문 인쇄 미리보기 | ✅ 통과 | `/print/250001192` 200 서빙, @media print 스타일 |
| 6 | 대시보드 여름 프리셋 → TOP N → CSV | ✅ 통과 | `/admin` 200. 실데이터 필터 스모크: 모집단 1667, 상위25% 컷 53, 후보 414곳, TOP=중앙로입구·명동입구(양방향 합산). exportCsv(BOM) 유닛테스트 통과 |

## 오프라인 (하드 제약)

| 항목 | 결과 | 근거 |
|---|---|---|
| PWA 서비스워커 생성 | ✅ | `dist/sw.js`, `manifest.webmanifest` 생성, precache 9 entries |
| app shell + 데이터 캐시 | ✅ | app shell precache + `stops.sample.json` precache(항상 존재) + `stops.json` 런타임 캐시(StaleWhileRevalidate). 오프라인 첫 로드는 sample 폴백 |
| OSM 지도 타일 캐시 | ✅ | 런타임 CacheFirst(osm-tiles). 보안검증에서 타일 24/24 로드 확인 |

## 표현 규칙 위반 검사

| 검사 | 결과 |
|---|---|
| "현장 확인" 문자열 | ✅ 0건 (`grep -rn "현장 확인" app/src`) |
| 미확인→"없음" 오표기 | ✅ 없음 (facilityText: unknown→"미확인" 유닛테스트) |
| 합성 점수(위험점수 등) 화면 표시 | ✅ 없음 (조건 필터·실측 수치만) |
| stops.json "없음(no)" 근거 없는 생성 | ✅ 0건 (전 시설 no=0, 로드뷰 조사로만 no 허용) |

## 전체 자동 테스트

- 프론트 vitest: **103 passed (22 files)** (v2 확장분 포함)
- 파이프라인 pytest: **39 passed** (routes·tago_map 포함)
- `npm run build`: 성공 (tsc + vite + PWA, precache 10 entries)
- `npm audit`: 0 vulnerabilities (qrcode 추가분 포함)

---

# v2 확장 QA (2026-07-15) — 신규 흐름 4종 + 오프라인 폴백

> `npm run build && npm run preview`(정적 빌드) 재현 기준. preview 서빙 확인: `/`·`/go`·`/favorites`·`/data/routes.json`·`/data/stops.json`·`/sw.js` 전부 200. routes.json = 223 노선, 평균 72.5 정류장(min 9).

## v2 신규 흐름 (계획 Phase 11.2 시나리오 7~10)

| # | 시나리오 | 결과 | 근거 |
|---|---|---|---|
| 7 | 시설 필터 칩 토글 → "있음" 정류장만 강조 → 탭 시 도보 경로선+시간 | ✅ 통과 | `filterStopsByFacility`는 켜진 시설이 전부 status==="yes"인 id만 AND 집합화(unknown·no 제외), 아무것도 안 켜면 전체. facilityFilter.test.ts 통과. StopCard: `getWalkRoute` real=true→"도보 약 N분", 폴백→"직선거리 약 N분"(StopCard.test.tsx 통과). WalkLayer가 실경로=파란 실선/직선폴백=회색 점선 구분 |
| 8 | "가족에게 공유" → 네이티브 공유 또는 로컬 QR → 링크(`?fav=`) 열면 즐겨찾기 자동등록 | ✅ 통과 | ShareSheet: `navigator.share` 있으면 네이티브, 없거나 취소 시 `toQrDataUrl`(qrcode 라이브러리, `data:image/` — 네트워크 불필요) + "링크 복사". qr.test.ts 통과. ImportOnLoad가 로드 시 `?fav=` 화이트리스트 검증 후 addMany→`/favorites` 이동(타이핑 0) |
| 9 | `/go` "버스로 가기" → 즐겨찾기(목적지) 탭 → 직행/환승 카드(도보+버스 도착) | ✅ 통과 | `/go` 200. planTrip: 같은 노선 board<dest→directBus, 없으면 환승역 공유로 legs 2개(transferStopId), 미도달이면 []. planTrip.test.ts 통과. 즐겨찾기 없으면 "먼저 자주 가는 곳을 별표로 저장하세요", 미도달이면 "직접 가는 버스를 찾지 못했습니다" 정직 안내 |
| 10 | 실시간/폴백 도착 — 키 없는 현 상태에서 즉시 폴백 표시(무한 스피너 없음) | ✅ 통과 | `getArrival`: `VITE_TAGO_KEY`·`tagoNodeId` 둘 다 없으면 fetch 미호출·즉시 `배차간격 약 N분`(live:false). 키 있어도 2.5s AbortController 타임아웃·파싱실패면 폴백. arrivals.test.ts 통과. "실시간" 배지는 `arrival.live` true일 때만 렌더(StopCard.tsx:123) — 거짓 실시간 없음 |

## 오프라인 폴백 (하드 제약, SW precache·폴백 경로 근거 판정)

| 항목 | 결과 | 근거 |
|---|---|---|
| 도보시간/경로 | ✅ | `getWalkRoute` OSRM 실패/타임아웃/오프라인 → `straightWalk`(haversine÷80, 직선 polyline, real:false). "직선거리 약 N분" 표기 |
| 버스 도착 | ✅ | `getArrival` 키/네트워크 없으면 즉시 `headwayFallback`("배차간격 약 N분", live:false). 무한 대기 없음 |
| 경로탐색(routes.json) | ✅ (수정 후) | `/data/routes.json` **precache 추가**(vite.config.ts). planTrip은 로컬 routes.json만으로 동작(순수 함수, 네트워크 무관) |
| QR 생성 | ✅ | qrcode 라이브러리 로컬 data URL. 네트워크·키 불필요 |
| 시설 필터/강조 | ✅ | `filterStopsByFacility` 순수 함수(stops 메모리 내). 네트워크 무관 |
| 정류장 데이터 | ✅ | stops.json 런타임 StaleWhileRevalidate, 오프라인이면 precache된 stops.sample.json 폴백 |
| 지도 타일 | ✅ | OSM 타일 CacheFirst(osm-tiles) 런타임 캐시 |

**판정:** 오프라인에서 도보=직선폴백·도착=배차폴백·경로탐색=로컬 routes.json·QR=로컬·필터=로컬 전부 네트워크 없이 성립.
**한계 명시:** 헤드리스 브라우저·실제 SW 등록 오프라인 재현은 이 환경에서 미실행 — SW precache 매니페스트(sw.js: routes.json·stops.sample.json 포함 확인)와 각 함수의 폴백 경로(위 근거)로 판정. 실기기에서 1회 로드 후 비행기모드 재접속 리허설 권장.

## v2 표현 규칙 재검

| 검사 | 결과 |
|---|---|
| "현장 확인" 문자열 | ✅ 0건 (`grep -rn "현장 확인" app/src`) |
| 거짓 "실시간" 표기 | ✅ 없음 — `arrival.live` true일 때만 실시간 배지 |
| 거짓 "실경로" 표기 | ✅ 없음 — real=false는 "직선거리"/회색 점선으로 구분 |
| 폴백 정직 표기 | ✅ "배차간격 약 N분", "직선거리 약 N분" |
| 합성 점수 | ✅ 없음 |
| 미확인→"없음" 오표기 | ✅ 없음 — 필터는 unknown·no 모두 강조 제외("있음"만) |

## v2 발견 버그

| # | 심각도 | 영역 | 현상/재현 | 조치 |
|---|---|---|---|---|
| B1 | 중 | 인프라(SW 설정) | `routes.json`이 SW precache에도 runtimeCaching에도 없음(globPatterns가 json 제외, 런타임 패턴은 `stops.*.json`만 매칭). **재현:** 온라인 1회 로드 후 오프라인 재접속 → `/go`에서 `loadRoutes()` fetch 실패 → 모든 목적지가 "직접 가는 버스를 찾지 못했습니다" 표기. 오프라인 하드 제약(경로탐색=로컬 routes.json) 위반 | **수정 완료** — `app/vite.config.ts` `additionalManifestEntries`에 `/data/routes.json` precache 추가. 재빌드 후 sw.js에 routes.json 포함(precache 9→10) 확인. routes.json은 파이프라인 산출 정적 파일로 항상 존재 → precache 안전 |

## 발표 전 육안 확인 권장 (헤드리스로 대체 불가한 항목)

이 항목들은 로직·빌드·HTTP·유닛으로 검증했으나, 실제 발표 기기에서 눈으로 한 번 더 확인 권장:

1. **실기기 지도 렌더·현재위치** — geolocation은 실브라우저 권한 필요. 폰에서 `npm run dev`(또는 배포본) 접속해 지도·마커·최근접 카드 육안 확인.
2. **폰 2대 공유 시연** — 자녀 기기에서 공유 URL 생성 → 부모 기기에서 열어 즐겨찾기 등록 흐름 리허설.
3. **인쇄 미리보기** — `/print/:id`에서 브라우저 인쇄(Ctrl+P) A4 레이아웃 육안 확인.
4. **네트워크 완전 차단 리허설** — 기기에서 한 번 로드 후 비행기모드로 재접속해 지도·카드 동작 확인.

## 미확보 데이터로 인한 데모 표기 (정직성)

- 도착안내기: 전부 "미확인"(원본 없음) — 화면에 정직히 미확인 표시.
- 그늘: 4곳만 확인(그늘막 대장 지오코딩) — 로드뷰 조사 150곳 완료 시 보강.
- 도착정보: TAGO 키 없으면 "배차간격 약 N분" 폴백.
