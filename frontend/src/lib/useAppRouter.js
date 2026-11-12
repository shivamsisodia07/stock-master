import { useCallback, useEffect, useState } from "react";

export default function useAppRouter() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((path, replace = false) => {
    if (path === window.location.pathname) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", path);
    setPathname(path);
  }, []);

  return { pathname, navigate };
}
