export function speechErrorMessage(error: string): string {
  if (error === "not-allowed" || error === "service-not-allowed") return "마이크 권한을 허용해주세요.";
  if (error === "audio-capture") return "사용할 수 있는 마이크를 확인해주세요.";
  if (error === "no-speech") return "정류장 이름을 다시 말해주세요.";
  if (error === "network") return "음성 인식 서비스 연결 실패 · 직접 입력해주세요.";
  if (error === "language-not-supported") return "이 기기에서는 한국어 음성 입력을 지원하지 않습니다.";
  if (error === "aborted") return "음성 입력이 중단됐습니다. 다시 눌러주세요.";
  return "음성 입력을 시작하지 못했습니다. 다시 눌러주세요.";
}
