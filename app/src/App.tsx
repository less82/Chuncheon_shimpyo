import { useEffect } from "react";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import AppEntry from "./features/citizen/AppEntry";
import AppCompare from "./features/citizen/AppCompare";
import Favorites from "./features/citizen/Favorites";
import AppReport from "./features/citizen/AppReport";
import TripView from "./features/trip/TripView";
import PrintPoster from "./features/print/PrintPoster";
import Dashboard from "./features/admin/Dashboard";
import AdminConcepts from "./features/admin/AdminConcepts";
import DesignPreview from "./features/design/DesignPreview";
import QrCompare from "./features/qr/QrCompare";
import QrEntry from "./features/qr/QrEntry";
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
        <Route path="/" element={<AppEntry />} />
        <Route path="/app" element={<AppEntry />} />
        <Route path="/app-compare" element={<AppCompare />} />
        <Route path="/qr_main" element={<QrEntry />} />
        <Route path="/qr-compare" element={<QrCompare />} />
        <Route path="/app/report" element={<AppReport />} />
        <Route path="/report" element={<Navigate to="/app/report" replace />} />
        <Route path="/design-preview" element={<DesignPreview />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/go" element={<TripView />} />
        <Route path="/print/:id" element={<PrintPoster />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin-concepts" element={<AdminConcepts />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
