import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CONTACT_CATEGORIES } from "../../data/busContacts";
import ContactGuide, { telHref } from "./ContactGuide";

describe("<ContactGuide>", () => {
  it("안내문의 네 가지 접수 분류를 모두 보여준다", () => {
    const screen = render(<ContactGuide />);
    for (const category of CONTACT_CATEGORIES) {
      expect(screen.getByRole("heading", { name: category.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "버스 노선정보" })).toBeInTheDocument();
  });

  it("노선을 주면 그 정류장에 오지 않는 운수회사는 감춘다", () => {
    // 남산304 는 한일여행사(자) 권역 — 나머지 세 곳은 근거가 없으므로 나오면 안 된다.
    const screen = render(<ContactGuide routes={["남산304"]} stopName="남산면사무소" />);
    expect(screen.getByText("한일여행사(자)")).toBeInTheDocument();
    expect(screen.queryByText("춘천시민버스")).not.toBeInTheDocument();
    expect(screen.queryByText("매일관광주식회사")).not.toBeInTheDocument();
    expect(screen.queryByText("뉴코리아고속관광(주)")).not.toBeInTheDocument();
  });

  it("정류장 이름을 주면 좁힌 근거를 문장으로 밝힌다", () => {
    const screen = render(<ContactGuide routes={["1"]} stopName="춘천역" />);
    expect(screen.getByText(/에 오는 버스 기준입니다/)).toBeInTheDocument();
    expect(screen.getByText("춘천역")).toBeInTheDocument();
  });

  it("전화 링크는 하이픈을 뺀 tel: 형식이다", () => {
    expect(telHref("033-250-3316")).toBe("tel:0332503316");
    const screen = render(<ContactGuide />);
    const links = screen.getAllByRole("link", { name: /전화 걸기$/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^tel:033\d{7}$/);
    }
  });

  it("compact 는 예시 문구와 노선정보 링크를 접는다", () => {
    const screen = render(<ContactGuide compact />);
    expect(screen.queryByRole("heading", { name: "버스 노선정보" })).not.toBeInTheDocument();
    expect(screen.queryByText(CONTACT_CATEGORIES[0].examples)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: CONTACT_CATEGORIES[0].title })).toBeInTheDocument();
  });
});
