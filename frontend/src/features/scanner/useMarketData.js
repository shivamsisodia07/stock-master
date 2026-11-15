import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getMarketData } from "../../lib/api.js";

const POLL_INTERVAL = 60_000;

export default function useMarketData() {
  const [stocks, setStocks] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [universe, setUniverse] = useState(null);
  const [failedBatches, setFailedBatches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeRequest = useRef(false);
  const requestController = useRef(null);

  const refresh = useCallback(async () => {
    if (activeRequest.current) return;
    activeRequest.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const payload = await getMarketData(controller.signal);
      setStocks(payload.stocks);
      setUpdatedAt(payload.updated_at);
      setUniverse(payload.universe);
      setFailedBatches(payload.failed_batches || []);
      setError("");
    } catch (requestError) {
      if (!axios.isCancel(requestError)) {
        setError(requestError.message || "Unable to load market data. Check that the Python API is running.");
      }
    } finally {
      if (requestController.current === controller) {
        if (!controller.signal.aborted) setLoading(false);
        activeRequest.current = false;
        requestController.current = null;
      }
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL);
    return () => {
      window.clearInterval(interval);
      const controller = requestController.current;
      requestController.current = null;
      activeRequest.current = false;
      controller?.abort();
    };
  }, [refresh]);

  return { stocks, updatedAt, universe, failedBatches, error, loading, refresh };
}
