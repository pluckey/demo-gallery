import { useEffect, useState } from "react";

/** Hash routing ("#/jev/scam"): enough for a gallery, and it works from any static host. */
export function useRoute(): string {
  const read = () => window.location.hash.slice(1) || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (path: string) => { window.location.hash = path; };
