import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

// Safe mount: catch any render-phase crash and show a fallback
try {
  createRoot(document.getElementById("root")!).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
} catch (e) {
  console.error("[CRITICAL] App mount failed:", e);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="padding:40px;font-family:sans-serif;text-align:center">
        <h2 style="color:#dc2626;margin-bottom:16px">App failed to load</h2>
        <p style="color:#666">Please clear your browser cache and reload.</p>
        <p style="color:#999;font-size:12px;margin-top:8px">${e instanceof Error ? e.message : String(e)}</p>
        <button onclick="location.reload()" style="margin-top:24px;padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer">Reload</button>
      </div>
    `;
  }
}
