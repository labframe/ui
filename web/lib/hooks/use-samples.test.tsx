import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSamplesQuery, useUpdateSampleParameters } from "@/lib/hooks/use-samples";
import { createMockSample, createMockSamples } from "../fixtures/samples";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { ReactNode } from "react";

// Helper to create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe("useSamplesQuery", () => {
  it("should fetch samples successfully", async () => {
    const { result } = renderHook(() => useSamplesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(3);
    expect(result.current.data?.[0]).toMatchObject({
      sample_id: 1,
      code: "SAM-001",
    });
  });

  it("should handle includeDeleted parameter", async () => {
    const { result } = renderHook(
      () => useSamplesQuery({ includeDeleted: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeDefined();
  });

  it("should handle fetch errors", async () => {
    // Override handler to return error
    server.use(
      http.get("/api/samples", () => {
        return HttpResponse.json(
          { error: "Failed to fetch samples" },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useSamplesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("should cache samples with staleTime", async () => {
    const { result, rerender } = renderHook(() => useSamplesQuery(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstData = result.current.data;

    // Rerender should use cached data
    rerender();
    expect(result.current.data).toBe(firstData);
  });
});

describe("useUpdateSampleParameters", () => {
  it("should update sample parameters successfully", async () => {
    const { result } = renderHook(() => useUpdateSampleParameters(), {
      wrapper: createWrapper(),
    });

    const sampleId = 1;
    const assignments = [
      { name: "temperature", value: "30.0" },
      { name: "pressure", value: "2.0" },
    ];

    result.current.mutate({ sampleId, assignments });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      sample_id: sampleId,
      parameters: {
        temperature: "30.0",
        pressure: "2.0",
      },
    });
  });

  it("should handle mutation errors", async () => {
    server.use(
      http.post("/api/samples/:id/parameters", () => {
        return HttpResponse.json(
          { error: "Update failed" },
          { status: 400 }
        );
      })
    );

    const { result } = renderHook(() => useUpdateSampleParameters(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      sampleId: 1,
      assignments: [{ name: "test", value: "value" }],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("should invalidate queries on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateSampleParameters(), {
      wrapper,
    });

    result.current.mutate({
      sampleId: 1,
      assignments: [{ name: "temperature", value: "25.0" }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["samples"] })
    );
  });
});
