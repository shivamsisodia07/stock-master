import React, { useEffect } from "react";
import AlertsPage from "./features/alerts/AlertsPage.jsx";
import HomePage from "./features/home/HomePage.jsx";
import LearnPage from "./features/learn/LearnPage.jsx";
import ScannerPage from "./features/scanner/ScannerPage.jsx";
import StockPage from "./features/stocks/StockPage.jsx";
import WatchlistPage from "./features/watchlist/WatchlistPage.jsx";
import IncomeTradesPage from "./features/income-trades/IncomeTradesPage.jsx";
import useAppRouter from "./lib/useAppRouter.js";

const ROUTES = {
  "/": HomePage,
  "/scanner": ScannerPage,
  "/learn": LearnPage,
  "/watchlist": WatchlistPage,
  "/alerts": AlertsPage,
  "/income-trades": IncomeTradesPage,
};

export default function App() {
  const { pathname, navigate } = useAppRouter();
  const stockRoute = pathname.match(/^\/stocks\/([^/]+)$/);
  const Page = stockRoute ? StockPage : ROUTES[pathname];

  useEffect(() => {
    if (!Page) navigate("/", true);
  }, [Page, navigate]);

  return Page ? <Page navigate={navigate} symbol={stockRoute?.[1]} /> : null;
}
