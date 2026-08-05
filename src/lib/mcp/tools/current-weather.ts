import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

const OWM_KEY = "479acd7098622363f06e15507d279a12";

const AQI_LABEL = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];

export default defineTool({
  name: "get_current_weather",
  title: "Current weather",
  description:
    "Get current conditions (temperature, feels-like, wind, humidity, pressure, visibility, sunrise/sunset) and air quality for a latitude/longitude.",
  inputSchema: {
    lat: z.number().describe("Latitude."),
    lon: z.number().describe("Longitude."),
    lang: z.enum(["en", "zh"]).optional().describe("Language for the weather description, default en."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ lat, lon, lang }) => {
    const owmLang = lang === "zh" ? "zh_cn" : "en";
    const [wRes, aRes] = await Promise.all([
      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=${owmLang}&appid=${OWM_KEY}`,
      ),
      fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`,
      ),
    ]);
    if (!wRes.ok) {
      return { content: [{ type: "text", text: `Weather request failed: ${wRes.status}` }], isError: true };
    }
    const w = (await wRes.json()) as any;
    const air = aRes.ok ? ((await aRes.json()) as any) : null;
    const aqiIndex: number | undefined = air?.list?.[0]?.main?.aqi;

    const result = {
      location: w.name,
      country: w.sys?.country ?? null,
      temperatureC: Math.round(w.main.temp),
      feelsLikeC: Math.round(w.main.feels_like),
      description: w.weather?.[0]?.description ?? null,
      humidityPercent: w.main.humidity,
      pressureHpa: w.main.pressure,
      windSpeedMs: w.wind?.speed ?? null,
      windDirectionDeg: w.wind?.deg ?? null,
      visibilityKm: typeof w.visibility === "number" ? w.visibility / 1000 : null,
      cloudsPercent: w.clouds?.all ?? null,
      sunriseUtc: w.sys?.sunrise ? new Date(w.sys.sunrise * 1000).toISOString() : null,
      sunsetUtc: w.sys?.sunset ? new Date(w.sys.sunset * 1000).toISOString() : null,
      airQuality: aqiIndex
        ? { index: aqiIndex, label: AQI_LABEL[aqiIndex - 1] ?? null, components: air.list[0].components }
        : null,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
