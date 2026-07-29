import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import "./ConfirmModal.css";

export interface ConfirmModalProps {
  open: boolean;
  /** 모달이 묻는 한 문장. aria-labelledby 로도 쓴다. */
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 시민 화면용 확인 모달.
 * 관리자 화면(features/admin/Dashboard.tsx)의 backdrop + role="dialog" 패턴을
 * 시민 화면 크기와 디자인 언어(AppReport)에 맞춰 옮긴 것이다.
 */
export default function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // onCancel 은 렌더마다 새 함수라 의존성에 넣으면 포커스가 계속 되돌아간다. 참조로만 읽는다.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    firstButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelRef.current();
        return;
      }
      // aria-modal="true" 로 선언한 이상 Tab 이 뒤 화면으로 새면 안 된다.
      // 관리자 모달(Dashboard)과 같은 방식으로 모달 안에서 순환시킨다.
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    // 모달이 떠 있는 동안 뒤 화면이 스크롤되지 않게 막는다.
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="confirmmodal__backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="confirmmodal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 className="confirmmodal__title" id={titleId}>{title}</h2>
        {children && <div className="confirmmodal__body">{children}</div>}
        <div className="confirmmodal__actions">
          <button ref={firstButtonRef} type="button" className="confirmmodal__cancel" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="confirmmodal__confirm" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
