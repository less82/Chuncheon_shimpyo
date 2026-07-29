import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminConcepts from "./features/admin/AdminConcepts";
import Dashboard from "./features/admin/Dashboard";
import { useStops } from "./store/useStops";

export default function AdminApp() {
  const load = useStops((state) => state.load);
  const loaded = useStops((state) => state.loaded);

  useEffect(() => {
    if (!loaded) void load();
  }, [load, loaded]);

  return (
    // 관리자는 전용 dev 서버(vite.admin.config.ts, root=app/admin)와 전용 빌드(dist/admin)를
    // 각각 자기 루트에서 서비스한다. dev 에서만 "/admin" 을 붙이면 vite 가 안내하는 주소가
    // 빈 화면이 된다(예전 통합 서빙 구성의 잔재).
    <BrowserRouter>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="concepts" element={<AdminConcepts />} />
        {/* 예전 dev 주소(/admin) 북마크가 빈 화면이 되지 않게 루트로 보낸다. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
