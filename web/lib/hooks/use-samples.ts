"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchParameterDefinitions,
  fetchSamples,
  type FetchOptions,
  type FetchSamplesParams,
  type ParameterDefinition,
  type SampleListItem,
  updateSampleParameters,
} from "../api";

const SAMPLES_QUERY_KEY = ["samples"] as const;
const PARAMETER_DEFINITIONS_KEY = ["parameter-definitions"] as const;

export function useSamplesQuery(params: FetchSamplesParams = {}) {
  return useQuery<SampleListItem[], Error>({
    queryKey: [...SAMPLES_QUERY_KEY, params.includeDeleted ?? false],
    queryFn: async ({ signal }) => {
      console.log("useSamplesQuery: queryFn start", {
        includeDeleted: params.includeDeleted ?? false,
        signalAborted: signal?.aborted ?? false,
      });
      const result = await fetchSamples(params, { signal });
      console.log("useSamplesQuery: queryFn success", {
        includeDeleted: params.includeDeleted ?? false,
        rowCount: result.length,
      });
      return result;
    },
    staleTime: 30_000,
  });
}

interface UpdateParametersInput {
  sampleId: number;
  parameters: Record<string, string>;
}

export function useUpdateSampleParameters() {
  const queryClient = useQueryClient();

  return useMutation<SampleListItem, Error, UpdateParametersInput>({
    mutationFn: ({ sampleId, parameters }) =>
      updateSampleParameters(sampleId, parameters),
    onSuccess: (updatedSample) => {
      queryClient.setQueriesData<SampleListItem[] | undefined>(
        { queryKey: SAMPLES_QUERY_KEY, exact: false },
        (previous) =>
          previous?.map((sample) =>
            sample.sample_id === updatedSample.sample_id ? updatedSample : sample,
          ) ?? previous,
      );
    },
  });
}

export function useParameterDefinitions() {
  return useQuery<ParameterDefinition[], Error>({
    queryKey: PARAMETER_DEFINITIONS_KEY,
    queryFn: async ({ signal }) => {
      console.log("useParameterDefinitions: queryFn start", {
        signalAborted: signal?.aborted ?? false,
      });
      const result = await fetchParameterDefinitions({ signal });
      console.log("useParameterDefinitions: queryFn success", {
        definitionCount: result.length,
      });
      return result;
    },
    staleTime: 5 * 60_000,
  });
}
