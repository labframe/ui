export interface SampleListItem {
  sample_id: number;
  code: string | null;
  author_code: string | null;
  author_name: string | null;
  dept_code: string | null;
  prepared_on: string;
  sequence_number: number;
  parameters: Record<string, string>;
  description: string | null;
}

export interface FetchSamplesParams {
  includeDeleted?: boolean;
}

export interface ParameterDefinition {
  name: string;
  group_name: string;
  data_type: string;
  mode: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
}

export async function fetchSamples(
  params: FetchSamplesParams = {},
  options: FetchOptions = {},
): Promise<SampleListItem[]> {
  console.log("fetchSamples: requesting samples", {
    includeDeleted: params.includeDeleted ?? false,
    environment: typeof window === "undefined" ? "server" : "browser",
  });
  const query = new URLSearchParams();

  if (params.includeDeleted) {
    query.set("include_deleted", "true");
  }

  const queryString = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`/api/samples${queryString}`, {
    headers: {
      "Accept": "application/json",
    },
    cache: "no-store",
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as SampleListItem[];
  console.log("fetchSamples: received samples", {
    includeDeleted: params.includeDeleted ?? false,
    count: payload.length,
    environment: typeof window === "undefined" ? "server" : "browser",
  });
  return payload;
}

export interface SampleParameterAssignment {
  name: string;
  value: string | number | boolean;
  unitSymbol?: string | null;
}

export interface UpdateSampleParametersArgs {
  sampleId: number;
  assignments: SampleParameterAssignment[];
}

interface RecordParametersResponse {
  sample: SampleListItem;
}

export async function updateSampleParameters(
  sampleId: number,
  assignments: SampleParameterAssignment[],
): Promise<SampleListItem> {
  const payload = {
    parameters: assignments.map((assignment) => {
      const entry: Record<string, unknown> = {
        name: assignment.name,
        value: assignment.value,
      };
      if (assignment.unitSymbol != null) {
        entry.unit_symbol = assignment.unitSymbol;
      }
      return entry;
    }),
  };

  const response = await fetch(`/api/samples/${sampleId}/parameters`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const data = (await response.json()) as RecordParametersResponse;
  return data.sample;
}

export async function fetchParameterDefinitions(
  options: FetchOptions = {},
): Promise<ParameterDefinition[]> {
  console.log("fetchParameterDefinitions: requesting definitions", {
    environment: typeof window === "undefined" ? "server" : "browser",
  });
  const response = await fetch("/api/parameters/definitions", {
    headers: {
      "Accept": "application/json",
    },
    cache: "force-cache",
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as ParameterDefinition[];
  console.log("fetchParameterDefinitions: received definitions", {
    count: payload.length,
    environment: typeof window === "undefined" ? "server" : "browser",
  });
  return payload;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parsing errors and fall back to status text.
  }
  return `${response.status} ${response.statusText}`;
}
