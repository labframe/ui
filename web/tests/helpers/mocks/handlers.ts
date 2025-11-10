import { http, HttpResponse } from "msw";
import { SampleListItem } from "@/lib/api";
import { createMockSample } from "../fixtures/samples";

export const handlers = [
  // GET /api/samples
  http.get("/api/samples", ({ request }) => {
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("include_deleted") === "true";

    const samples: SampleListItem[] = [
      createMockSample({ sample_id: 1, code: "SAM-001" }),
      createMockSample({ sample_id: 2, code: "SAM-002" }),
      createMockSample({ sample_id: 3, code: "SAM-003" }),
    ];

    return HttpResponse.json(samples);
  }),

  // POST /api/samples/:id/parameters
  http.post("/api/samples/:id/parameters", async ({ params, request }) => {
    const sampleId = Number(params.id);
    const body = (await request.json()) as any;

    // Return updated sample
    const updatedSample = createMockSample({
      sample_id: sampleId,
      code: `SAM-${String(sampleId).padStart(3, "0")}`,
      parameters: body.parameters.reduce(
        (acc: Record<string, string>, param: any) => {
          acc[param.name] = param.value;
          return acc;
        },
        {},
      ),
    });

    return HttpResponse.json({ sample: updatedSample });
  }),

  // GET /api/parameters/definitions
  http.get("/api/parameters/definitions", () => {
    return HttpResponse.json([
      {
        name: "temperature",
        group_name: "Physical",
        data_type: "float",
        mode: "optional",
      },
      {
        name: "pressure",
        group_name: "Physical",
        data_type: "float",
        mode: "optional",
      },
      {
        name: "ph",
        group_name: "Chemical",
        data_type: "float",
        mode: "optional",
      },
    ]);
  }),
];
