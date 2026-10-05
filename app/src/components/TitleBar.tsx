import React, { useEffect, useState } from "react";
import { Minus, Square, Copy, X, ShieldAlert } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TitleBarProps {
  title?: string;
  aiConnected?: boolean;
}

export default function TitleBar({ title = "AntiRL", aiConnected = false }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
        const appWindow = getCurrentWindow();
        appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        appWindow.onResized(() => {
          appWindow.isMaximized().then(setIsMaximized).catch(() => {});
        }).then((fn) => {
          unlisten = fn;
        }).catch(() => {});
      }
    } catch (e) {
      console.warn("TitleBar window integration unavailable:", e);
    }
    return () => unlisten?.();
  }, []);

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize().catch(() => {});
    } catch (e) {
      console.warn("Minimize failed:", e);
    }
  };

  const handleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize().catch(() => {});
    } catch (e) {
      console.warn("Maximize failed:", e);
    }
  };

  const handleClose = () => {
    try {
      getCurrentWindow().close().catch(() => {});
    } catch (e) {
      console.warn("Close failed:", e);
    }
  };

  return (
    <header className="custom-titlebar" data-tauri-drag-region>
      {/* Brand & Identity */}
      <div className="titlebar-left" data-tauri-drag-region>
        <div className="titlebar-logo-badge">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="0.5" stopColor="#6366F1" />
                <stop offset="1" stopColor="#A855F7" />
              </linearGradient>
            </defs>
            <polygon points="16,2 30,10 30,22 16,30 2,22 2,10" fill="url(#logoGrad)" />
            <polygon points="16,7 25,13 25,19 16,25 7,19 7,13" fill="#090B10" />
            <circle cx="16" cy="16" r="3.5" fill="#38BDF8" />
          </svg>
        </div>
        <span className="titlebar-title">{title}</span>

        <div
          className={`titlebar-match-pill ${aiConnected ? "ai-on" : "ai-off"}`}
          title={aiConnected ? "Cloud AI consent is on and a provider key is detected" : "Enable cloud consent and add a provider key in Settings"}
        >
          <span className="pill-dot" />
          <span>{aiConnected ? "AI connected" : "AI disconnected"}</span>
        </div>
      </div>
      <div className="titlebar-center" data-tauri-drag-region />

      {/* Window Controls */}
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          title="Minimize"
          onClick={handleMinimize}
          aria-label="Minimize Window"
        >
          <Minus size={14} />
        </button>
        <button
          className="titlebar-btn"
          title={isMaximized ? "Restore" : "Maximize"}
          onClick={handleMaximize}
          aria-label="Toggle Maximize"
        >
          {isMaximized ? <Copy size={12} style={{ transform: "rotate(90deg)" }} /> : <Square size={12} />}
        </button>
        <button
          className="titlebar-btn titlebar-close"
          title="Close"
          onClick={handleClose}
          aria-label="Close Window"
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
