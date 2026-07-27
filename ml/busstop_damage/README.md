# 정류장 파손 RF-DETR 개념검증

사용자가 제공한 파손 사진 20장과 정상 사진 2장을
`side_glass_damage`(버스 정류장 외벽 유리)와
`other_bus_stop_damage`(버스 정류장 시설),
`bus_information_system_damage`(버스 정류장 버스정보시스템)
3개 클래스로 학습하는 최소 파이프라인이다.

## 판정

- 고유 원본 22장은 제품용 모델 학습량이 아니다.
- 버스정보시스템 원본 3장은 위치·원근·조명·압축·흐림·부분 가림을 적용해
  원본당 6장씩 증식한다. 단순 복사는 증식으로 계산하지 않는다.
- 외벽 유리와 버스정보시스템은 별도 클래스로 분리하고, 기둥형·의자 등은
  각 1장뿐이므로 `other_bus_stop_damage`로 묶는다.
- 독립 정상 정류장 사진이 2장뿐이라 실제 오탐률을 평가할 수 없다.
- 문제 사진의 오른쪽 정상 유리 패널 크롭 4개를 하드 네거티브로 추가했다.
- 버스 충돌 정류장 원거리 사진 1장은 찌그러진 지붕·프레임만 라벨링하고
  원거리·가림 변형 10장을 별도로 증식했다.
- 뉴스 자막·워터마크가 있는 사진은 모델이 잘못 학습할 수 있다.
- 산출 모델은 UI 연결과 학습 파이프라인 확인용이다.

## 데이터 준비

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\prepare_dataset.py `
  --source C:\Users\user\Downloads\busstop_coco `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v10_bis `
  --separate-bus-information `
  --augment-bus-information 6
```

생성 구조:

```text
dataset_v10_bis/
  train/   # 버스정보시스템 원본 2 + 증식 12 + 외벽/기타/정상
  valid/   # 독립 버스정보시스템 파손 1장
  test/    # 기타 파손 2장
  review/annotations_contact_sheet.jpg
  manifest.csv
  dataset_summary.json
```

독립 검증 뒤 제공 사진 전체의 앱 회귀를 맞추는 최종 데이터셋은 검증·테스트
원본의 반복본을 학습에 추가한다. 버스정보시스템 3장 모두 원본당 6장씩
증식하고, 불균형을 막기 위해 기타 시설도 고유 원본당 2장씩 증식한다.
이 옵션을 사용한 데이터의 분할 점수는 독립 평가값이 아니다.

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\prepare_dataset.py `
  --source C:\Users\user\Downloads\busstop_coco `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v13_distant_app `
  --separate-bus-information `
  --augment-bus-information 6 `
  --augment-other-damage 2 `
  --augment-distant-structure 10 `
  --include-reference-regression
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
  --dataset C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v10_bis `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\output_v10_bis `
  --epochs 15 `
  --initial-checkpoint C:\Users\user\Downloads\busstop_coco_rfdetr\output_v8\checkpoint_selected_app.pth `
  --lr 0.00002 `
  --lr-encoder 0.000002 `
  --early-stopping-patience 15 `
  --device cuda
```

위 명령의 `--dataset`은 `dataset_v10_bis`다. 독립 검증 후 앱용 모델은
3클래스 체크포인트를 전체 버스정보시스템 증식 데이터로 미세조정한 뒤,
`dataset_v12_balanced_app`으로 10 epoch 학습한 뒤, 원거리 충돌 사진을 추가한
`dataset_v13_distant_app`으로 10 epoch 더 학습한다. 마지막 단계의 학습률은
`1e-5`, encoder 학습률은 `1e-6`이다.

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\train_rfdetr.py `
  --dataset C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v13_distant_app `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\output_v13_distant_app `
  --epochs 10 `
  --initial-checkpoint C:\Users\user\Downloads\busstop_coco_rfdetr\output_v12_balanced_app\checkpoint_selected_app.pth `
  --lr 0.00001 `
  --lr-encoder 0.000001 `
  --early-stopping-patience 10 `
  --device cuda
```

기타 시설 회귀 보전용 `output_v9_reference` 2클래스 모델은 참조 모델로
유지한다.

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
  --checkpoint C:\Users\user\Downloads\busstop_coco_rfdetr\output_v13_distant_app\checkpoint_selected_app.pth `
  --images C:\Users\user\Downloads\busstop_coco `
  --output C:\Users\user\Downloads\busstop_coco_rfdetr\predictions_v13 `
  --num-classes 3 `
  --class-names side_glass_damage,other_bus_stop_damage,bus_information_system_damage
```

`output_v13_distant_app/checkpoint_selected_app.pth`는 3클래스 주 모델이고,
`output_v9_reference/checkpoint_selected_app.pth`는 기타 시설 라벨을 보전하는 참조
모델이다. API는 버스정보시스템 주 모델 결과를 참조 모델이 일반 시설로
덮어쓰지 않도록 두 결과를 결합한다. Lightning 중간 체크포인트는
`export_checkpoint.py`로 추론용 `.pth`로 변환한다.

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
4. 파손 박스와 `(버스 정류장 외벽 유리)`, `(버스 정류장 시설)` 또는
   `(버스 정류장 버스정보시스템)` 모델 라벨 확인
5. `다른 사진` 또는 `확인` 선택
6. `확인`을 누르면 주석 사진·신뢰도·검출 좌표가 어드민 시민 제보 탭에 접수

API는 `POST /api/maeng-coco?threshold=0.15`에 JPG/PNG/WEBP 원본 바이트를
받고 JSON과 주석 이미지를 반환한다. 판정은 후보 없음=`미검출`, 신뢰도
0.18~0.219=`확인 필요`, 0.22 이상=`파손 의심`의 3단계다. 0.18 미만 후보는
화면에 표시하지 않는다. 이 임계값은 버스정보시스템 3장, 외벽 유리 9장,
기타 시설 8장, 정상 사진 2장에 맞춘
PoC 값이며 운영 기준이 아니다. 외벽 클래스는 최고 신뢰도의 65% 미만인
약한 중복 박스를 제거하고, 기타 시설과 버스정보시스템은 50% 기준을
사용한다.

제공 사진 전체 회귀는 다음 명령으로 확인한다.

```powershell
.\.venv\Scripts\python.exe ml\busstop_damage\verify_api_regression.py `
  --source C:\Users\user\Downloads\busstop_coco `
  --dataset C:\Users\user\Downloads\busstop_coco_rfdetr\dataset_v13_distant_app
```

접수 API는 `POST /api/maeng-coco/reports`, 목록은 `GET /api/maeng-coco/reports`, 처리 상태 변경은 `PATCH /api/maeng-coco/reports/{id}`다. 기본 저장 파일은 `C:\Users\user\Downloads\busstop_coco_rfdetr\maeng_coco_reports.json`이며 `MAENG_COCO_REPORT_STORE_PATH` 환경변수로 바꿀 수 있다. 사진만으로 정류장 위치를 확정하지 않으므로 자동 접수는 `정류장 위치 미확인` 상태로 전달한다.

현재 모델은 외벽 유리와 버스정보시스템 파손을 별도 클래스로 구분한다.
화면의
`(버스 정류장 외벽 유리)`는 `side_glass_damage`,
`(버스 정류장 시설)`은 `other_bus_stop_damage`,
`(버스 정류장 버스정보시스템)`은
`bus_information_system_damage`의 한글 표시다.
안내판·의자·천장 유리 같은 나머지 세부 부위 자동 표기는 유형별 데이터가
충분히 추가된 뒤에만 분리해야 한다.

모델 위치가 다르면 실행 시 지정한다.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-maeng-coco.ps1 `
  -ModelPath C:\외벽모델\checkpoint_selected_app.pth `
  -ReferenceModelPath C:\참조모델\checkpoint_selected_app.pth
```

이 방식은 현재 PC의 로컬 실행용이다. Vercel 정적 배포만으로는 Python GPU 모델이 실행되지 않으므로, 외부 배포 시 `VITE_MAENG_COCO_API_URL`을 별도의 추론 서버 주소로 설정해야 한다.

## 실제 서비스 모델로 가기 위한 최소 데이터

- 파손 유형별 학습 이미지 200장 이상
- 버스정보시스템 파손 독립 원본 학습 200장 이상, 검증·테스트 각 30장 이상
- 유형별 검증·테스트 이미지 각 30장 이상
- 정상 정류장과 유사 오염·반사·낙서 음성 이미지 300장 이상
- 동일 사진의 크롭·재저장을 서로 다른 분할에 넣지 않음
- 춘천 현장 사진을 별도 테스트 세트로 유지
- 두 명 이상이 박스를 검수하고 불일치를 조정
