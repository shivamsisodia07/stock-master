import { useEffect, useState } from "react";

function announceLocalChange(key) {
  window.dispatchEvent(new CustomEvent("swingTrader:local-data-changed", { detail: { key } }));
}

export function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn(`Ignoring invalid local data for ${key}.`, error);
    return [];
  }
}

export function usePersistentArray(key) {
  const [values, setValues] = useState(() => readStoredArray(key));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(values));
    announceLocalChange(key);
  }, [key, values]);

  useEffect(() => {
    const refreshFromCloud = (event) => {
      if (event.detail?.key === key) setValues(readStoredArray(key));
    };
    window.addEventListener("swingTrader:cloud-data-updated", refreshFromCloud);
    return () => window.removeEventListener("swingTrader:cloud-data-updated", refreshFromCloud);
  }, [key]);

  return [values, setValues];
}
