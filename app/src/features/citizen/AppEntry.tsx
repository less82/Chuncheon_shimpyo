import { useEffect, useState } from "react";
import CitizenHome from "./CitizenHome";
import AppCompare from "./AppCompare";

const DESKTOP_COMPARE = "(min-width: 900px)";

export default function AppEntry() {
  const single = new URLSearchParams(window.location.search).has("single");
  const [wide, setWide] = useState(() => window.matchMedia(DESKTOP_COMPARE).matches);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_COMPARE);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (single || !wide) return <CitizenHome />;
  return <AppCompare />;
}
