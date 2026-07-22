export function speechErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "마이크 권한을 허용해주세요.";
  if (error === "audio-capture") return "사용할 수 있는 마이크를 확인해주세요.";
  if (error === "no-speech") return "정류장 이름을 다시 말해주세요.";
  if (error === "network") return "음성 인식 서비스 연결 실패 · 직접 입력해주세요.";
  if (error === "language-not-supported") return "이 기기에서는 한국어 음성 입력을 지원하지 않습니다.";
  if (error === "aborted") return "음성 입력이 중단됐습니다. 다시 눌러주세요.";
  return "음성 입력을 시작하지 못했습니다. 다시 눌러주세요.";
}

function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/대학교/g, "대")
    .replace(/정류장/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

/** 전체 발화에서 정류장을 특정하는 이름 또는 번호만 남긴다. */
export function extractStopKeyword(transcript: string, stopNames: string[]): string {
  const stopNumber = transcript.match(/\d{4,}/)?.[0];
  if (stopNumber) return stopNumber;

  const spoken = comparable(transcript);
  const matchedName = [...stopNames]
    .filter((name) => comparable(name).length > 0 && spoken.includes(comparable(name)))
    .sort((a, b) => comparable(b).length - comparable(a).length)[0];
  if (matchedName) return matchedName;

  return transcript
    .replace(/(출발지|목적지|버스|정류장|승강장)/g, " ")
    .replace(/(에서|으로|로|까지|가는|가고|가려고|가주세요|갈게요|타요|탑니다|말할게요|알려줘요)/g, " ")
    .replace(/(입니다|이에요|예요|해주세요|싶어요)/g, " ")
    .replace(/[^0-9a-zA-Z가-힣]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .join(" ");
}
