# maeng_coco v14 모델 사용법

이 ZIP은 Git 저장소에 들어가지 않는 RF-DETR 가중치 두 개만 별도로
전달하는 패키지다. 앱 코드와 Python 실행 환경은 프로젝트 저장소에서 받는다.

## 반드시 함께 가져갈 것

1. Git에서 받은 `Chuncheon_shimpyo` 프로젝트
2. 이 ZIP을 푼 폴더 전체
3. 프로젝트 루트의 `.venv` 또는 `ml/busstop_damage/README.md`대로 새로 만든 환경
4. 앱 실행용 Node.js와 `app` 폴더의 npm 패키지

## 실행

ZIP을 푼 PowerShell에서 프로젝트 실제 경로를 지정한다.

```powershell
.\START_MAENG_COCO.ps1 `
  -RepoRoot "C:\경로\Chuncheon_shimpyo"
```

정상 실행되면 로컬 모델 API는 `http://127.0.0.1:8000`, 시민 앱은
`http://127.0.0.1:5173/app`에서 열린다.

## 포함 모델

| 파일 | 용도 | SHA-256 |
|---|---|---|
| `models/maeng_coco_primary_v14.pth` | 3클래스 주 모델 | `5CFC64E95CE5D25471C8851A65D27DA75DD7B27913B067E68B4C97ED80572E92` |
| `models/maeng_coco_reference_v9.pth` | 기타 시설 회귀 보전 | `BDB715B2A4B910BE29544C3983D2615772E0F47717FF1D4A093BC584A4B29830` |

두 파일이 모두 있어야 현재 PC에서 검증한 것과 같은 결합 판정이 나온다.
ZIP도 GitHub 일반 파일 제한보다 크므로 Drive, GitHub Release,
Git LFS 또는 별도 모델 저장소로 전달한다.
