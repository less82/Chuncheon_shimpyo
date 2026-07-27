# 쉼표 정류장

춘천 시민에게 목적지행 버스 도착정보를 쉽게 보여주고, 정류장 상태를 행정 확인 업무로 연결하는 서비스다.

## 로컬 실행

```bash
cd app
npm install
npm run dev:citizen  # http://localhost:5173/app
npm run dev:admin    # http://localhost:5174
```

시민 앱과 관리자 웹은 터미널을 나눠 실행한다.

## 빌드·검증

```bash
cd app
npm run typecheck
npm run lint
npm test
npm run build
```

- 시민 산출물: `app/dist/citizen`
- 관리자 산출물: `app/dist/admin`
- 두 산출물은 다른 도메인과 배포 프로젝트에서 운영한다.

## 데이터 재생성

```bash
cd pipeline
pip install -r requirements.txt
python build_stops.py
```

원본은 `data/`, 앱 산출물은 `app/public/data/`에 있다.

## API 키

`VITE_TAGO_KEY`는 로컬 시연용이다. Vite 환경변수는 번들에 공개되므로 운영에서는 사용하지 않는다. 운영 키는 서버 비밀 저장소에 두고 시민 API가 TAGO를 대신 호출해야 한다.

## 문서

- [문서 안내](docs/기획_INDEX.md)
- [제품·화면](docs/현재/01_제품_화면.md)
- [데이터·API](docs/현재/02_데이터_API.md)
- [운영·검증](docs/현재/03_운영_검증.md)
- [발표](docs/현재/04_발표.md)
