# 정류장 파손 RF-DETR 개념검증

사용자가 제공한 정류장 파손 사진 16장을 `bus_stop_damage` 단일 클래스로 학습하는 최소 파이프라인이다.

## 판정

- 16장은 제품용 모델 학습량이 아니다.
- 기둥형·의자 파손은 각 1장뿐이므로 세부 클래스로 나누지 않는다.
- 정상 정류장 사진이 없어 오탐률을 평가할 수 없다.
- 뉴스 자막·워터마크가 있는 사진은 모델이 잘못 학습할 수 있다.
- 산출 모델은 UI 연결과 학습 파이프라인 확인용이다.

## 데이터 준비

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\prepare_dataset.py `
  --source C:\Users\user\Downloads\busstop_coco `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\dataset
```

생성 구조:

```text
dataset/
  train/   # 12장 + _annotations.coco.json
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
  --dataset C:\Users\user\Downloads\busstop_coco_rfdetr\dataset `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\output_unfrozen `
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
  --checkpoint C:\Users\user\Downloads\busstop_coco_rfdetr\output_unfrozen\checkpoint_best_total.pth `
  --images C:\Users\user\Downloads\busstop_coco_rfdetr\dataset\test `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\predictions_unfrozen
```

## 실제 서비스 모델로 가기 위한 최소 데이터

- 파손 유형별 학습 이미지 200장 이상
- 유형별 검증·테스트 이미지 각 30장 이상
- 정상 정류장과 유사 오염·반사·낙서 음성 이미지 300장 이상
- 동일 사진의 크롭·재저장을 서로 다른 분할에 넣지 않음
- 춘천 현장 사진을 별도 테스트 세트로 유지
- 두 명 이상이 박스를 검수하고 불일치를 조정
