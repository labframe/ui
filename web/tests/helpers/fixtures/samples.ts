import { SampleListItem } from "@/lib/api";

/**
 * Creates a mock sample with default values that can be overridden.
 * Provides deterministic test data for consistent test behavior.
 */
export function createMockSample(
  overrides: Partial<SampleListItem> = {},
): SampleListItem {
  const defaults: SampleListItem = {
    sample_id: 1,
    code: "SAM-001",
    author_code: "AUTH-001",
    author_name: "Test Author",
    dept_code: "DEPT-001",
    prepared_on: "2025-10-15",
    sequence_number: 1,
    parameters: {
      temperature: "25.0",
      pressure: "1.0",
    },
    description: "Test sample description",
  };

  return { ...defaults, ...overrides };
}

/**
 * Creates multiple mock samples with sequential IDs.
 */
export function createMockSamples(count: number): SampleListItem[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSample({
      sample_id: i + 1,
      code: `SAM-${String(i + 1).padStart(3, "0")}`,
      sequence_number: i + 1,
    }),
  );
}

/**
 * Creates a mock sample with specific parameter values.
 */
export function createMockSampleWithParameters(
  parameters: Record<string, string>,
  overrides: Partial<SampleListItem> = {},
): SampleListItem {
  return createMockSample({
    ...overrides,
    parameters,
  });
}

/**
 * Creates a mock sample without optional fields.
 */
export function createMinimalMockSample(
  overrides: Partial<SampleListItem> = {},
): SampleListItem {
  return createMockSample({
    code: null,
    author_code: null,
    author_name: null,
    dept_code: null,
    description: null,
    parameters: {},
    ...overrides,
  });
}
