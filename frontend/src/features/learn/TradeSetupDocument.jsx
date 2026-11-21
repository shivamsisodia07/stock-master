import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { getTradeSetupGuide } from "../../lib/api.js";

export default function TradeSetupDocument() {
  const [document, setDocument] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getTradeSetupGuide(controller.signal)
      .then(setDocument)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message || "Unable to load the trade setup guide.");
      });
    return () => controller.abort();
  }, []);

  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!document) return <div className="loading-banner">Loading the full trading setup…</div>;

  return (
    <article className="learn-doc-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{ h1: "h2", h2: "h3", h3: "h4", h4: "h5" }}
      >
        {document}
      </ReactMarkdown>
    </article>
  );
}
