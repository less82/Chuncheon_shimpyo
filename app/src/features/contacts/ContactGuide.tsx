import { Phone } from "lucide-react";
import {
  CONTACT_CATEGORIES,
  ROUTE_INFO_LINKS,
  rideContactsForRoutes,
} from "../../data/busContacts";
import type { BusContact, ContactCategoryInfo } from "../../data/busContacts";
import "./ContactGuide.css";

/** 전화 앱으로 넘길 때 쓰는 형식(하이픈 제거). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/-/g, "")}`;
}

/**
 * 접수처 전화 한 줄. 접수처 카드를 쓰는 곳은 모두 이 조각을 쓴다.
 * (같은 마크업을 화면마다 다시 짜면 디자인이 갈라진다.)
 */
export function ContactTel({ contact }: { contact: BusContact }) {
  return (
    <a
      className="contactguide__tel"
      href={telHref(contact.phone)}
      aria-label={`${contact.org} ${contact.phone} 전화 걸기`}
    >
      <Phone aria-hidden="true" />
      <span>
        <strong>{contact.org}</strong>
        {contact.scope && <small>{contact.scope}</small>}
      </span>
      <em>{contact.phone}</em>
    </a>
  );
}

export interface ContactGuideProps {
  /** 이 정류장에 실제로 오는 노선 목록. 주면 이용 불편 접수처를 그 회사로 좁힌다. */
  routes?: string[];
  /** 근거 문구("○○에 오는 버스 기준입니다")에 쓸 정류장 이름. */
  stopName?: string;
  /** 참고용으로 좁게 보여줄 때. 예시 문구와 버스 노선정보 링크를 접는다. */
  compact?: boolean;
}

/**
 * 춘천시 「시내(마을)버스 문의사항이 생기셨나요?」 안내문의 접수처 안내.
 *
 * 이 앱은 공식 접수 연계가 없으므로 "접수처 안내"까지만 한다.
 * 어디에도 민원을 접수했다고 표시하지 않는다.
 */
export default function ContactGuide({ routes, stopName, compact = false }: ContactGuideProps) {
  const contactsOf = (category: ContactCategoryInfo): BusContact[] =>
    category.key === "ride" ? rideContactsForRoutes(routes ?? []) : category.contacts;

  return (
    <>
      {CONTACT_CATEGORIES.map((category) => (
        <article className="contactguide__contact" key={category.key}>
          <h2>{category.title}</h2>
          {!compact && <p className="contactguide__contact-ex">{category.examples}</p>}
          {category.key === "ride" && stopName && (
            <p className="contactguide__contact-ex"><b>{stopName}</b>에 오는 버스 기준입니다.</p>
          )}
          {contactsOf(category).map((item) => <ContactTel contact={item} key={item.phone} />)}
          {category.required.length > 0 && (
            <p className="contactguide__contact-need">함께 알려주세요 · {category.required.join(", ")}</p>
          )}
        </article>
      ))}
      {!compact && (
        <article className="contactguide__contact">
          <h2>버스 노선정보</h2>
          <div className="contactguide__links">
            {ROUTE_INFO_LINKS.map((link) => (
              <a href={link.url} key={link.url} target="_blank" rel="noreferrer noopener">{link.label}</a>
            ))}
          </div>
        </article>
      )}
    </>
  );
}
