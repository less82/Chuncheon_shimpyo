# 쉼표 정류장 앱 데이터·API 요건

> 기준일: 2026-07-22
>
> 범위: 시민용 앱의 `출발 위치 → 목적지 → 탑승 정류장 → 목적지행 버스 도착예정시간` 흐름
>
> 원칙: 사용자가 원하는 것은 노선 설명이 아니라 **지금 어디에서 어떤 버스를 탈 수 있고, 그 버스가 몇 분 뒤 오는지**다.

## 1. 구현 플로우

1. 사용자가 출발 위치와 목적지를 말하거나 직접 입력한다.
2. 장소 검색 API가 각 입력을 춘천시 안의 좌표로 확정한다. 후보가 여럿이면 사용자가 고른다.
3. 대중교통 경로 API가 두 좌표 사이의 실제 탑승 정류장·하차 정류장·진행 방향·버스를 반환한다.
4. 내부 식별자 매핑 계층이 외부 정류장 ID를 춘천 정류장 관리번호와 TAGO 노드 ID로 연결한다.
5. 서버가 TAGO에서 해당 탑승 정류장과 목적지행 버스의 실시간 도착예정시간을 조회한다.
6. 앱은 가장 빨리 탈 수 있는 버스부터 `버스 번호 + 몇 분 뒤 도착`만 우선 표시한다.
7. 결과 확인 뒤에만 동일한 출발지·목적지·탑승 정보를 즐겨찾기로 저장하도록 제안한다.

음성 인식은 입력 수단일 뿐 경로 데이터의 출처가 아니다. 음성 원문을 정류장명으로 억지 매핑하지 않고, 장소 검색에서 확정한 좌표를 경로 탐색의 입력으로 사용한다.

## 2. 데이터·API 구성 결론

| 역할 | 운영 기준 | 현재 상태 | 판정 |
|---|---|---|---|
| 출발지·목적지 장소 검색 | 서버 프록시를 통한 국내 장소 검색 API | 브라우저에서 Nominatim 공개 서버 직접 호출 | 교체 필요 |
| 출발지 지도 확인 | 장소 좌표와 지도 SDK/타일 | OSM 임베드 지도 | 개발 확인용 |
| 대중교통 경로 탐색 | 좌표 간 대중교통 경로 API | 로컬 `routes.json` 직행 중심 탐색 | 운영 API 필요 |
| 정류장 마스터 | 춘천 관리번호 기준 내부 DB | `stops.json` 1,890개 | 적재 가능 |
| 노선 순서 | 노선 ID와 관리번호의 순서 목록 | `routes.json` 223개 노선 | 보조 데이터 |
| TAGO 정류장 매핑 | 관리번호 ↔ TAGO `nodeId` 검증 테이블 | 1,890개 중 1,845개 보유 | 45개 보완 필요 |
| 실시간 도착정보 | 백엔드가 TAGO API 호출 후 정규화 | 브라우저에서 TAGO 직접 호출 | 서버 이전 필수 |
| 도보 시간 | 계약된 지도/보행 API 또는 자체 라우터 | OSRM 공개 데모 서버 호출, 실패 시 직선거리 | 운영 기준 미달 |
| 즐겨찾기 | 기기 저장 우선, 계정 도입 시 동기화 선택 | `localStorage` | 1차 출시 가능 |
| 시민 제보 | 시민 API + 파일 저장소 + 운영 DB | `localStorage`와 Data URL | 운영 구현 필요 |
| 관리자 처리 | 별도 관리자 도메인·인증·감사 로그 | 화면만 분리, 실제 서버 없음 | 운영 구현 필요 |
| 음성 입력 | 브라우저 음성 인식 + 직접 입력 폴백 | Web Speech 기반 | 보조 수단으로 사용 |

## 3. 현재 보유 데이터

### 3.1 정류장·노선 산출물

| 파일 | 현재 규모 | 사용 목적 | 주의사항 |
|---|---:|---|---|
| `app/public/data/stops.json` | 정류장 1,890개 | 앱 표출, 관리번호·표지판 번호·좌표·시설·TAGO ID | 생성시각과 원본 갱신시각을 따로 기록해야 함 |
| `app/public/data/routes.json` | 노선 223개, 정류장 참조 16,168건 | 정류장 순서와 직행 가능성 검증 | 운행 중단·우회·시간표를 보장하지 않음 |
| `data/stop_id_mapping.csv` | 수요자료 매핑 1,038건 | 승차량 자료를 정류장 마스터에 결합 | 직접 49, 추론 15, 미해결 974로 경로 식별자에 사용 금지 |

현재 산출물 점검값은 다음과 같다.

- TAGO 노드 ID 보유: 1,845 / 1,890개(97.6%)
- 경유 노선 정보 보유: 1,853 / 1,890개
- TAGO 미매핑: 45개
- 노선 미연결: 37개
- `routes.json`의 관리번호 참조 중 `stops.json`에 없는 값: 0개
- 두 JSON의 `generatedAt`은 2026-07-15지만 `stops.json` 파일은 2026-07-22에 다시 변경됐다. 현재 `generatedAt`만으로 데이터 최신성을 판단할 수 없으므로 빌드 ID·원본 기준일·배포시각을 분리해 기록해야 한다.

정류장명은 식별자가 아니다. 같은 이름의 양방향 정류장이 존재하므로 이름만으로 합치면 잘못된 방향의 도착정보를 보여줄 수 있다.

### 3.2 정류장 마스터 필수 필드

```text
management_id         춘천 정류장 관리번호, 내부 기본키
stop_no               현장 표지판 번호, 사용자 확인용
name                  표출명, 검색용이며 키로 사용하지 않음
lat, lng              WGS84 좌표
direction_text        방면 표출 문자열
tago_node_id          TAGO 실시간 도착정보 조회용 ID
route_ids             내부 노선 ID 목록
mapping_status        verified | inferred | unresolved
mapping_method        official | exact | coordinate | manual
source_id             원본 자료 식별자
source_updated_at     원본 기준일
verified_at           마지막 검증시각
valid_from, valid_to  변경 이력 유효기간
```

`stop_no`와 `tago_node_id`는 별개다. 앱 내부 기준키는 `management_id`로 고정하고, 외부 API ID는 별도 매핑 테이블에서 관리한다.

### 3.3 시설 데이터

시설은 `yes | no | unknown` 3상태를 유지한다. 근거가 없으면 `unknown`이며, 빈값을 `no`로 바꾸지 않는다. 모든 값에 출처, 조사일, 원본 행 ID 또는 현장 확인 근거가 필요하다. 시설 데이터는 경로를 결정하지 않고, 동일 조건 후보의 보조 정보로만 사용한다.

## 4. 필요한 외부 API

### 4.1 장소 검색·좌표 확정

입력: 사용자가 말하거나 쓴 장소명

출력: 장소 ID, 정확한 표출명, 주소, 위도·경도, 춘천시 포함 여부, 검색 신뢰도

현재 Nominatim 호출은 개발 확인용으로만 둔다. 공개 Nominatim 정책은 최대 1요청/초, 사용자 동작에 따른 제한적 호출, 캐시와 공급자 교체 가능 구조를 요구하며 클라이언트 자동완성을 금지한다. 운영 서비스는 서버 프록시와 캐시를 두고 카카오 Local 등 계약 가능한 국내 장소 API를 어댑터 뒤에 연결한다.

- Nominatim 정책: <https://operations.osmfoundation.org/policies/nominatim/>
- 카카오 Local API: <https://developers.kakao.com/docs/ko/local/common>

반드시 지킬 동작:

- 두 글자 입력 같은 임의 조건으로 화면을 자동 전환하지 않는다.
- 검색 실행 뒤 후보가 하나여도 사용자가 표출명과 지도를 확인할 수 있어야 한다.
- 춘천 밖 결과는 자동 채택하지 않고 다시 입력하도록 알린다.
- `춘천시청`을 `순천시청`로 바꾸는 식의 유사 문자열 보정은 금지한다.

### 4.2 대중교통 경로 탐색

필수 입력은 출발 좌표와 목적지 좌표다. 필수 출력은 다음과 같다.

```text
provider_trip_id
boarding_stop_provider_id
alighting_stop_provider_id
route_provider_id
route_no
direction_text
boarding_sequence
alighting_sequence
walk_to_board_min
walk_from_alight_min
transfer_count
estimated_ride_min
```

현재 로컬 `routes.json` 탐색은 데이터 검증과 무통신 폴백에는 쓸 수 있지만 운영 경로 엔진으로 확정하면 안 된다. 실시간 우회·운행 중단·정확한 환승·시간표·방면을 보장하지 않기 때문이다. 운영에서는 ODsay 같은 국내 대중교통 경로 API를 어댑터로 연결하고, 공급자 ID를 내부 관리번호에 매핑해야 한다.

ODsay 공식 가이드상 좌표 `SX, SY, EX, EY`가 대중교통 길찾기의 필수 입력이며, 현재 무료 Basic은 6개월·일 1,000회로 안내되어 있다. 행정 서비스 운영 트래픽은 Standard/Premium 계약 여부를 별도로 확인해야 한다.

- ODsay 길찾기 가이드: <https://lab.odsay.com/guide/guide?platform=web>
- ODsay 서비스 조건: <https://lab.odsay.com/contact/contact>

### 4.3 실시간 도착정보

TAGO 정류소별 도착예정정보 API를 사용한다.

| 구분 | 값 |
|---|---|
| 서비스 | `ArvlInfoInqireService` |
| 작업 | `getSttnAcctoArvlPrearngeInfoList` |
| 필수 입력 | 서버 보관 `serviceKey`, `cityCode=32010`, `nodeId` |
| 핵심 출력 | `routeid`, `routeno`, `arrtime`, `arrprevstationcnt`, `vehicletp` |
| 내부 결합 | `management_id → tago_node_id`, `route_provider_id/route_no → TAGO routeid/routeno` |

- TAGO 도착정보 공식 문서: <https://www.data.go.kr/data/15098530/openapi.do>
- TAGO 정류소정보 공식 문서: <https://www.data.go.kr/data/15098534/openapi.do>
- TAGO 노선정보 공식 문서: <https://www.data.go.kr/data/15098529/openapi.do>

`VITE_TAGO_KEY`는 브라우저 번들에 포함될 수 있으므로 운영에서 금지한다. 키는 시민용 API 서버의 비밀환경변수에만 두고 앱은 내부 도착정보 API만 호출한다.

도착정보가 없거나 API가 실패하면 `도착정보를 확인할 수 없어요`라고 표시한다. `headwayMin`은 노선 수 기반 추정값이므로 실시간 도착예정시간의 대체값으로 표시하지 않는다.

### 4.4 도보 시간과 지도

공개 OSRM 데모 서버도 최대 1요청/초, 유효한 식별 헤더와 출처 표기, 과도한 이용 금지 조건이 있어 운영 SLA로 사용할 수 없다. 운영에서는 계약된 보행 경로 API 또는 자체 호스팅 라우터를 쓴다.

- OSRM 데모 서버 정책: <https://map.project-osrm.org/about.html>
- OSRM HTTP API: <https://project-osrm.org/docs/v26.4.0/http>

도보 API 실패 시 직선거리는 `대략적인 거리`로만 표현한다. 실제 도보 시간처럼 확정해서는 안 된다.

## 5. 내부 API 계약

시민 앱은 외부 공급자를 직접 호출하지 않고 아래 내부 API만 호출한다. 경로와 버전은 1차 제안이며 백엔드 구현 시 OpenAPI로 고정한다.

### 5.1 시민용 API

| 메서드 | 경로 | 역할 | 인증 |
|---|---|---|---|
| `GET` | `/v1/places/search?q=` | 춘천시 장소 후보 검색 | 없음, 호출 제한 |
| `POST` | `/v1/trips/search` | 출발·목적 좌표 간 탑승 후보 계산 | 없음, 호출 제한 |
| `GET` | `/v1/stops/{managementId}` | 정류장명·번호·방면·시설 조회 | 없음 |
| `GET` | `/v1/stops/{managementId}/arrivals` | 목적지행 노선만 실시간 도착 조회 | 없음, 짧은 캐시 |
| `POST` | `/v1/reports` | 정류장 제보 접수 | 없음, 악용 방지 |
| `POST` | `/v1/report-uploads` | 사진 업로드 URL 발급 | 없음, 형식·용량 제한 |
| `GET` | `/v1/reports/{receiptToken}` | 본인 접수 상태 확인 | 영수 토큰 |

`POST /v1/trips/search` 요청 예:

```json
{
  "origin": { "label": "강원대학교", "lat": 37.8685, "lng": 127.7447 },
  "destination": { "label": "춘천시청", "lat": 37.8813, "lng": 127.73 },
  "options": { "maxTransfers": 0, "accessible": false }
}
```

응답의 핵심 구조:

```json
{
  "searchedAt": "2026-07-22T10:00:00+09:00",
  "source": "transit-provider",
  "candidates": [
    {
      "boardingStop": {
        "managementId": "250000000",
        "stopNo": "0000",
        "name": "정류장명",
        "direction": "시청 방면"
      },
      "alightingStop": { "managementId": "250000001", "name": "정류장명" },
      "route": { "routeId": "internal-route-id", "routeNo": "00" },
      "walkToBoardMin": 4,
      "transferCount": 0
    }
  ]
}
```

도착정보 응답은 경로 후보와 분리한다. 그래야 짧게 캐시하고 사용자가 새로고침할 수 있다.

```json
{
  "stopManagementId": "250000000",
  "observedAt": "2026-07-22T10:00:05+09:00",
  "live": true,
  "arrivals": [
    {
      "routeId": "internal-route-id",
      "routeNo": "00",
      "arrivalSeconds": 240,
      "previousStopCount": 3
    }
  ]
}
```

### 5.2 관리자 API

관리자 웹은 시민 앱과 HTML·배포·도메인·인증을 분리하고 같은 브라우저 저장소를 공유하지 않는다.

| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` | `/api/reports` | 제보 목록·필터·담당 상태 조회 |
| `GET` | `/api/reports/{id}` | 원본·첨부·처리 이력 조회 |
| `PATCH` | `/api/reports/{id}/status` | 검토·과업생성·완료 상태 변경 |
| `POST` | `/api/stop-mappings/{id}/verify` | 외부 정류장 ID 매핑 승인 |
| `POST` | `/api/facilities/{id}/observations` | 시설 현장 확인값 등록 |
| `GET` | `/api/audit-logs` | 관리자 변경 감사 로그 조회 |

필수 보안은 관리자 SSO 또는 별도 계정+MFA, 역할 권한, 세션 만료, 변경 전후 감사 로그, 업로드 악성파일 검사다. 시민용 API와 관리자 API는 게이트웨이와 데이터베이스 계정을 분리한다.

## 6. 식별자 매핑 계약

외부 API를 붙이는 데 가장 중요한 테이블은 `stop_external_ids`다.

```text
management_id
provider              tago | odsay | kakao | other
provider_stop_id
provider_city_code
direction_text
lat, lng
match_status          verified | inferred | unresolved
match_method          official | id_crosswalk | coordinate | manual
distance_m            좌표 매칭 거리
source_record_id
verified_by
verified_at
valid_from, valid_to
```

검증 우선순위:

1. 공공 원본에 관리번호와 외부 ID가 함께 있는 직접 매핑
2. 동일 표지판 번호·좌표·방면이 모두 일치하는 매핑
3. 좌표 근접 후보를 사람이 방면까지 확인한 수동 승인
4. 이름만 같거나 좌표가 가까운 추론값은 `inferred`로 유지하고 운영 도착정보에 사용하지 않음

노선도 `route_external_ids`에서 내부 `route_id`, 공급자 `provider_route_id`, 표출번호, 운행방향, 유효기간을 관리한다. `route_no` 문자열만으로 TAGO 응답을 결합하지 않는다.

## 7. 즐겨찾기·제보 데이터

### 7.1 즐겨찾기

즐겨찾기는 장소 하나가 아니라 **한 번 확인한 이동 쌍**을 저장한다.

```text
favorite_id
origin_label, origin_lat, origin_lng
destination_label, destination_lat, destination_lng
boarding_management_id
alighting_management_id
route_id
direction_text
created_at, last_used_at
```

정류장·노선이 바뀔 수 있으므로 즐겨찾기를 열 때 경로와 도착정보를 다시 조회한다. 저장 당시의 도착분은 저장하지 않는다.

### 7.2 시민 제보

```text
report_id
receipt_token_hash
management_id
category
description
photo_object_key
created_at
status               received | reviewing | task_created | resolved
assigned_department
updated_at, resolved_at
```

현재 `localStorage` 제보는 같은 기기의 시연 데이터일 뿐 행정 접수가 아니다. 운영에서는 서버가 접수번호를 발급하고 사진은 DB가 아니라 파일 저장소에 저장한다.

## 8. 캐시·갱신·장애 기준

아래 값은 공급자 약관과 실제 부하 시험 전에 사용할 초기 운영안이다.

| 데이터 | 초기 캐시/갱신안 | 실패 시 |
|---|---|---|
| 장소 검색 | 동일 검색어·지역 결과 1~7일 캐시 | 직접 입력 유지, 재검색 안내 |
| 경로 후보 | 동일 좌표 격자 기준 30~60초 | 이전 결과를 실시간처럼 재사용하지 않음 |
| TAGO 도착 | 동일 정류장 10~20초 캐시, 중복 호출 병합 | 도착정보 확인 불가 표시 |
| 정류장·노선 마스터 | 원본 배포 감시 + 최소 일 1회 빌드 검사 | 마지막 정상 버전 유지 |
| 시설 | 원본별 기준일 관리, 현장 승인 즉시 반영 | `unknown` 유지 |
| 제보 | 즉시 영속 저장 | 저장 실패를 성공처럼 표시하지 않음 |

모든 외부 응답에는 `source`, `observedAt`, `cached`, `requestId`를 내부적으로 기록한다. 앱에는 필요한 상태만 간단히 보여주되 운영 로그에서 원인을 추적할 수 있어야 한다.

## 9. 운영 전 필수 작업

### P0 — 실제 서비스 전에 반드시 완료

- 시민용 백엔드와 관리자 백엔드/인증 환경 분리
- TAGO 키를 브라우저에서 제거하고 서버 프록시 구현
- 장소 검색 공급자 선정, 행정 서비스 이용 조건 확인, 서버 캐시 적용
- 대중교통 경로 API 계약 및 공급자 어댑터 구현
- 관리번호–경로 공급자 정류장 ID–TAGO 노드 ID 교차 매핑과 방면 검증
- TAGO 미매핑 45개, 노선 미연결 37개 원인 분류
- 실시간 도착 실패 시 추정 배차간격을 숨기는 응답 계약
- 제보 DB·첨부 저장소·접수번호·관리자 처리 이력 구현
- API 호출량, 오류율, 지연시간, 매핑 실패율 모니터링

### P1 — 품질 확보

- 실제 보행 경로 API 또는 자체 라우터
- 즐겨찾기 스키마 마이그레이션과 노선 변경 재검증
- 정류장/노선 원본 자동 갱신, 변경 diff와 승인 절차
- 음성 입력 브라우저 호환성 계측; 실패·무음·권한거부 시 직접 입력 전환
- 대표 출발·목적지 쌍 회귀 테스트와 실제 현장 도착정보 대조

## 10. 완료 판정

다음 질문에 모두 `예`라고 답할 수 있어야 운영 데이터/API가 준비된 것이다.

- 출발지와 목적지를 정류장이 아닌 실제 장소 좌표로 확정하는가?
- 경로 API가 반환한 탑승 정류장을 춘천 관리번호와 TAGO 노드 ID로 검증했는가?
- 같은 이름의 반대편 정류장을 방면으로 구분하는가?
- 해당 목적지로 가는 버스만 골라 TAGO 도착시간을 조회하는가?
- 실시간 조회 실패를 추정 배차간격으로 속이지 않는가?
- 외부 API 키가 시민 앱 번들에 포함되지 않는가?
- 제보가 기기 저장소가 아니라 운영 DB에 접수되고 처리 이력이 남는가?
- 관리자 접근·변경이 시민 앱과 분리되고 감사 가능한가?
