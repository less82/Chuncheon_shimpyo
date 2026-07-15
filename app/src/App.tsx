import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import ShellLayout from "./components/ShellLayout";
import CitizenRoot from "./features/citizen/CitizenRoot";
import Favorites from "./features/citizen/Favorites";
import TripView from "./features/trip/TripView";
import PrintPoster from "./features/print/PrintPoster";
import Dashboard from "./features/admin/Dashboard";
import { useStops } from "./store/useStops";

export default function App() {
  const load = useStops((s) => s.load);
  const loaded = useStops((s) => s.loaded);

  useEffect(() => {
    if (!loaded) {
      void load();
    }
  }, [load, loaded]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 시민 화면 — 폰 폭 셸 안 */}
        <Route element={<ShellLayout />}>
          <Route path="/" element={<CitizenRoot />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/go" element={<TripView />} />
        </Route>
        {/* 행정·인쇄 — 셸 밖(손대지 않음) */}
        <Route path="/print/:id" element={<PrintPoster />} />
        <Route path="/admin" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
