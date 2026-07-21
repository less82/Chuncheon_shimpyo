# 쉼표 정류장 — 과거 QA 데모 시나리오 검증

> 이 문서는 기존 기능의 검증 기록이다. 현재 제품 완료 기준은 `docs/제품_기획.md`와 `docs/사용자_테스트.md`를 따른다. `?fav=`와 `/qr_main?from=`은 모두 과거 정류장별 QR 흐름이며, 현재 목표인 정류장 정보를 내장하지 않은 공통 QR 검증을 대신하지 않는다.

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

---

# 접근성 (A11) — 2026-07-16

> 목표: "타이핑 없이 완결"(고령자) **그리고** "키보드만으로도 전 흐름 조작 가능"(WCAG 2.1.1) 둘 다 충족. `docs/사용자_흐름.md`·`docs/specs/2026-07-16-본선-design.md` §8 기준. 감사는 코드 정독 + 정적 대비 계산으로 수행(헤드리스 브라우저 자동 접근성 감사 도구는 이 환경에 미설치).

## 항목별 결과

| # | 항목 | 결과 | 근거 / 조치 |
|---|---|---|---|
| 1 | 키보드 조작 — A7 정렬 토글(TripView), A8 QR 버튼(StopCard), A9 3탭·시설 서브탭·계절 프리셋(Dashboard/InstallTab/FilterTab/PresetBar) | ✅ 통과(수정 없음) | 전부 네이티브 `<button type="button">` 또는 `role="tab"`인 `<button>`이며 `onClick`만 사용 — 브라우저 기본 동작으로 Tab 이동 + Enter/Space 활성화가 보장됨. 커스텀 `onKeyDown`(Enter/Space)이 필요한 비-버튼 요소는 InstallTab의 `<tr tabIndex={0}>` 행뿐이며 이미 처리돼 있음(`app/src/features/admin/InstallTab.tsx:106-113`) |
| 2 | 포커스 표시 | ✅ 통과(기존 확인) | `app/src/index.css:57-60`에 전역 `:focus-visible { outline: 3px solid var(--warm); outline-offset: 2px; }`. `outline: none/0`으로 억제하는 CSS 없음(전체 검색 0건). `.dash-row`만 인셋 오프셋(-3px)으로 표 셀 안에 보이도록 재정의(`Dashboard.css:225-228`), 브랜드색 3px — 표 안에서도 시인성 유지 |
| 3 | ARIA 정리 — **A9 InstallTab 시설 서브탭 `aria-selected`+`aria-pressed` 중복** | 🔧 수정 완료 | `role="tab"`인 요소는 선택 상태를 `aria-selected`로만 표현해야 함(탭 위젯에 `aria-pressed` 병기는 오용). `app/src/features/admin/InstallTab.tsx`에서 `aria-pressed={facility === f}` 제거, `aria-selected`만 유지. 시각 상태 CSS가 `[aria-pressed="true"]` 선택자에 의존하던 것도 `[aria-selected="true"]`를 병기하도록 `app/src/features/admin/Dashboard.css`에서 함께 수정(시각 회귀 없음). Dashboard 메인 탭(`role="tab"`, aria-selected만)·FilterTab/PresetBar 토글 버튼(`role` 없음, aria-pressed만)은 애초에 올바른 패턴이라 수정 불필요 |
| 4 | 색 비의존 상태(3상태) | ✅ 통과(기존 확인) | `FacilityBadge`는 상태별로 아이콘(체크/엑스/물음표)+한글 라벨("있음"/"없음"/"미확인")을 항상 병기(`app/src/components/FacilityBadge.tsx`). `Favorites`의 `favcard__chip`도 텍스트 라벨 병기(`app/src/features/citizen/Favorites.tsx:52-56`). 색은 보조 신호일 뿐 |
| 5 | 지도 없이 접근 | ✅ 통과(확인만, 브리핑 지시대로 수정 없음) | `CitizenHome`은 최초 진입 시 위치권한 결과와 무관하게 최근접 정류장을 자동 선택해 `StopCard`(텍스트: 정류장명·도착·도보·4시설 배지·QR·공유·인쇄)를 지도 조작 없이 바로 노출(`app/src/features/citizen/CitizenHome.tsx`, `app/src/features/map/MapView.tsx:114-121,161-168`). `Favorites`·`TripView`도 전부 텍스트/카드 목록. 다만 자동 선택된 정류장 **이외의 임의 정류장**을 고르려면 지도 마커(Leaflet `circleMarker`, DOM 포커스 미지원) 클릭이 필요 — 대안은 즐겨찾기 경유(별표 후 `/favorites`)뿐이라는 한계는 있으나, 브리핑 범위(핵심 정보 접근성)는 충족 |
| 6 | `prefers-reduced-motion` | 🔧 수정 완료(1건) | 코드 전체에서 지속 애니메이션은 지도 내 위치 마커 pulse 하나(`app/src/features/map/MapView.css` `.user-dot__pulse { animation: user-pulse 1.8s ease-out infinite; }`). `@media (prefers-reduced-motion: reduce)`로 `animation: none` + 정적 반투명 링(`opacity: 0.35`)으로 대체. 그 외 `transition`(호버·포커스 배경/테두리색 전환 0.06~0.3s)은 반복 애니메이션이 아니라 상태 전환용 미세 효과라 축소 대상 아님(해당 없음) |
| 7 | 명암비(WCAG AA) | ✅ 계산 결과 전부 AA 충족(토큰 조정 불필요) | 아래 "명암비 실측" 표 참조. 자동 대비 계산 스크립트(WCAG 상대휘도 공식)로 산출 |

## 명암비 실측 (sRGB, WCAG 상대휘도 공식)

| 조합 | 값 | 대비비 | 기준 | 판정 |
|---|---|---|---|---|
| 있음(초록) 글자 on 흰 배경 | `#15803d` on `#ffffff` | 5.02:1 | 4.5:1(본문) | ✅ |
| 있음(초록) 글자 on 있음 배경 틴트 | `#15803d` on `#e6f4ea` | 4.42:1 | 3:1(FacilityBadge 상태라벨은 22px/800 = 큰 텍스트) | ✅ |
| 없음(빨강) 글자 on 흰 배경 | `#c1121f` on `#ffffff` | 6.22:1 | 4.5:1 | ✅ |
| 없음(빨강) 글자 on 없음 배경 틴트 | `#c1121f` on `#fdeaea` | 5.37:1 | 3:1(큰 텍스트) | ✅ |
| 미확인(회색) 글자 on 흰 배경 | `#57534e` on `#ffffff` | 7.63:1 | 4.5:1 | ✅ |
| 미확인(회색) 글자 on 미확인 배경 틴트 | `#57534e` on `#eeeae4` | 6.37:1 | 3:1(큰 텍스트) | ✅ |
| 강조 버튼(테라코타) 배경 on 흰 바탕 / 흰 글자 on 테라코타 배경 | `#c2410c` ↔ `#ffffff` | 5.18:1 | 4.5:1(버튼 라벨) | ✅ |
| 브랜드(포레스트그린) 배경 on 흰 바탕 / 흰 글자 on 브랜드 배경 | `#2f6b3a` ↔ `#ffffff` | 6.39:1 | 4.5:1(버튼 라벨) | ✅ |
| 본문 글자 on 종이 배경 | `#3d3833` on `#faf6ef` | 10.76:1 | 4.5:1 | ✅ |
| 보조 글자(muted) on 종이 배경 | `#6b635a` on `#faf6ef` | 5.48:1 | 4.5:1 | ✅ |
| 제목 글자 on 종이 배경 | `#1c1917` on `#faf6ef` | 16.23:1 | 4.5:1 | ✅ |
| 보조 글자(muted) on 흰 카드 배경 | `#6b635a` on `#ffffff` | 5.90:1 | 4.5:1 | ✅ |

가장 낮은 값(있음 상태라벨 on 배지 배경, 4.42:1)도 `FacilityBadge__status-label`이 `--fs-md`(22px) + `font-weight: 800`으로 WCAG "큰 텍스트"(≥18.66px bold) 기준(3:1)에 해당해 여유 있게 통과. 토큰 조정 불필요.

## 헤드리스로 검증 불가 — 실기기·스크린리더 수동 확인 필요

이 환경에는 스크린리더·실제 브라우저 렌더링 접근성 감사 도구가 없어 아래는 코드 검토로 "구조상 문제 없음"까지만 확인했고, 최종 판정은 실기기 필요:

1. **스크린리더 낭독 검증(NVDA/VoiceOver/TalkBack)** — `FacilityBadge`의 `aria-label`(예: "그늘 있음, 로드뷰 확인"), `role="tab"`/`aria-selected` 조합이 실제 스크린리더에서 자연스럽게 낭독되는지. 코드상 ARIA 속성은 올바르나 실기기 낭독 리허설 권장.
2. **키보드만으로 전 흐름 실주행** — Tab/Shift+Tab/Enter/Space만으로 "지도 진입 → 정류장 확인 → 즐겨찾기 → 공유 QR → 버스로 가기 → 대시보드 3탭 전환"을 실제 키보드(마우스 없이)로 끝까지 수행. 코드상 전부 네이티브 버튼/링크라 이론상 가능하나 실기기 리허설로 최종 확인 권장.
3. **`prefers-reduced-motion` 실제 OS 설정 반영** — OS 접근성 설정에서 "동작 줄이기" 켠 상태로 지도 화면 진입해 pulse 애니메이션이 실제로 정지하는지 육안 확인.
4. **줌 200%/글자 확대 시 레이아웃 붕괴 여부** — 브라우저 확대 200% 또는 OS 폰트 확대 시 버튼 텍스트 잘림·터치타깃 겹침이 없는지(토큰상 `--touch: 48px` 하한은 지키고 있으나 실측 필요).
5. **포커스 순서(탭 순서)의 논리적 흐름** — Dashboard 3탭 → 서브탭 → 표 행 → 상세 카드로 이어지는 실제 탭 이동 순서가 시각적 순서와 일치하는지 실기기 확인(DOM 순서상 일치하나 브라우저별 렌더링 차이 가능성).

---

# A12 — 보안·오프라인 E2E·QA 최종 게이트 (2026-07-16)

> 목표: 본선 데모 시나리오가 네트워크 불안 상태에서도 통과. `docs/specs/2026-07-16-본선-design.md` §1(완료 기준 8종)·§5(검증 계획) 기준. `cd app && npm run build && npm run preview` 정적 빌드 재현.

## 1. 무키 빌드 검증 (키 노출 방지)

| 항목 | 결과 | 근거 |
|---|---|---|
| `.env`·`dist` gitignore 처리 | ✅ | `.gitignore:18` `app/.env`, `app/.gitignore:11` `dist` — `git check-ignore -v`로 둘 다 확인 |
| 무키 빌드(`VITE_TAGO_KEY= npm run build`) | ✅ 빌드 성공 | tsc+vite+PWA 정상, precache 10 entries |
| 무키 빌드 산출물에 실제 키 문자열 0건 | ✅ **0건** | `.env`의 `VITE_TAGO_KEY` 값(64자)을 `dist/assets/*.js`·`dist/sw.js` 전체에서 grep — 매치 0건(값 자체는 출력하지 않고 매치 카운트만 확인). 빌드 후 `.env` 원복, 정상 키로 재빌드해 개발환경 복구 |
| 키 없을 때 도착정보 폴백 | ✅ | `app/src/lib/arrivals.ts:84-85` — `key`나 `stop.tagoNodeId` 중 하나라도 없으면 `fetch` 시도 자체 없이 즉시 `headwayFallback()`(`"배차간격 약 N분"`, `live:false`) 반환. 무한 스피너 없음 |
| `npm audit` | ✅ **0 vulnerabilities** | prod 41 / dev 503 / optional 77 / peer 7, 전 등급 0건 |
| QR/공유 페이로드에 개인정보 없음 | ✅ | `app/src/features/share/shareLink.ts` — payload는 `?fav=<stopId,...>` 뿐. 수신측(`ImportOnLoad.tsx`)이 로드된 `stops` id 화이트리스트와 교집합만 통과시켜 임의 문자열/스크립트 주입 방어. `StopCard.tsx:91`의 정류장 QR도 동일하게 `buildShareUrl([stop.id])`만 인코딩 — 위치·이름 등 부가 정보 없음 |

## 2. 오프라인 E2E 매트릭스 (설계 §5)

**판정 근거:** `app/vite.config.ts` workbox 설정 — `globPatterns`(app shell: js/css/html/svg/ico/png/woff2) + `additionalManifestEntries`(`/data/stops.sample.json`, `/data/routes.json`) precache, `navigateFallback: '/index.html'`(오프라인 시 모든 same-origin 네비게이션이 캐시된 app shell로 폴백), 런타임 캐시(OSM 타일 CacheFirst, `stops*.json` StaleWhileRevalidate). SW 등록·설치(=precache 완료)는 **최초 1회 온라인 접속이 전제조건**이다.

설치 PWA는 정의상 설치 자체가 최초 온라인 로드를 전제하므로 "최초 접속" 조합은 해당 없음(재방문과 동일하게 동작) — 아래 표는 이를 반영해 축약.

| 접속 유형 | 매체 | 네트워크 | 진입 경로 | 예상 동작 | 근거 |
|---|---|---|---|---|---|
| 최초 접속 | 브라우저 | 완전 오프라인 | 새로고침/직접 URL/QR 진입 | ❌ **실패**(알려진 한계) | SW가 아직 설치되지 않아 precache가 비어 있음 — 최초 요청 자체가 네트워크 필요. QR 최초 진입도 동일하게 실패 |
| 최초 접속 | 브라우저 | 느린 네트워크 | 새로고침/직접 URL/QR 진입 | ✅ 완료(지연) | 앱 자체 fetch(도보/도착)는 전부 2.5초 타임아웃 후 폴백(`arrivals.ts`·`walking.ts` `TIMEOUT_MS=2500`) — 무한 대기 없음. 최초 페이지 로드는 브라우저 네트워크 계층이 담당(지연되나 실패 아님), 로드 완료 후 SW 설치됨 |
| 재방문 | 브라우저 | 완전 오프라인 | 새로고침 | ✅ 통과 | precache된 app shell을 `navigateFallback`이 서빙, `stops.json`은 런타임 캐시 폴백(없으면 precache된 `stops.sample.json`), 도보/도착은 함수 레벨 폴백 |
| 재방문 | 브라우저 | 완전 오프라인 | 직접 URL(`/favorites`, `/go`, `/print/:id` 등) | ✅ 통과 | SPA 라우트도 `navigateFallback: '/index.html'`로 동일 처리 — same-origin 경로면 진입 경로 구분 없음 |
| 재방문 | 브라우저 | 완전 오프라인 | QR 진입(`?fav=id`) | ✅ 통과 | QR 링크도 same-origin 네비게이션이라 위와 동일하게 폴백 서빙 후, 클라이언트에서 `ImportOnLoad`가 로컬 화이트리스트로 처리(네트워크 불필요) |
| 재방문 | 브라우저 | 느린 네트워크 | 새로고침/직접 URL/QR 진입 | ✅ 통과 | StaleWhileRevalidate가 캐시본 즉시 반환 + 백그라운드 갱신 시도(실패해도 캐시본 유지), 도보/도착 함수는 2.5초 타임아웃 |
| 재방문(=설치 PWA 전체) | 설치 PWA | 완전 오프라인 | 새로고침/직접 URL/QR 진입 | ✅ 통과 | 설치 자체가 SW 등록·precache 완료를 전제 — 브라우저 재방문과 동일 캐시 경로. standalone 모드라 URL바 직접입력은 드물지만 딥링크(QR로 열기)는 동일 폴백 적용 |
| 재방문(=설치 PWA 전체) | 설치 PWA | 느린 네트워크 | 새로고침/직접 URL/QR 진입 | ✅ 통과 | 위와 동일 StaleWhileRevalidate + 함수 타임아웃 |

**알려진 한계(명기):** "QR 최초 진입 + 완전 오프라인 = 실패" — SW가 설치되지 않은 기기가 오프라인 상태로 QR을 처음 스캔하면 아무것도 뜨지 않는다(캐시가 없으므로). **발표 데모는 반드시 사전 1회 접속(SW 설치 완료)된 기기를 사용**(설계 §5, 시나리오 1 조건과 동일).

**한계:** 이 환경은 헤드리스로 실제 SW 등록·오프라인 재현(Service Worker lifecycle, `navigator.onLine=false` 실제 네트워크 차단)을 실행하지 못함. 위 판정은 precache 매니페스트(`dist/sw.js` 정적 분석: precache 10 entries 확인)와 각 함수의 폴백 경로 코드 분석으로 내림. **실기기에서 1회 로드 후 비행기모드로 재접속하는 리허설을 발표 전 권장**(새로고침·즐겨찾기 화면 직접 URL·QR 재스캔 3가지 모두).

## 3. 데모 시나리오 8종 (설계 §1)

| # | 시나리오 | 결과 | 근거 |
|---|---|---|---|
| 1 | (B2C) QR 스캔 → 가입 없이 즐겨찾기 등록 + 확인 문구(사전 1회 접속 기기) | ✅ 통과 | `StopCard.tsx`의 정류장 QR은 `toQrDataUrl(buildShareUrl([stop.id]))`(로컬 생성, 네트워크 불필요). 스캔 시 `ImportOnLoad.tsx`가 `?fav=` 화이트리스트 검증 후 `addMany`(로그인 없음) → `/favorites`로 이동 + `importedNames` state로 확인 배너 노출(`Favorites.tsx:86-104`). qr.test.ts·shareLink.test.ts·ImportOnLoad.test.tsx 통과 |
| 2 | (B2C) "앉아서 기다리는 길" — 최단/시설우선 토글, 시설별 문구, 점수 숫자 없음 | ✅ 통과 | `TripView.tsx`에 "가까운 순"/"시설 확인된 곳 우선" 토글(`sortMode`), 부제 "확인된 시설이 있는 길을 우선 보여드려요". `comfortSort.ts`의 `comfortSentence()`가 의자/그늘/조명/미확인 4종 문구 반환, 숫자 미포함(`comfortSort.test.ts` (d)(e)(f) 통과 — 의자 미확인 카드에 "앉아서" 미포함 강제 테스트 포함) |
| 3 | (B2C) 최초 접속 후 오프라인 전환 → 전 흐름 폴백 | ✅ 통과(코드 근거, §2 매트릭스 참조) | 도보=`straightWalk` 직선 폴백, 도착=`headwayFallback`, 경로탐색=로컬 `routes.json`(precache됨), QR=로컬 생성, 즐겨찾기=로컬스토리지(zustand persist) — 전부 네트워크 비의존. §2 매트릭스의 "재방문" 행 전부 통과 |
| 4 | (B2G) 1단계 조사 검토 순서 표 + 수요 미확인 별도 그룹 + CSV | ✅ 통과 | `SurveyTab.tsx` — 순위·정류장·한낮승차·미확인시설·선정사유·지수(보조) 표, "수요 미확인 조사 후보 — 순위 없음" 별도 섹션(`buildSurveyPriority`가 `noDemand`를 `ranked`와 분리 반환), `exportSurveyCsv` 버튼. `surveyPriority.test.ts` 통과 |
| 5 | (B2G) 조사 CSV 투입 → 파이프라인 재실행 → 전후 수치 4종 변화 | ⚠️ 부분 확인("투입 전" 상태만) | 현재 실데이터 `stops.json` 4시설 전부 `no=0`(`shade/seat/light/sign` 전수 확인) — "투입 전" 상태 코드 근거 확인. `InstallTab.tsx:70-73`이 이 상태에서 "조사 반영 전 — 1단계를 먼저 진행해 로드뷰로 '없음'을 확정해야 설치 검토 후보가 나타납니다" 정직 안내. **"투입 후" 라이브 전환은 본선 전 실제 로드뷰 조사 CSV(`data/roadview_survey_template.csv` 등)를 파이프라인에 넣어야 재현 가능 — 이번 게이트 범위 밖(기능 변경 금지, 실데이터 조사 미완료)** |
| 6 | (B2G) 2단계 설치 검토(상태 라벨 상시 표기) + 시설별 예산 | ✅ 통과 | `INSTALL_STATUS_LABEL = "데이터상 설치 검토 후보 · 현장 설치 적합성 미검토"`(`types/priority.ts:66`) — 표의 모든 행(`InstallTab.tsx:127`)과 CSV(`exportCsv.ts:184`) 양쪽에 상시 고정 표기. `buildInstallPriority`가 `status==="no" && source==="roadview"`만 대상(unknown/yes 제외, `installPriority.ts` 주석·중단조건1 준수). `BudgetSim`이 시설(벤치/그늘막/조명)별 트랙으로 분리 표시 |
| 7 | (B2G) 근거 카드(산식·실측·출처) → CSV·A4 | ✅ CSV / ⚠️ A4 수동 확인 필요 | `EvidenceCard.tsx` — 산식 문자열(`ev-formula`), 항별 분해(수요분위수·미확인비율·POI), 근거요약, 로드뷰 캡처 자리(위경도 병기) 전부 표시. CSV는 `surveyRowsToCsv`/`installRowsToCsv`가 산식 원값 전부 포함해 재검산 가능(`exportCsv.test.ts` 통과). **A4 인쇄**는 시민용 `PrintPoster`(`/print/:id`)만 `@media print` 전용 스타일이 있고, **`EvidenceCard`(관리자용)에는 인쇄 전용 CSS가 없음** — `position: fixed` 오버레이라 브라우저 기본 인쇄(Ctrl+P) 시 잘리거나 배경 오버레이가 함께 찍힐 수 있음(하단 발견 이슈 A12-1 참조, 실기기 확인 권장) |
| 8 | (B2G) 프리셋 3종 전환 + 정책 시나리오 비교 표 | ✅ 통과 | `PresetBar`로 폭염 대응형/고령자 이동지원형/이용량 중심형 전환(`PRESETS`), `SurveyTab.tsx`의 "정책 시나리오 비교" 섹션이 Top10 진입 빈도·평균 순위 표 표시. 화면·CSV·주석 어디에도 "민감도 분석" 문자열 없음(§4 grep 결과) |

## 4. 표현 금지어 grep (전부 0건 확인)

| 금지어/규칙 | `app/src` 렌더/화면 문자열 | 비고 |
|---|---|---|
| "현장 확인" | ✅ 0건 | 매치는 전부 테스트 파일의 "금지 검증" 어서션(`comfort.test.ts`, `Dashboard.test.tsx`) — 정당 |
| "수혜" | ✅ 0건 | 매치는 `BudgetSim.tsx`·`budgetSimulate.ts`의 "이 단어를 쓰지 않는다"는 금지 주석뿐 — 정당 |
| "일평균"(근거 없는) | ✅ 0건 | 위와 동일 파일의 금지 주석뿐 |
| B2C 화면 점수 숫자 | ✅ 0건 | `features/citizen`·`features/trip` 전체에 `toFixed`/`score` 렌더 없음. `comfortScore`는 정렬용 내부 계산에만 사용(`comfortSort.ts:44`), 화면 미노출 |
| "민감도 분석"(화면) | ✅ 0건 | 렌더 문자열 없음. `Dashboard.test.tsx`에 "민감도" 미노출 검증 테스트 유지(정당). `surveyPriority.ts` JSDoc의 리터럴 "민감도 분석" 1건은 **정리 완료**(아래 참조) |
| 조건 없는 "오프라인 동작" | ✅ 0건(화면) | `TripView.tsx:42`에 코드 주석 1건("로컬 routes.json — 오프라인 동작")은 화면 렌더 문자열이 아니고 맥락상 "로컬 데이터라서"라는 조건이 이미 붙어 있어 오표기 아님 |
| "취약" 지표명 오용 | ✅ 없음(재확인) | POI 지표는 전 코드에서 "생활지원시설 인접도"로 일관(`types/priority.ts`, `loadPoi.ts`, `EvidenceCard.tsx`, `exportCsv.ts`, `PresetBar.tsx`). `tokens.css:2`의 "취약한 고령자"는 사용자 설명(정당, 유지) |
| 미확인의 "없음" 오표기 | ✅ 없음 | `facilityText`/`FacilityBadge` 3상태 분리 유지(A9까지 검증됨, 재확인) |
| 의자 미확인 카드의 "앉아서" 문구 | ✅ 없음 | `comfortSort.test.ts` (f) 테스트로 강제 |

### 코드 정리 (Minor)

- `app/src/features/admin/surveyPriority.ts`의 `presetStability()` JSDoc — `"민감도 분석" 명칭 금지`라는 금지어 리터럴이 주석에 그대로 노출돼 있던 것을 `"발표 명칭은 "정책 시나리오 비교" — 세 프리셋은 팀이 정한 세 점일 뿐 통계적 변동폭 분석이 아니므로 다른 명칭으로 부르지 않는다"`로 의도를 유지한 채 리워드. 기능 변경 없음(주석만).

## 5. 전체 자동 테스트 (A12 최종)

- 프론트 vitest: **173 passed (29 files)**
- `npx tsc --noEmit`: **에러 0건**
- `npm run build`: **성공**(tsc+vite+PWA, precache 10 entries, `dist/assets/index-*.js` 478KB)
- `npm audit`: **0 vulnerabilities**
- 파이프라인 pytest: **60 passed**(10 files)

## 6. 발견 이슈

| # | 심각도 | 영역 | 현상/재현 | 조치 |
|---|---|---|---|---|
| A12-1 | 낮음(발표 리스크) | B2G `EvidenceCard`(근거 카드) 인쇄 | `EvidenceCard.css`에 `@media print` 규칙이 전혀 없음(`ev-overlay`가 `position: fixed; inset: 0`인 채로 그대로 인쇄됨). 시민용 `PrintPoster`는 인쇄 전용 스타일이 있으나 관리자용 근거 카드는 없어, 시나리오 7의 "A4" 요구를 브라우저 기본 인쇄(Ctrl+P)로만 충족해야 하는 상태 — 오버레이 배경·모달 잘림 위험. **재현:** 대시보드에서 조사/설치 표 행 클릭 → 근거 카드 열림 → Ctrl+P → 미리보기에서 배경 반투명 오버레이가 함께 인쇄되거나 카드가 뷰포트 밖으로 잘릴 수 있음(브라우저별 상이) | 기능 변경 금지 범위라 미수정. **발표 전 실기기에서 Ctrl+P 미리보기 육안 확인 필수**. 정식 수정 시 `EvidenceCard.css`에 `@media print { .ev-overlay { position: static; background: none; } .ev-close { display: none; } }` 류 추가 검토(다음 이터레이션 과제로 별도 티켓화 권장) |

## 7. 수동 확인 필요 목록 (헤드리스로 대체 불가)

1. **QR 최초 스캔 리허설(온라인)** — 시나리오 1을 실제 스마트폰 카메라로 QR 스캔 → 즐겨찾기 등록 확인 배너까지 육안 확인.
2. **오프라인 비행기모드 3종 재현** — §2 매트릭스의 "재방문 + 완전 오프라인" 행 3가지(새로고침/직접 URL/QR 재스캔)를 실기기에서 1회 로드 후 비행기모드로 리허설.
3. **근거 카드 A4 인쇄 미리보기(A12-1)** — 대시보드 근거 카드에서 Ctrl+P 미리보기 육안 확인, 필요 시 인쇄 CSS 추가를 다음 작업으로 티켓화.
4. **조사 CSV "투입 후" 라이브 전환(시나리오 5 후반부)** — 본선 전 실제 로드뷰 조사 CSV를 파이프라인에 투입해 no=0→B곳 등 4종 수치 변화를 실제로 재생성해 확인(현재는 "투입 전" 상태만 코드로 검증됨).
5. **느린 네트워크(스로틀링) 실측** — 브라우저 devtools "Slow 3G" 등으로 실제 로딩 체감 시간 측정(코드상 2.5초 타임아웃은 확인했으나 체감 UX는 실기기 권장).
