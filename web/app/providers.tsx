"use client";

import { type ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { SettingsProvider } from "@/components/settings/settings-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: "always",
            retry: 1, // Only retry once on failure
            retryDelay: 1000, // Wait 1 second before retry
            staleTime: 30_000, // Consider data stale after 30 seconds
            gcTime: 5 * 60_000, // Keep unused data in cache for 5 minutes (formerly cacheTime)
            refetchOnWindowFocus: false, // Disable refetch on window focus to reduce load
            refetchOnReconnect: false, // Disable refetch on reconnect to reduce load
          },
          mutations: {
            retry: 0, // Don't retry mutations
          },
        },
      }),
  );

  useEffect(() => {
    console.log("Providers mounted", {
      navigatorOnline: typeof navigator !== "undefined" ? navigator.onLine : null,
    });
  }, []);

  return (
    <ThemeProvider>
      <SettingsProvider>
        <QueryClientProvider client={client}>
          {children}
          {process.env.NODE_ENV === "development" ? (
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
          ) : null}
        </QueryClientProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
