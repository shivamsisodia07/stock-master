import { useEffect, useState } from "react";

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
  }, [key, values]);

  return [values, setValues];
}
