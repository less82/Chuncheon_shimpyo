import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/nanum-gothic/korean-400.css";
import "@fontsource/nanum-gothic/korean-700.css";
import "@fontsource/nanum-gothic/korean-800.css";
import "./admin.css";
import AdminApp from "./AdminApp";

createRoot(document.getElementById("admin-root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
