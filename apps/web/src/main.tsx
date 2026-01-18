import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "styled-system/styles.css";

const container = document.getElementById("root");
const queryClient = new QueryClient();
if (!container) {
  throw new Error("Missing root container");
}

const start = async () => {
  const useMocks = import.meta.env.VITE_USE_MOCKS === "true";
  if (useMocks) {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledRequest: "bypass" });
  }
  createRoot(container).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
};

void start();
