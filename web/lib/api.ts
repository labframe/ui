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
  timeout?: number; // Timeout in milliseconds (default: 30000)
}

// Helper to create a fetch with timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeout = options.timeout ?? 30000; // 30 seconds default
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Merge abort signals if both exist
    const signal = options.signal
      ? (() => {
          const combinedController = new AbortController();
          options.signal?.addEventListener("abort", () => combinedController.abort());
          controller.signal.addEventListener("abort", () => combinedController.abort());
          return combinedController.signal;
        })()
      : controller.signal;

    const response = await fetch(url, {
      ...options,
      signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

export async function fetchSamples(
  params: FetchSamplesParams = {},
  options: FetchOptions = {},
): Promise<SampleListItem[]> {
  // Reduced logging to prevent performance issues - only log in development
  if (process.env.NODE_ENV === "development") {
    console.log("fetchSamples: requesting samples", {
      includeDeleted: params.includeDeleted ?? false,
      environment: typeof window === "undefined" ? "server" : "browser",
    });
  }
  const query = new URLSearchParams();

  if (params.includeDeleted) {
    query.set("include_deleted", "true");
  }

  const queryString = query.size ? `?${query.toString()}` : "";
  const response = await fetchWithTimeout(`/api/samples${queryString}`, {
    headers: {
      "Accept": "application/json",
    },
    cache: "no-store",
    signal: options.signal,
    timeout: options.timeout,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as SampleListItem[];
  if (process.env.NODE_ENV === "development") {
    console.log("fetchSamples: received samples", {
      includeDeleted: params.includeDeleted ?? false,
      count: payload.length,
      environment: typeof window === "undefined" ? "server" : "browser",
    });
  }
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

export interface SampleParameterValueItem {
  name: string;
  value_text?: string;
  value_num?: number;
  value_bool?: boolean;
  value_date?: string;
  unit_symbol?: string | null;
  value_type?: string;
}

export async function getSampleParameterValues(
  sampleId: number,
  options: FetchOptions = {},
): Promise<SampleParameterValueItem[]> {
  const response = await fetch(`/api/samples/${sampleId}/parameters`, {
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

  return (await response.json()) as SampleParameterValueItem[];
}

export async function updateSampleParameters(
  sampleId: number,
  assignments: SampleParameterAssignment[],
): Promise<SampleListItem> {
  const payload = {
    parameters: assignments.map((assignment) => {
      const entry: Record<string, unknown> = {
        name: assignment.name,
      };
      if (assignment.value !== null && assignment.value !== undefined) {
        entry.value = assignment.value;
      }
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

export interface CreateSamplePayload {
  prepared_on: string; // ISO date string (YYYY-MM-DD)
  author_name: string | null;
  template_sample_id?: number | null;
  copy_parameters?: boolean;
}

interface CreateSampleResponse {
  sample: SampleListItem;
  copied_parameters: number;
  warnings: string[];
}

export async function createSample(payload: CreateSamplePayload): Promise<SampleListItem> {
  const response = await fetch("/api/samples", {
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

  const data = (await response.json()) as CreateSampleResponse;
  return data.sample;
}

interface DeleteSampleResponse {
  sample: SampleListItem;
}

export async function deleteSample(sampleId: number): Promise<SampleListItem> {
  const response = await fetch(`/api/samples/${sampleId}`, {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const data = (await response.json()) as DeleteSampleResponse;
  return data.sample;
}

export async function fetchParameterDefinitions(
  options: FetchOptions = {},
): Promise<ParameterDefinition[]> {
  // Reduced logging to prevent performance issues - only log in development
  if (process.env.NODE_ENV === "development") {
    console.log("fetchParameterDefinitions: requesting definitions", {
      environment: typeof window === "undefined" ? "server" : "browser",
    });
  }
  const response = await fetchWithTimeout("/api/parameters/definitions", {
    headers: {
      "Accept": "application/json",
    },
    cache: "force-cache",
    signal: options.signal,
    timeout: options.timeout ?? 15000, // 15 seconds for parameter definitions
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as ParameterDefinition[];
  if (process.env.NODE_ENV === "development") {
    console.log("fetchParameterDefinitions: received definitions", {
      count: payload.length,
      environment: typeof window === "undefined" ? "server" : "browser",
    });
  }
  return payload;
}

export interface ParameterValueHistoryItem {
  value_text?: string;
  value_num?: number;
  value_bool?: boolean;
  value_date?: string;
  unit_symbol?: string | null;
  value_type?: string;
}

export interface ParameterValueSuggestion {
  value_text?: string;
  value_num?: number;
  value_bool?: boolean;
  value_date?: string;
  unit_symbol?: string | null;
  value_type?: string;
}

export async function fetchParameterHistory(
  parameterName: string,
  limit: number = 25,
  options: FetchOptions = {},
): Promise<ParameterValueHistoryItem[]> {
  const response = await fetch(`/api/parameters/${encodeURIComponent(parameterName)}/history?limit=${limit}`, {
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

  return (await response.json()) as ParameterValueHistoryItem[];
}

export async function fetchLatestParameterValue(
  parameterName: string,
  options: FetchOptions = {},
): Promise<ParameterValueSuggestion | null> {
  // Get the latest value from history with limit=1
  const history = await fetchParameterHistory(parameterName, 1, options);
  if (history.length === 0) {
    return null;
  }
  
  const latest = history[0];
  return {
    value_text: latest.value_text,
    value_num: latest.value_num,
    value_bool: latest.value_bool,
    value_date: latest.value_date,
    unit_symbol: latest.unit_symbol,
    value_type: latest.value_type,
  };
}

export async function fetchParameterUniqueValues(
  parameterName: string,
  options: FetchOptions = {},
): Promise<string[]> {
  const response = await fetchWithTimeout(`/api/parameters/${encodeURIComponent(parameterName)}/values`, {
    headers: {
      "Accept": "application/json",
    },
    cache: "no-store",
    signal: options.signal,
    timeout: options.timeout ?? 10000, // 10 seconds for parameter values
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as string[];
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

// Project management
export interface Project {
  name: string;
  db_path: string;
  is_active?: boolean;
  created_at?: string | null;
  created_by?: string | null;
  last_opened?: string | null;
  last_modified?: string | null;
}

export interface ProjectStats {
  sample_count: number;
  parameter_definitions_count: number;
  parameters_with_values_count: number;
  parameters_without_values_count: number;
  run_count: number;
  data_points_count: number;
  people_involved: number;
  institutes: string[];
  responsible_persons: string[];
  project_stage: string;
  database_health: string;
  last_modified: string | null;
}

export interface ProjectDetails extends Project {
  stats: ProjectStats;
}

export async function fetchProjects(
  options: FetchOptions = {},
): Promise<Project[]> {
  const response = await fetch("/api/projects", {
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

  return (await response.json()) as Project[];
}

export async function getActiveProject(
  options: FetchOptions = {},
): Promise<Project | null> {
  const response = await fetch("/api/projects/active", {
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

  const project = (await response.json()) as Project | null;
  return project;
}

export interface CreateProjectPayload {
  name: string;
}

export async function createProject(payload: CreateProjectPayload): Promise<Project> {
  const response = await fetch("/api/projects", {
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

  return (await response.json()) as Project;
}

export interface SetActiveProjectPayload {
  project_name: string | null;
}

export async function setActiveProject(
  payload: SetActiveProjectPayload,
): Promise<void> {
  const response = await fetch("/api/projects/active", {
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
  // Note: last_opened is updated automatically by the backend
}

export interface CreateProjectWithTemplatePayload {
  name: string;
  template_project_name?: string | null;
  clone_groups?: boolean;
  clone_parameters?: boolean;
  clone_values?: boolean;
}

export async function createProjectWithTemplate(
  payload: CreateProjectWithTemplatePayload,
): Promise<Project> {
  const response = await fetch("/api/projects/with-template", {
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

  return (await response.json()) as Project;
}

export async function fetchProjectDetails(
  options: FetchOptions = {},
): Promise<ProjectDetails[]> {
  const response = await fetch("/api/projects/details", {
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

  return (await response.json()) as ProjectDetails[];
}

export async function fetchProjectStats(
  projectName: string,
  options: FetchOptions = {},
): Promise<ProjectStats> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}/stats`, {
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

  return (await response.json()) as ProjectStats;
}

export interface RenameProjectPayload {
  name: string;
}

export async function renameProject(
  projectName: string,
  newName: string,
): Promise<Project> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}`, {
    method: "PATCH",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newName } as RenameProjectPayload),
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }

  return (await response.json()) as Project;
}

export async function deleteProject(projectName: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectName)}`, {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message);
  }
}
