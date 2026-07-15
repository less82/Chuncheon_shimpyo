import type { ReactNode } from "react";
import "./AppShell.css";

// 모바일 셸 — 앱을 폰 폭으로 가둬 데스크톱에서도 폰처럼 보이게 한다.
export default function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">{children}</div>;
}
