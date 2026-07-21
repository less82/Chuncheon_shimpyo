param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,
  [Parameter(Mandatory = $true)]
  [string]$FullOutputCsv,
  [Parameter(Mandatory = $true)]
  [string]$MaengOutputCsv,
  [string]$BasisOutputCsv = '',
  [string]$PriorityEvidenceOutputCsv = '',
  [string]$StopIdMappingCsv = '',
  [string]$OperationalAuditCsv = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$locationPath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
$routePath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 노선정보_20260326.csv'
$stopsPath = Join-Path $projectRoot 'app\public\data\stops.json'

$surveyRows = @(Import-Csv -LiteralPath $InputCsv -Encoding UTF8)
$locations = @(Import-Csv -LiteralPath $locationPath -Encoding Default)
$routeRows = @(Import-Csv -LiteralPath $routePath -Encoding Default)
$stops = @((Get-Content -LiteralPath $stopsPath -Raw -Encoding UTF8 | ConvertFrom-Json).stops)

$locationById = @{}
foreach ($row in $locations) {
  $locationById[[string]$row.관리번호] = $row
}

$stopById = @{}
foreach ($stop in $stops) {
  $stopById[[string]$stop.id] = $stop
}

$mappingByManagementId = @{}
if ($StopIdMappingCsv -and (Test-Path -LiteralPath $StopIdMappingCsv)) {
  foreach ($mapping in (Import-Csv -LiteralPath $StopIdMappingCsv -Encoding UTF8)) {
    $mappingByManagementId[[string]$mapping.관리번호] = $mapping
  }
}

$operationalAuditByManagementId = @{}
if ($OperationalAuditCsv -and (Test-Path -LiteralPath $OperationalAuditCsv)) {
  foreach ($audit in (Import-Csv -LiteralPath $OperationalAuditCsv -Encoding UTF8)) {
    $operationalAuditByManagementId[[string]$audit.관리번호] = $audit
  }
}

$routeGroups = @{}
foreach ($group in ($routeRows | Group-Object 노선)) {
  $routeGroups[[string]$group.Name] = @($group.Group | Sort-Object { [int]$_.정류장순서 })
}

$routeEntriesByStop = @{}
foreach ($row in $routeRows) {
  $id = [string]$row.정류장
  if (-not $routeEntriesByStop.ContainsKey($id)) {
    $routeEntriesByStop[$id] = [System.Collections.Generic.List[object]]::new()
  }
  $routeEntriesByStop[$id].Add($row)
}

function Get-MajorDirection([string]$stopId) {
  if (-not $routeEntriesByStop.ContainsKey($stopId)) { return '공식 노선정보 없음' }
  $nextNames = [System.Collections.Generic.List[string]]::new()
  foreach ($entry in $routeEntriesByStop[$stopId]) {
    $ordered = @($routeGroups[[string]$entry.노선])
    for ($i = 0; $i -lt $ordered.Count - 1; $i++) {
      if ([string]$ordered[$i].정류장 -eq $stopId -and [string]$ordered[$i].정류장순서 -eq [string]$entry.정류장순서) {
        $nextNames.Add([string]$ordered[$i + 1].정류장명)
        break
      }
    }
  }
  if ($nextNames.Count -eq 0) { return '회차·종점' }
  $major = @($nextNames | Group-Object | Sort-Object @{ Expression = 'Count'; Descending = $true }, @{ Expression = 'Name'; Descending = $false } | Select-Object -First 2 -ExpandProperty Name)
  return ($major -join ' / ') + ' 방면'
}

$fullRows = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
  $lat = if ($location) { [string]$location.위도 } elseif ($stop) { [string]$stop.lat } else { '' }
  $lng = if ($location) { [string]$location.경도 } elseif ($stop) { [string]$stop.lng } else { '' }
  $name = if ($location) { [string]$location.정류장명 } else { [string]$survey.정류장명 }
  $majorDirection = Get-MajorDirection $id
  $mapping = $mappingByManagementId[$id]
  $operationalAudit = $operationalAuditByManagementId[$id]
  $pinLabel = [uri]::EscapeDataString("${name} 정류장")
  $pinUrl = if ($lat -and $lng) { "https://map.kakao.com/link/map/${pinLabel},${lat},${lng}" } else { '' }
  $isNumericRank = 0
  $rankIsNumber = [int]::TryParse([string]$survey.우선순위, [ref]$isNumericRank)

  [pscustomobject][ordered]@{
    '조사 순번(내부 작업순서)' = [string]$survey.우선순위
    '정류장 번호' = if ($location) { [string]$location.'정류장 번호' } else { '' }
    관리번호 = $id
    정류장명 = $name
    '정류장명(영어)' = if ($location) { [string]$location.'정류장명(영어)' } else { '' }
    경도 = $lng
    위도 = $lat
    '운행정보 연결상태' = if ($routeEntriesByStop.ContainsKey($id)) { '공식 노선정보 연결' } elseif ($operationalAudit) { '공식 위치 원본만 존재·현재성 미확정' } else { '운행 여부 확인 필요(노선·TAGO 미연결)' }
    '운행정보 확인조치' = if ($routeEntriesByStop.ContainsKey($id)) { '' } elseif ($operationalAudit) { '춘천시 원본 정정·변경이력 확인 전 판정 보류' } else { '노선·지도·현장 교차확인' }
    '주요 진행방면(공식 노선순서 기반)' = $majorDirection
    '승차자료 정류장 ID' = if ($mapping) { [string]$mapping.승차정류장ID } else { '' }
    '표본기간 한낮(11~16시) 개별 승차건수' = if ($mapping) { [string]$mapping.'개별 한낮 승차건수' } else { '' }
    '승차자료 매칭방법' = if ($mapping) { [string]$mapping.매칭방법 } else { '매칭자료 없음' }
    '승차자료 매칭신뢰등급' = if ($mapping) { [string]$mapping.매칭신뢰등급 } else { '보류' }
    '정류장 위치 확인 URL(카카오맵)' = $pinUrl
    '정류장 주변 확인 URL(카카오 로드뷰)' = [string]$survey.로드뷰URL
    그늘 = [string]$survey.그늘
    의자 = [string]$survey.의자
    조명 = [string]$survey.조명
    도착안내기 = [string]$survey.도착안내기
    '촬영시점(YYYY.MM)' = [string]$survey.'촬영시점(YYYY.MM)'
    조사자 = [string]$survey.조사자
    비고 = [string]$survey.비고
  }
}

$fullRows | Export-Csv -LiteralPath $FullOutputCsv -NoTypeInformation -Encoding UTF8

$maengRows = @($fullRows | Where-Object {
  $rank = 0
  [int]::TryParse([string]$_.'조사 순번(내부 작업순서)', [ref]$rank) -and $rank -ge 66 -and $rank -le 110
} | Select-Object '조사 순번(내부 작업순서)','정류장 번호',관리번호,정류장명,'정류장명(영어)',경도,위도,'운행정보 연결상태','운행정보 확인조치','주요 진행방면(공식 노선순서 기반)','승차자료 정류장 ID','표본기간 한낮(11~16시) 개별 승차건수','승차자료 매칭방법','승차자료 매칭신뢰등급','정류장 위치 확인 URL(카카오맵)','정류장 주변 확인 URL(카카오 로드뷰)',그늘,의자,조명,도착안내기,'촬영시점(YYYY.MM)',조사자,비고
)
$maengRows | Export-Csv -LiteralPath $MaengOutputCsv -NoTypeInformation -Encoding UTF8

if (-not $BasisOutputCsv) {
  $BasisOutputCsv = Join-Path (Split-Path -Parent $FullOutputCsv) 'roadview_survey_column_basis.csv'
}

$columnBasis = @(
  [pscustomobject]@{ 열='관리번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='관리번호'; 처리='원문 그대로'; 비고='위치·노선 자료를 연결하는 기관 관리 식별자' }
  [pscustomobject]@{ 열='정류장 번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장 번호'; 처리='원문 그대로'; 비고='현장·모바일 안내용 번호' }
  [pscustomobject]@{ 열='정류장명'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='정류장명(영어)'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명(영어)'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='위도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='위도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='경도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='경도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='데이터기준일'; 구분='출처 근거표에서만 관리'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='데이터기준일'; 처리='조사 작업표에서는 제외'; 비고='사용한 위치 원본은 2026-03-26 기준' }
  [pscustomobject]@{ 열='표본기간 한낮(11~16시) 개별 승차건수'; 구분='승차 ID별 집계'; 공식출처='강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'; 원본필드='수집일자, 정류장아이디, 이용시간대, 승차건수'; 처리='2025-06-25~28의 11~16시 승차건수를 승차 정류장 ID별로 합산'; 비고='관리번호 매칭이 보류된 행은 빈칸' }
  [pscustomobject]@{ 열='승차자료 매칭방법·신뢰등급'; 구분='공식자료 및 좌표 기반 연결'; 공식출처='국토교통부 버스정류장 API, 춘천시 위치정보'; 원본필드='정류장 ID, ARS 번호, 읍면동, 관리번호, 정류장 번호, 좌표'; 처리='ARS 직접 일치, 단일 후보, 읍면동 1:1만 연결'; 비고='근거가 부족한 경우 합산하거나 임의 배정하지 않고 보류' }
  [pscustomobject]@{ 열='주요 진행방면(공식 노선순서 기반)'; 구분='공식자료 기반 파생'; 공식출처='강원특별자치도 춘천시_버스정류장 노선정보_20260326.csv'; 원본필드='노선, 정류장순서, 정류장, 정류장명'; 처리='해당 관리번호 뒤에 가장 자주 등장하는 다음 정류장 최대 2곳을 방면으로 표시'; 비고='춘천시 원본의 공식 상행·하행 필드가 아니라 노선순서 기반 파생값' }
  [pscustomobject]@{ 열='운행정보 연결상태·확인조치'; 구분='교차검증 상태'; 공식출처='춘천시 위치·노선정보, TAGO 정류소정보, OpenStreetMap 지도 객체'; 원본필드='관리번호/정류소ID 존재 여부, 좌표, 지도 정류장 객체'; 처리='원본 정정 전에는 임의 분류·제외하지 않고 확인된 불일치 사실만 표시'; 비고='카카오 좌표 링크는 카카오 등록 정류소의 존재 증거가 아님' }
  [pscustomobject]@{ 열='조사 순번(내부 작업순서)'; 구분='프로젝트 내부값'; 공식출처='없음'; 원본필드='없음'; 처리='기존 대상 선정 결과의 작업 순서를 보존'; 비고='개별 정류장 위험도나 공식 행정 우선순위로 사용하지 않음' }
  [pscustomobject]@{ 열='정류장 위치 확인 URL(카카오맵)'; 구분='편의용 파생'; 공식출처='춘천시 위치정보의 위도·경도'; 원본필드='위도, 경도'; 처리='좌표를 카카오맵 위치 링크 형식으로 변환'; 비고='춘천시 원본 필드가 아닌 조사 참고 링크' }
  [pscustomobject]@{ 열='정류장 주변 확인 URL(카카오 로드뷰)'; 구분='조사용 파생'; 공식출처='춘천시 위치정보의 위도·경도'; 원본필드='위도, 경도'; 처리='좌표를 카카오 로드뷰 링크 형식으로 변환'; 비고='가장 가까운 파노라마로 이동할 수 있음' }
  [pscustomobject]@{ 열='그늘·의자·조명·도착안내기'; 구분='현장 조사'; 공식출처='없음'; 원본필드='없음'; 처리='있음/없음/미확인 3상태 입력'; 비고='근거 없이 없음으로 입력하지 않음' }
  [pscustomobject]@{ 열='촬영시점(YYYY.MM)'; 구분='로드뷰 수기 확인'; 공식출처='카카오 로드뷰 화면'; 원본필드='공식 API 필드 없음'; 처리='화면에서 확인한 경우만 입력'; 비고='자동 추정 금지' }
)
$columnBasis | Export-Csv -LiteralPath $BasisOutputCsv -NoTypeInformation -Encoding UTF8

if (-not $PriorityEvidenceOutputCsv) {
  $PriorityEvidenceOutputCsv = Join-Path (Split-Path -Parent $FullOutputCsv) 'roadview_survey_priority_evidence.csv'
}

$priorityEvidence = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
  $unknownCount = if ($stop) {
    @('shade','seat','light','sign' | Where-Object { $stop.facilities.$_.status -eq 'unknown' }).Count
  } else { '' }
  $numericRank = 0
  $hasRank = [int]::TryParse([string]$survey.우선순위, [ref]$numericRank)
  [pscustomobject][ordered]@{
    우선순위 = [string]$survey.우선순위
    '조사대상 구분' = if ($hasRank) { '승차자료 있음(순위 산정)' } else { '승차자료 없음(별도 조사)' }
    '정류장 번호' = if ($location) { [string]$location.'정류장 번호' } else { '' }
    관리번호 = $id
    정류장명 = if ($location) { [string]$location.정류장명 } else { [string]$survey.정류장명 }
    '위치정보 데이터기준일' = if ($location) { [string]$location.데이터기준일 } else { '' }
    '승차자료 데이터기준일' = '2025-12-09'
    '승차자료 표본기간' = '2025-06-25~2025-06-28'
    '한낮 시간대' = '11~16시'
    '표본기간 한낮 승차건수' = [string]$survey.한낮승차
    '기존자료 미확인 시설 수' = $unknownCount
    '우선순위 산정식' = if ($hasRank) { '승차건수 분위수(D) + 미확인 시설 수/4(UNK)' } else { '순위 미산정' }
    '승차자료 연결 방식' = '승차 정류장 ID별 개별 집계 후 공식자료 기반 관리번호 매칭'
    '연결 한계' = 'ARS 직접 일치·단일 후보·읍면동 1:1 근거가 없는 동명 정류장은 합산하거나 임의 배정하지 않고 보류'
    '승차자료 출처' = '강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'
    '위치정보 출처' = '강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
    '노령인구 데이터 활용 주의' = '행정경계 인접 정류장에 읍면동 전체 노령인구를 직접 부여하지 않음; 향후 좌표 주변 격자·생활권 단위 자료 사용'
  }
}
$priorityEvidence | Export-Csv -LiteralPath $PriorityEvidenceOutputCsv -NoTypeInformation -Encoding UTF8

Write-Output "FULL_ROWS=$($fullRows.Count)"
Write-Output "MAENG_ROWS=$($maengRows.Count)"
Write-Output "FULL_OUTPUT=$FullOutputCsv"
Write-Output "MAENG_OUTPUT=$MaengOutputCsv"
Write-Output "BASIS_OUTPUT=$BasisOutputCsv"
Write-Output "PRIORITY_EVIDENCE_OUTPUT=$PriorityEvidenceOutputCsv"
