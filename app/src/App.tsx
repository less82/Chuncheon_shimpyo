import { useEffect } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import CitizenHome from "./features/citizen/CitizenHome";
import Favorites from "./features/citizen/Favorites";
import AppReport from "./features/citizen/AppReport";
import TripView from "./features/trip/TripView";
import FindHub from "./features/find/FindHub";
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
        <Route path="/" element={<CitizenHome />} />
        <Route path="/app" element={<CitizenHome />} />
        <Route path="/app/report" element={<AppReport />} />
        <Route path="/find" element={<FindHub />} />
        {/* 문의처 목록 화면은 없앴다. 문의는 알리기 한 흐름으로 모은다. */}
        <Route path="/contacts" element={<Navigate to="/app/report" replace />} />
        <Route path="/report" element={<Navigate to="/app/report" replace />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/go" element={<TripView />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
