import React from "react";

export default function LoadingIndicator({ label, compact = false }) {
  return (
    <span className={`loading-indicator${compact ? " loading-indicator-compact" : ""}`} role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
