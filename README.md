# 쉼표 정류장

춘천시 버스정류장의 **그늘·의자·조명·도착안내기** 유무를 3상태(있음/없음/미확인)로 알려주는 고령자용 시민 웹앱과, 유개식 승강장(쉘터) 설치 후보를 조건 필터로 뽑는 행정 대시보드.

- 시민앱: `/` — 켜자마자 지도 + 내 주변 정류장 휴식시설
- 행정 대시보드: `/admin` — 설치 후보 TOP N + CSV 내보내기

> 2026 춘천시 데이터 활용 해커톤 본선작. 실행은 아래 명령을 그대로 복사해 붙여넣으세요.

## 1. 데이터 파이프라인 실행 (stops.json 생성)

원본 CSV(`data/`)를 결합해 앱이 읽는 `app/public/data/stops.json` 을 만듭니다.

```bash
cd pipeline
pip install -r requirements.txt
python build_stops.py
```

## 2. 앱 개발 서버

```bash
cd app
npm install
npm run dev
```

시민앱은 http://localhost:5173/app 에서 확인합니다.

관리자 웹은 시민앱과 분리해 다음 명령으로 실행하며, 주소는 http://localhost:5174 입니다.

```bash
npm run dev:admin
```

## 3. 데모용 정적 빌드 (오프라인 시연)

```bash
cd app
npm run build
npm run preview:citizen
```

시민 앱 산출물은 `app/dist/citizen`, 관리자 웹 산출물은 `app/dist/admin`에 각각 생성됩니다. 두 산출물은 같은 웹 루트에 배포하지 않습니다. TAGO 연결이 없으면 배차간격을 도착 예정시간처럼 대체하지 않고 실시간 정보를 불러오지 못했다고 표시합니다.

## 4. 테스트

```bash
cd app && npm test        # 프론트 (vitest)
cd pipeline && python -m pytest   # 파이프라인
```

## 설정 (선택)

- 실시간 버스 도착정보를 쓰려면 `app/.env.example` 을 `app/.env` 로 복사하고 `VITE_TAGO_KEY` 에 공공데이터포털 TAGO 키를 넣으세요. 없어도 폴백으로 동작합니다.

## 문서

- 설계: `docs/specs/2026-07-15-쉼표정류장-design.md`
- 구현 계획: `docs/superpowers/plans/2026-07-15-쉼표정류장.md`
- 로드뷰 현장조사 입력 양식: `app/public/data/roadview_survey_template.csv` (팀이 채운 뒤 파이프라인이 반영)
