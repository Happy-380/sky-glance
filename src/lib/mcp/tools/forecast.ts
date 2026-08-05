import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const WMO: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

export default defineTool({
  name: "get_forecast",
  title: "Weather forecast",
  description:
    "Get the hourly (up to 48 hours) and daily (up to 10 days) forecast for a latitude/longitude, including temperature, precipitation probability and wind.",
  inputSchema: {
    lat: z.number().describe("Latitude."),
    lon: z.number().describe("Longitude."),
    hours: z.number().int().min(1).max(48).optional().describe("Hourly steps to return, default 24."),
    days: z.number().int().min(1).max(10).optional().describe("Days to return, default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ lat, lon, hours, days }) => {
    const nDays = days ?? 10;
    const nHours = hours ?? 24;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset` +
      `&forecast_days=${nDays}&timezone=auto&wind_speed_unit=ms`;

    const res = await fetch(url);
    if (!res.ok) {
      return { content: [{ type: "text", text: `Forecast request failed: ${res.status}` }], isError: true };
    }
    const d = (await res.json()) as any;

    const nowIso = new Date().toISOString().slice(0, 13);
    const allTimes: string[] = d.hourly?.time ?? [];
    let start = allTimes.findIndex((t) => t.slice(0, 13) >= nowIso);
    if (start < 0) start = 0;

    const hourly = allTimes.slice(start, start + nHours).map((time, i) => {
      const k = start + i;
      return {
        time,
        temperatureC: Math.round(d.hourly.temperature_2m[k]),
        precipitationProbability: d.hourly.precipitation_probability?.[k] ?? null,
        precipitationMm: d.hourly.precipitation?.[k] ?? null,
        windSpeedMs: d.hourly.wind_speed_10m?.[k] ?? null,
        windDirectionDeg: d.hourly.wind_direction_10m?.[k] ?? null,
        pressureHpa: d.hourly.surface_pressure?.[k] ?? null,
        condition: WMO[d.hourly.weather_code?.[k]] ?? "Unknown",
      };
    });

    const daily = (d.daily?.time ?? []).map((date: string, i: number) => ({
      date,
      highC: Math.round(d.daily.temperature_2m_max[i]),
      lowC: Math.round(d.daily.temperature_2m_min[i]),
      precipitationProbability: d.daily.precipitation_probability_max?.[i] ?? null,
      precipitationMm: d.daily.precipitation_sum?.[i] ?? null,
      windSpeedMaxMs: d.daily.wind_speed_10m_max?.[i] ?? null,
      sunrise: d.daily.sunrise?.[i] ?? null,
      sunset: d.daily.sunset?.[i] ?? null,
      condition: WMO[d.daily.weather_code?.[i]] ?? "Unknown",
    }));

    const result = { timezone: d.timezone, hourly, daily };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
