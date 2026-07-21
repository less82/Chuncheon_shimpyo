import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CitizenHome from "./features/citizen/CitizenHome";
import Favorites from "./features/citizen/Favorites";
import AppReport from "./features/citizen/AppReport";
import TripView from "./features/trip/TripView";
import PrintPoster from "./features/print/PrintPoster";
import Dashboard from "./features/admin/Dashboard";
import AdminConcepts from "./features/admin/AdminConcepts";
import DesignPreview from "./features/design/DesignPreview";
import QrMain from "./features/qr/QrMain";
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
        <Route path="/qr_main" element={<QrMain />} />
        <Route path="/app/report" element={<AppReport />} />
        <Route path="/design-preview" element={<DesignPreview />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/go" element={<TripView />} />
        <Route path="/print/:id" element={<PrintPoster />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin-concepts" element={<AdminConcepts />} />
      </Routes>
    </BrowserRouter>
  );
}
