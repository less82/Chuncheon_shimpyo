# 쉼표 정류장 프론트엔드

시민 앱과 관리자 웹은 소스 진입점과 빌드 산출물을 분리합니다.

## 로컬 실행

```bash
npm install
npm run dev:citizen  # http://localhost:5173/app
npm run dev:admin    # http://localhost:5174
```

`npm run dev`는 시민 앱과 같습니다. 두 개발 서버를 동시에 실행하려면 터미널을 각각 사용합니다.

## 빌드와 확인

```bash
npm run build
npm run preview:citizen
npm run preview:admin
```

- 시민 앱: `dist/citizen`
- 관리자 웹: `dist/admin`

두 산출물은 서로 다른 도메인과 배포 프로젝트에서 운영해야 합니다.

## 검증

```bash
npm run typecheck
npm run lint
npm test
```
