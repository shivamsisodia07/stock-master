import React, { useCallback, useEffect } from "react";
import AlertsPage from "./features/alerts/AlertsPage.jsx";
import HomePage from "./features/home/HomePage.jsx";
import LearnPage from "./features/learn/LearnPage.jsx";
import ScannerPage from "./features/scanner/ScannerPage.jsx";
import StockPage from "./features/stocks/StockPage.jsx";
import WatchlistPage from "./features/watchlist/WatchlistPage.jsx";
import TradeJournalPage from "./features/trade-journal/TradeJournalPage.jsx";
import SampleTradesPage from "./features/sample-trades/SampleTradesPage.jsx";
import ChartPage from "./features/chart/ChartPage.jsx";
import useAppRouter from "./lib/useAppRouter.js";
import { AuthProvider, useCloudSync } from "./lib/firebaseSync.jsx";

const ROUTES = {
  "/": HomePage,
  "/scanner": ScannerPage,
  "/learn": LearnPage,
  "/watchlist": WatchlistPage,
  "/alerts": AlertsPage,
  "/journal": TradeJournalPage,
  "/sample-trades": SampleTradesPage,
};

function AppContent() {
  const { pathname, navigate } = useAppRouter();
  const { user, authReady } = useCloudSync();
  const stockRoute = pathname.match(/^\/stocks\/([^/]+)$/);
  const chartRoute = pathname.match(/^\/charts\/([^/]+)(?:\/(daily|weekly|monthly|quarterly|60m|75m))?$/);
  const Page = chartRoute ? ChartPage : stockRoute ? StockPage : ROUTES[pathname];
  const pageRequiresLogin = pathname !== "/" && pathname !== "/learn";
  const accessDenied = pageRequiresLogin && (!authReady || !user);
  const navigateWithAccess = useCallback((path, replace = false) => {
    if (!user && path !== "/" && path !== "/learn") {
      navigate("/", true);
      return;
    }
    navigate(path, replace);
  }, [navigate, user]);

  useEffect(() => {
    if (!Page || (authReady && !user && pageRequiresLogin)) navigate("/", true);
  }, [Page, navigate, authReady, user, pageRequiresLogin]);

  if (!Page || accessDenied) return null;
  return <Page navigate={navigateWithAccess} symbol={stockRoute?.[1] || chartRoute?.[1]} timeframe={chartRoute?.[2]} />;
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>;
}
