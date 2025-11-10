"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueries, useQueryClient } from "@tanstack/react-query";

import {
  fetchParameterDefinitions,
  fetchParameterHistory,
  fetchLatestParameterValue,
  fetchParameterUniqueValues,
  fetchSamples,
  getSampleParameterValues,
  type FetchSamplesParams,
  type ParameterDefinition,
  type SampleParameterAssignment,
  type SampleListItem,
  type ParameterValueHistoryItem,
  type ParameterValueSuggestion,
  type SampleParameterValueItem,
  updateSampleParameters,
  createSample,
  type CreateSamplePayload,
  deleteSample,
} from "../api";

const SAMPLES_QUERY_KEY = ["samples"] as const;
const PARAMETER_DEFINITIONS_KEY = ["parameter-definitions"] as const;

export function useSamplesQuery(params: FetchSamplesParams = {}) {
  return useQuery<SampleListItem[], Error>({
    queryKey: [...SAMPLES_QUERY_KEY, params.includeDeleted ?? false],
    queryFn: async ({ signal }) => {
      // Reduced logging to prevent performance issues
      if (process.env.NODE_ENV === "development") {
        console.warn("useSamplesQuery: queryFn start", {
          includeDeleted: params.includeDeleted ?? false,
          signalAborted: signal?.aborted ?? false,
        });
      }
      const result = await fetchSamples(params, { signal });
      if (process.env.NODE_ENV === "development") {
        console.warn("useSamplesQuery: queryFn success", {
          includeDeleted: params.includeDeleted ?? false,
          rowCount: result.length,
        });
      }
      return result;
    },
    staleTime: 30_000,
  });
}

interface UpdateParametersInput {
  sampleId: number;
  assignments: SampleParameterAssignment[];
}

export function useUpdateSampleParameters() {
  const queryClient = useQueryClient();

  return useMutation<SampleListItem, Error, UpdateParametersInput>({
    mutationFn: ({ sampleId, assignments }) => {
      // Reduced logging to prevent performance issues
      if (process.env.NODE_ENV === "development") {
        console.warn("useUpdateSampleParameters: mutation invoked", {
          sampleId,
          assignmentCount: assignments.length,
        });
      }
      return updateSampleParameters(sampleId, assignments);
    },
    onSuccess: (updatedSample) => {
      queryClient.setQueriesData<SampleListItem[] | undefined>(
        { queryKey: SAMPLES_QUERY_KEY, exact: false },
        (previous) =>
          previous?.map((sample) =>
            sample.sample_id === updatedSample.sample_id ? updatedSample : sample,
          ) ?? previous,
      );
    },
    onError: (err) => {
      console.info("Failed to update sample parameters", err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAMPLES_QUERY_KEY, exact: false });
      void queryClient.invalidateQueries({ queryKey: ["parameter-unique-values"], exact: false });
    },
  });
}

export function useParameterDefinitions() {
  return useQuery<ParameterDefinition[], Error>({
    queryKey: PARAMETER_DEFINITIONS_KEY,
    queryFn: async ({ signal }) => {
      // Reduced logging to prevent performance issues
      if (process.env.NODE_ENV === "development") {
        console.warn("useParameterDefinitions: queryFn start", {
          signalAborted: signal?.aborted ?? false,
        });
      }
      const result = await fetchParameterDefinitions({ signal });
      if (process.env.NODE_ENV === "development") {
        console.warn("useParameterDefinitions: queryFn success", {
          definitionCount: result.length,
        });
      }
      return result;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateSample() {
  const queryClient = useQueryClient();

  return useMutation<SampleListItem, Error, CreateSamplePayload>({
    mutationFn: (payload) => {
      // Reduced logging to prevent performance issues
      if (process.env.NODE_ENV === "development") {
        console.warn("useCreateSample: mutation invoked", {
          prepared_on: payload.prepared_on,
          author_name: payload.author_name,
        });
      }
      return createSample(payload);
    },
    onSuccess: (newSample) => {
      // Optimistically add the new sample to the cache
      queryClient.setQueriesData<SampleListItem[] | undefined>(
        { queryKey: SAMPLES_QUERY_KEY, exact: false },
        (previous) => (previous ? [...previous, newSample] : [newSample]),
      );
    },
    onError: (err) => {
      console.info("Failed to create sample", err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAMPLES_QUERY_KEY, exact: false });
    },
  });
}

export function useDeleteSample() {
  const queryClient = useQueryClient();

  return useMutation<SampleListItem, Error, number>({
    mutationFn: (sampleId) => {
      // Reduced logging to prevent performance issues
      if (process.env.NODE_ENV === "development") {
        console.warn("useDeleteSample: mutation invoked", { sampleId });
      }
      return deleteSample(sampleId);
    },
    onSuccess: (deletedSample) => {
      // Optimistically remove the deleted sample from the cache
      queryClient.setQueriesData<SampleListItem[] | undefined>(
        { queryKey: SAMPLES_QUERY_KEY, exact: false },
        (previous) =>
          previous?.filter((sample) => sample.sample_id !== deletedSample.sample_id) ?? previous,
      );
    },
    onError: (err) => {
      console.info("Failed to delete sample", err);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SAMPLES_QUERY_KEY, exact: false });
    },
  });
}

export function useParameterHistory(parameterName: string | null, limit: number = 25) {
  return useQuery<ParameterValueHistoryItem[], Error>({
    queryKey: ["parameter-history", parameterName, limit],
    queryFn: async ({ signal }) => {
      if (!parameterName) return [];
      return fetchParameterHistory(parameterName, limit, { signal });
    },
    enabled: !!parameterName,
    staleTime: 30_000,
  });
}

export function useLatestParameterValue(parameterName: string | null) {
  return useQuery<ParameterValueSuggestion | null, Error>({
    queryKey: ["parameter-latest", parameterName],
    queryFn: async ({ signal }) => {
      if (!parameterName) return null;
      return fetchLatestParameterValue(parameterName, { signal });
    },
    enabled: !!parameterName,
    staleTime: 30_000,
  });
}

export function useSampleParameterValues(sampleId: number | null) {
  return useQuery<SampleParameterValueItem[], Error>({
    queryKey: ["sample-parameters", sampleId],
    queryFn: async ({ signal }) => {
      if (!sampleId) return [];
      return getSampleParameterValues(sampleId, { signal });
    },
    enabled: !!sampleId,
    staleTime: 30_000,
  });
}

export function useParameterUniqueValues(parameterName: string | null) {
  return useQuery<string[], Error>({
    queryKey: ["parameter-unique-values", parameterName],
    queryFn: async ({ signal }) => {
      if (!parameterName) return [];
      return fetchParameterUniqueValues(parameterName, { signal });
    },
    enabled: !!parameterName,
    staleTime: 30_000,
  });
}

export function useAllParameterUniqueValues(parameterNames: string[]) {
  // Limit concurrency to prevent browser hangs with many parameters
  // Process in batches of 10 to avoid overwhelming the browser and API
  const BATCH_SIZE = 10;
  const [activeBatchIndex, setActiveBatchIndex] = useState(0);
  
  const batches = useMemo(() => {
    const result: string[][] = [];
    for (let i = 0; i < parameterNames.length; i += BATCH_SIZE) {
      result.push(parameterNames.slice(i, i + BATCH_SIZE));
    }
    return result;
  }, [parameterNames]);

  const allQueries = useQueries({
    queries: parameterNames.map((name, index) => {
      const batchIndex = Math.floor(index / BATCH_SIZE);
      return {
        queryKey: ["parameter-unique-values", name],
        queryFn: async ({ signal }: { signal?: AbortSignal }) => fetchParameterUniqueValues(name, { signal }),
        staleTime: 30_000,
        // Only enable queries for active batch and previous batches
        enabled: batchIndex <= activeBatchIndex,
      };
    }),
  });

  // Process batches sequentially - wait for current batch to complete before starting next
  // Use a ref to track query statuses to avoid infinite loops from allQueries dependency
  const queryStatusesRef = useRef<string>("");
  const currentStatuses = useMemo(
    () => allQueries.map(q => q.isSuccess || q.isError).join(','),
    [allQueries]
  );
  
  useEffect(() => {
    if (activeBatchIndex >= batches.length - 1) {
      return; // All batches processed
    }

    // Only proceed if statuses actually changed
    if (queryStatusesRef.current === currentStatuses) {
      return;
    }
    queryStatusesRef.current = currentStatuses;

    // Check if current batch queries are complete
    const currentBatchStart = activeBatchIndex * BATCH_SIZE;
    const currentBatchEnd = Math.min(currentBatchStart + BATCH_SIZE, parameterNames.length);
    const currentBatchQueries = allQueries.slice(currentBatchStart, currentBatchEnd);
    
    // Check if all queries in current batch are done (success or error)
    const allCurrentBatchDone = currentBatchQueries.every(
      (query) => query.isSuccess || query.isError
    );

    if (allCurrentBatchDone && activeBatchIndex < batches.length - 1) {
      // Small delay before starting next batch
      const timer = setTimeout(() => {
        setActiveBatchIndex((prev) => prev + 1);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeBatchIndex, batches.length, parameterNames.length, currentStatuses, allQueries]);

  return useMemo(() => {
    const aggregated: Record<string, string[]> = {};
    allQueries.forEach((query, index) => {
      const parameterName = parameterNames[index];
      aggregated[parameterName] = query.data ?? [];
    });
    return aggregated;
  }, [allQueries, parameterNames]);
}
