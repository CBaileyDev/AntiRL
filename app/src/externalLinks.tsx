import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Native opener prevents coach sources replacing the desktop app's webview. */
export function ExternalLink({
  href = "",
  children,
  node: _node,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const [error, setError] = useState("");
  const safe = safeExternalUrl(href);
  const open = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!safe) return;
    try {
      if ("__TAURI_INTERNALS__" in window) await openUrl(safe);
      else window.open(safe, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open this link in your browser.");
    }
  };
  return (
    <>
      <a {...props} href={safe || undefined} onClick={open} rel="noopener noreferrer">
        {children}
      </a>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
