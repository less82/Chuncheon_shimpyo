import "@testing-library/jest-dom";

// jsdom 은 scrollIntoView 를 구현하지 않아 호출 시 "Not implemented" 콘솔 에러를 낸다.
// 테스트 출력이 지저분해지지 않도록 무동작 스텁으로 강제 대체.
Element.prototype.scrollIntoView = () => {};
