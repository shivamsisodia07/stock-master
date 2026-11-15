import { useCallback, useEffect, useState } from "react";

export const APP_BASE_PATH = "/swingtrader";

export function appRoutePath(path) {
  const requestedPath = path.startsWith("/") ? path : `/${path}`;
  if (requestedPath === APP_BASE_PATH || requestedPath.startsWith(`${APP_BASE_PATH}/`)) {
    return requestedPath;
  }
  return requestedPath === "/" ? APP_BASE_PATH : `${APP_BASE_PATH}${requestedPath}`;
}

function routePathFromUrl(pathname) {
  if (pathname === APP_BASE_PATH || pathname === `${APP_BASE_PATH}/`) return "/";
  return pathname.startsWith(`${APP_BASE_PATH}/`) ? pathname.slice(APP_BASE_PATH.length) : pathname;
}

export default function useAppRouter() {
  const [pathname, setPathname] = useState(() => routePathFromUrl(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      const routePath = routePathFromUrl(currentPath);
      const canonicalPath = appRoutePath(routePath);
      if (currentPath !== canonicalPath) {
        window.history.replaceState({}, "", `${canonicalPath}${window.location.search}${window.location.hash}`);
      }
      setPathname(routePath);
    };
    handlePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((path, replace = false) => {
    const routePath = routePathFromUrl(path);
    const canonicalPath = appRoutePath(routePath);
    if (canonicalPath !== window.location.pathname) {
      window.history[replace ? "replaceState" : "pushState"]({}, "", canonicalPath);
    }
    setPathname(routePath);
  }, []);

  return { pathname, navigate };
}
