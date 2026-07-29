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
    // 시민 앱과 같은 출처의 /admin 에서 서비스한다(vite.admin.config.ts 의 base 와 맞춘다).
    // 같은 출처여야 localStorage 에 쌓인 시민 제보를 관리자가 읽을 수 있다.
    // dev 전용 서버로 띄울 때도 base 가 /admin/ 이라 같은 경로를 쓴다.
    <BrowserRouter basename="/admin">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="concepts" element={<AdminConcepts />} />
        {/* 예전 dev 주소(/admin) 북마크가 빈 화면이 되지 않게 루트로 보낸다. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
