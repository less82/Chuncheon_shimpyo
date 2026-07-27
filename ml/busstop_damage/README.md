# 정류장 파손 RF-DETR 개념검증

사용자가 제공한 파손 사진 19장과 정상 사진 2장을 `bus_stop_damage` 단일 클래스로 학습하는 최소 파이프라인이다.

## 판정

- 21장은 제품용 모델 학습량이 아니다.
- 기둥형·의자 파손은 각 1장뿐이므로 세부 클래스로 나누지 않는다.
- 정상 정류장 사진이 2장뿐이라 오탐률을 평가할 수 없다.
- 뉴스 자막·워터마크가 있는 사진은 모델이 잘못 학습할 수 있다.
- 산출 모델은 UI 연결과 학습 파이프라인 확인용이다.

## 데이터 준비

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\prepare_dataset.py `
  --source C:\Users\user\Downloads\busstop_coco `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v4
```

생성 구조:

```text
dataset_v4/
  train/   # 파손 15장 + 정상 음성 2장 + _annotations.coco.json
  valid/   # 2장 + _annotations.coco.json
  test/    # 2장 + _annotations.coco.json
  review/annotations_contact_sheet.jpg
  manifest.csv
  dataset_summary.json
```

## Windows GPU 환경

Python 3.11 가상환경에서 RF-DETR 1.8.3을 설치한다. CUDA PyTorch는 별도 공식 인덱스를 사용한다.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r ml\busstop_damage\requirements.txt
.\.venv\Scripts\python.exe -m pip install `
  torch==2.7.1+cu128 torchvision==0.22.1+cu128 `
  --index-url https://download.pytorch.org/whl/cu128
```

학습 명령 전에 가상환경의 DLL 경로와 UTF-8 출력을 명시한다.

```powershell
$venvScripts = (Resolve-Path -LiteralPath '.venv\Scripts').Path
$env:PATH = "$venvScripts;$env:PATH"
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
```

## 학습

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\train_rfdetr.py `
  --dataset C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v4 `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\output_v4 `
  --epochs 40 `
  --early-stopping-patience 12 `
  --device cuda
```

GTX 1650 Ti 4GB 기준:

- RF-DETR Nano, 384×384
- batch 1, gradient accumulation 4
- gradient checkpointing
- 전체 encoder 미세조정 (`--freeze-encoder`를 주면 동결)
- EMA 비활성화
- FP16

## 추론

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\predict_rfdetr.py `
  --checkpoint C:\Users\user\Downloads\busstop_coco_rfdetr\output_v4\checkpoint_best_total.pth `
  --images C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v4\test `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\predictions_v4
```

## 앱에서 maeng_coco 사용

초기 화면의 `버스 / 정류장` 버튼 아래 `maeng_coco`를 누르면 사진 검사 화면으로 이동한다. 이제 기본 개발 명령이 로컬 RF-DETR API와 시민 앱을 함께 실행한다.

```powershell
cd app
npm run dev
```

프로젝트 루트에서는 `powershell -ExecutionPolicy Bypass -File scripts\start-maeng-coco.ps1`을 직접 실행해도 같다. `npm run dev:citizen`은 모델 API 없이 프런트 화면만 켜는 용도로 남겨둔다.

브라우저에서 `http://127.0.0.1:5173/app`을 열고 다음 순서로 사용한다.

1. `maeng_coco` 선택
2. 정류장 사진 촬영 또는 선택
3. `검사 시작`
4. 파손 의심 박스와 신뢰도 확인

API는 `POST /api/maeng-coco?threshold=0.15`에 JPG/PNG/WEBP 원본 바이트를 받고 JSON과 주석 이미지를 반환한다. 판정은 후보 없음=`미검출`, 신뢰도 0.15~0.219=`확인 필요`, 0.22 이상=`파손 의심`의 3단계다. 이 임계값은 파손 회귀 사진 4장과 정상 사진 2장으로 정한 PoC 값이며 운영 기준이 아니다.

모델 위치가 다르면 실행 시 지정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-maeng-coco.ps1 `
  -ModelPath C:\모델경로\checkpoint_best_total.pth
```

이 방식은 현재 PC의 로컬 실행용이다. Vercel 정적 배포만으로는 Python GPU 모델이 실행되지 않으므로, 외부 배포 시 `VITE_MAENG_COCO_API_URL`을 별도의 추론 서버 주소로 설정해야 한다.

## 실제 서비스 모델로 가기 위한 최소 데이터

- 파손 유형별 학습 이미지 200장 이상
- 유형별 검증·테스트 이미지 각 30장 이상
- 정상 정류장과 유사 오염·반사·낙서 음성 이미지 300장 이상
- 동일 사진의 크롭·재저장을 서로 다른 분할에 넣지 않음
- 춘천 현장 사진을 별도 테스트 세트로 유지
- 두 명 이상이 박스를 검수하고 불일치를 조정
