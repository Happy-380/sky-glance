import { defineMcp } from "@lovable.dev/mcp-js";

import currentWeatherTool from "./tools/current-weather";
import forecastTool from "./tools/forecast";
import searchCityTool from "./tools/search-city";

export default defineMcp({
  name: "sky-glance",
  title: "Sky Glance",
  version: "0.1.0",
  instructions:
    "Weather tools for Sky Glance. Use `search_city` to resolve a place name to coordinates, then `get_current_weather` for current conditions and air quality, and `get_forecast` for hourly (48h) and daily (10-day) forecasts. All temperatures are Celsius and wind speeds are m/s.",
  tools: [searchCityTool, currentWeatherTool, forecastTool],
});
