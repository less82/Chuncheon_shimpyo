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
    <BrowserRouter basename="/admin">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="concepts" element={<AdminConcepts />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
    </BrowserRouter>
  );
}
