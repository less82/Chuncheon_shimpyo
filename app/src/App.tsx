import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CitizenHome from "./features/citizen/CitizenHome";
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
        <Route path="/" element={<CitizenHome />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/go" element={<TripView />} />
        <Route path="/print/:id" element={<PrintPoster />} />
        <Route path="/admin" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
