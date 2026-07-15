import { Outlet } from "react-router-dom";
import AppShell from "./AppShell";

// 시민 라우트 전용 레이아웃 — 폰 폭 셸 안에서 렌더. (행정/인쇄는 이 레이아웃 밖)
export default function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
