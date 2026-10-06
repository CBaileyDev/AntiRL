import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("React Component Error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#080A0F",
            color: "#F8FAFC",
            padding: 40,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 600,
              background: "#121722",
              border: "1px solid #F43F5E",
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
            }}
          >
            <h2 style={{ color: "#F43F5E", fontSize: 18, marginBottom: 12 }}>
              Application Render Exception
            </h2>
            <p style={{ color: "#94A3B8", fontSize: 13, marginBottom: 16 }}>
              {this.state.error?.message ||
                "An unexpected error occurred while mounting the user interface."}
            </p>
            <pre
              style={{
                background: "#080A0F",
                padding: 12,
                borderRadius: 8,
                fontSize: 11,
                color: "#E2E8F0",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: "8px 16px",
                background: "#6366F1",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
