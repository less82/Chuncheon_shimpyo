# 02. 데이터·API 기준

> 데이터, 식별자, 외부 연동과 AI 처리의 단일 기준이다. 기준일은 2026-07-22다.

## 처리 구조

```text
장소명 → 장소 좌표 → 대중교통 경로
→ 외부 정류장 ID를 내부 관리번호에 연결
→ TAGO 노드 ID로 목적지행 버스 도착 조회
→ 앱 응답
```

음성은 장소명을 입력하는 수단이다. 음성 원문을 정류장 ID로 직접 확정하지 않는다.

## 현재 데이터

| 데이터 | 규모 | 판정 |
|---|---:|---|
| `stops.json` | 정류장 1,890개 | 내부 마스터로 사용 |
| TAGO 노드 ID | 1,845개 | 45개 미매핑 |
| 경유 노선 보유 정류장 | 1,853개 | 37개 미연결 |
| `routes.json` | 223개 노선, 정류장 참조 16,168건 | 깨진 참조 0건 |
| 수요 ID 매핑 | 1,038건 | 직접 49, 추론 15, 미해결 974 |

수요 ID 매핑은 경로·도착정보 식별자로 사용하지 않는다. 두 JSON의 `generatedAt`과 실제 수정시각도 달라 빌드 ID·원본 기준일·배포시각을 따로 저장해야 한다.

## 데이터 등급

| 등급 | 예시 | 용도 |
|---|---|---|
| 공식 원본 | 춘천시·국토부·TAGO | 운영 근거 |
| 검수 관측 | 현장조사·담당자 확인 | 시설 상태 확정 |
| 민간 참고 | 지도 표시명·객체 | 교차검토 |
| 시민 신호 | 음성·버튼 제보 | 조사 필요 탐지 |
| AI 산출 | 구조화·중복군·권고 | 담당자 검토 지원 |

시설은 `yes | no | unknown` 3상태다. 근거가 없으면 `unknown`이다.

## 식별자

| 값 | 용도 |
|---|---|
| `management_id` | 내부 정류장 기본키 |
| `stop_no` | 현장 표지판 번호 |
| `tago_node_id` | TAGO 도착정보 조회 |
| `provider_stop_id` | 경로 API 정류장 ID |
| `route_id` | 내부 노선 기본키 |
| `provider_route_id` | 외부 노선 ID |

정류장명과 버스 번호는 기본키가 아니다.

### 외부 ID 매핑 필드

`management_id`, `provider`, `provider_stop_id`, `direction_text`, `lat`, `lng`, `match_status`, `match_method`, `source_record_id`, `verified_by`, `verified_at`, `valid_from`, `valid_to`를 저장한다.

매칭 순서:

1. 공식 대응표
2. 표지판 번호·좌표·방면 모두 일치
3. 사람이 방면까지 확인한 좌표 후보
4. 이름이나 거리만 비슷한 값은 미확정

`inferred`와 `unresolved`는 운영 도착정보 결합에 사용하지 않는다.

## 외부 API

| 역할 | 운영 선택 | 현재 구현 | 결론 |
|---|---|---|---|
| 장소 검색 | 카카오 Local 등 국내 API | Nominatim 공개 서버 | 서버 어댑터로 교체 |
| 대중교통 경로 | ODsay 등 경로 API | 로컬 직행 탐색 | 운영 API 필요 |
| 실시간 도착 | TAGO | 브라우저 직접 호출 | 서버 프록시 필수 |
| 도보 경로 | 계약 API 또는 자체 OSRM | OSRM 공개 데모 | 운영 사용 금지 |
| 음성 인식 | 브라우저 STT + 직접 입력 | Web Speech | 보조 입력으로만 사용 |

공식 문서:

- [TAGO 도착정보](https://www.data.go.kr/data/15098530/openapi.do)
- [TAGO 정류소정보](https://www.data.go.kr/data/15098534/openapi.do)
- [TAGO 노선정보](https://www.data.go.kr/data/15098529/openapi.do)
- [ODsay 길찾기](https://lab.odsay.com/guide/guide?platform=web)
- [카카오 Local](https://developers.kakao.com/docs/ko/local/common)
- [Nominatim 정책](https://operations.osmfoundation.org/policies/nominatim/)
- [OSRM 데모 정책](https://map.project-osrm.org/about.html)

## 시민 API

| 메서드 | 경로 | 결과 |
|---|---|---|
| `GET` | `/v1/places/search?q=` | 춘천시 장소 후보와 좌표 |
| `POST` | `/v1/trips/search` | 탑승·하차 정류장, 버스, 방면 |
| `GET` | `/v1/stops/{id}` | 정류장 번호·방면·시설 |
| `GET` | `/v1/stops/{id}/arrivals` | 목적지행 버스 도착시간 |
| `POST` | `/v1/reports` | 정류장 상태 제보 접수 |
| `POST` | `/v1/report-uploads` | 사진 업로드 URL |
| `GET` | `/v1/reports/{token}` | 접수 상태 |

경로 요청은 출발·목적지의 `label`, `lat`, `lng`를 받는다. 경로 응답은 다음 값만 앱에 제공한다.

- 탑승·하차 `managementId`
- 정류장명·번호·방면
- 내부·외부 노선 ID와 버스 번호
- 탑승 정류장까지 도보시간
- 환승 횟수
- 데이터 출처와 계산시각

도착 응답은 `routeId`, `routeNo`, `arrivalSeconds`, `previousStopCount`, `observedAt`, `live`를 제공한다. 경로와 도착 응답은 캐시 주기가 달라 분리한다.

## 관리자 API

| 메서드 | 경로 | 역할 |
|---|---|---|
| `GET` | `/api/reports` | 제보 목록 |
| `GET` | `/api/reports/{id}` | 원문·첨부·처리 이력 |
| `PATCH` | `/api/reports/{id}/status` | 상태 변경 |
| `POST` | `/api/stop-mappings/{id}/verify` | ID 매핑 승인 |
| `POST` | `/api/facilities/{id}/observations` | 시설 관측 등록 |
| `GET` | `/api/audit-logs` | 감사 로그 |

## 저장 모델

- 즐겨찾기: 출발·목적 좌표, 탑승·하차 정류장, 노선, 방면, 사용시각
- 시민 제보: 접수 ID, 정류장 ID, 유형, 원문, 첨부키, 상태, 처리부서, 처리시각
- AI 결과: 유형 후보, 사실/요구 구분, 중복군, 근거, 불확실성, 모델 버전
- 시설 관측: 시설종류, 3상태, 출처, 관측일, 검수자, 유효기간

AI는 자유발화 구조화와 중복 묶기만 한다. ID 매핑, 시설 상태, 공사·예산은 규칙 또는 사람이 확정한다.

## 실패 처리

- 장소 없음: 입력 유지 후 재검색
- 춘천 밖 장소: 자동 채택 금지
- 경로 없음: 임의 정류장 추천 금지
- TAGO 실패: 도착정보 없음 표시
- ID 불일치: 결합 중단 후 검수 큐 저장
- 시설 근거 없음: `unknown`
- 제보 저장 실패: 접수 성공 표시 금지

권장 초기 캐시는 장소 1~7일, 경로 30~60초, 도착 10~20초다. 공급자 약관과 부하 시험 후 확정한다.

