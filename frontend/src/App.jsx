import React, { useEffect } from "react";
import AlertsPage from "./features/alerts/AlertsPage.jsx";
import ScannerPage from "./features/scanner/ScannerPage.jsx";
import WatchlistPage from "./features/watchlist/WatchlistPage.jsx";
import useAppRouter from "./lib/useAppRouter.js";

const ROUTES = {
  "/": ScannerPage,
  "/watchlist": WatchlistPage,
  "/alerts": AlertsPage,
};

export default function App() {
  const { pathname, navigate } = useAppRouter();
  const route = ROUTES[pathname];
  const Page = route || ScannerPage;

  useEffect(() => {
    if (!route) navigate("/", true);
  }, [route, navigate]);

  return <Page navigate={navigate} />;
}
