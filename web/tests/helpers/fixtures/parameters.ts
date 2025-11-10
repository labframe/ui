import { ParameterDefinition } from "@/lib/api";

/**
 * Creates a mock parameter definition with default values.
 */
export function createMockParameterDefinition(
  overrides: Partial<ParameterDefinition> = {},
): ParameterDefinition {
  const defaults: ParameterDefinition = {
    name: "temperature",
    group_name: "Physical",
    data_type: "float",
    mode: "optional",
  };

  return { ...defaults, ...overrides };
}

/**
 * Creates multiple parameter definitions for common test scenarios.
 */
export function createMockParameterDefinitions(): ParameterDefinition[] {
  return [
    createMockParameterDefinition({
      name: "temperature",
      group_name: "Physical",
      data_type: "float",
    }),
    createMockParameterDefinition({
      name: "pressure",
      group_name: "Physical",
      data_type: "float",
    }),
    createMockParameterDefinition({
      name: "ph",
      group_name: "Chemical",
      data_type: "float",
    }),
    createMockParameterDefinition({
      name: "concentration",
      group_name: "Chemical",
      data_type: "float",
    }),
    createMockParameterDefinition({
      name: "status",
      group_name: "Metadata",
      data_type: "string",
    }),
  ];
}
