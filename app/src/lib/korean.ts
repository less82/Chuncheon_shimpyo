// 한국어 조사 처리. 담당 부서·운수회사 이름이 데이터에서 오기 때문에
// 문장에 그대로 이어 붙이면 "춘천시민버스이 맡는" 같은 문장이 나온다.
// 1차 사용자가 고령 이용자라 어색한 문장을 그대로 두지 않는다.

const HANGUL_START = 0xac00; // 가
const HANGUL_END = 0xd7a3; // 힣

/** 숫자 발음의 받침 유무. 예: 1(일)·7(칠)·8(팔)·0(영)은 받침이 있다. */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  "0": true,
  "1": true,
  "2": false,
  "3": true,
  "4": false,
  "5": false,
  "6": true,
  "7": true,
  "8": true,
  "9": false,
};

/**
 * 마지막 글자에 받침이 있는지 본다.
 * 한글이면 유니코드로 계산하고, 숫자면 발음 기준으로 본다.
 * 판단할 수 없으면 null 을 돌려 호출측이 조사를 붙이지 않도록 한다.
 */
export function hasBatchim(word: string): boolean | null {
  const trimmed = word.trim();
  if (!trimmed) return null;
  const last = trimmed[trimmed.length - 1];
  const code = last.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) {
    return (code - HANGUL_START) % 28 !== 0;
  }
  if (last >= "0" && last <= "9") return DIGIT_HAS_BATCHIM[last];
  return null;
}

/**
 * 받침에 맞는 조사를 고른다. 판단할 수 없으면 빈 문자열을 돌려준다
 * (틀린 조사를 붙이느니 붙이지 않는다).
 */
export function particle(word: string, withBatchim: string, withoutBatchim: string): string {
  const batchim = hasBatchim(word);
  if (batchim === null) return "";
  return batchim ? withBatchim : withoutBatchim;
}

/** 주격 조사 이/가. */
export function subjectParticle(word: string): string {
  return particle(word, "이", "가");
}
