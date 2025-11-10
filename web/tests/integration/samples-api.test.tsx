import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@/tests/helpers/utils";
import { server } from "@/tests/helpers/mocks/server";
import { http, HttpResponse } from "msw";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMockSamples } from "@/tests/helpers/fixtures/samples";

// Mock samples page component for integration testing
function SamplesList() {
  const [samples, setSamples] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/samples")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then(setSamples)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Samples</h1>
      <ul>
        {samples.map((sample) => (
          <li key={sample.sample_id}>{sample.code}</li>
        ))}
      </ul>
    </div>
  );
}

describe("Samples Integration", () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };

  it("fetches and displays samples from API", async () => {
    render(<SamplesList />, { wrapper: createWrapper() });

    // Show loading state
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Verify samples are displayed
    expect(screen.getByText("SAM-001")).toBeInTheDocument();
    expect(screen.getByText("SAM-002")).toBeInTheDocument();
    expect(screen.getByText("SAM-003")).toBeInTheDocument();
  });

  it("handles empty results", async () => {
    // Override handler to return empty array
    server.use(
      http.get("/api/samples", () => {
        return HttpResponse.json([]);
      })
    );

    render(<SamplesList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // List should be empty but component should render
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("handles network errors gracefully", async () => {
    // Override handler to simulate network error
    server.use(
      http.get("/api/samples", () => {
        return HttpResponse.error();
      })
    );

    render(<SamplesList />, { wrapper: createWrapper() });

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });

    // Verify error message is displayed
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("handles server errors with proper status codes", async () => {
    server.use(
      http.get("/api/samples", () => {
        return HttpResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      })
    );

    render(<SamplesList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it("handles large datasets efficiently", async () => {
    const largeMockDataset = createMockSamples(100);

    server.use(
      http.get("/api/samples", () => {
        return HttpResponse.json(largeMockDataset);
      })
    );

    const startTime = performance.now();
    render(<SamplesList />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    // Ensure rendering completes in reasonable time
    expect(renderTime).toBeLessThan(5000); // 5 seconds max

    // Verify all samples rendered
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(100);
  });

  it("handles API response delay with timeout", async () => {
    vi.useFakeTimers();

    server.use(
      http.get("/api/samples", async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return HttpResponse.json(createMockSamples(3));
      })
    );

    render(<SamplesList />, { wrapper: createWrapper() });

    // Initially loading
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Fast-forward time
    await vi.advanceTimersByTimeAsync(3000);

    // Data should be loaded
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
