import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const OWM_KEY = "479acd7098622363f06e15507d279a12";

export default defineTool({
  name: "search_city",
  title: "Search city",
  description:
    "Search for cities by name and return their coordinates, country and state. Use the returned lat/lon with the forecast tools.",
  inputSchema: {
    query: z.string().min(1).describe("City name, e.g. 'Hangzhou' or '杭州'."),
    limit: z.number().int().min(1).max(5).optional().describe("Max results, default 5."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }) => {
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=${limit ?? 5}&appid=${OWM_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { content: [{ type: "text", text: `Geocoding failed: ${res.status}` }], isError: true };
    }
    const raw = (await res.json()) as Array<{
      name: string;
      lat: number;
      lon: number;
      country: string;
      state?: string;
      local_names?: Record<string, string>;
    }>;
    const cities = raw.map((c) => ({
      name: c.name,
      localName: c.local_names?.["zh"] ?? c.name,
      lat: c.lat,
      lon: c.lon,
      country: c.country,
      state: c.state ?? null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(cities, null, 2) }],
      structuredContent: { cities },
    };
  },
});
