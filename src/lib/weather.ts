export const OWM_KEY = "479acd7098622363f06e15507d279a12";
const BASE = "https://api.openweathermap.org";

export interface GeoCity {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

export interface CurrentWeather {
  name: string;
  dt: number;
  timezone: number;
  sys: { country: string; sunrise: number; sunset: number };
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    humidity: number;
    pressure: number;
  };
  weather: { id: number; main: string; description: string; icon: string }[];
  wind: { speed: number; deg: number };
  visibility: number;
  clouds: { all: number };
  coord: { lat: number; lon: number };
}

export interface ForecastItem {
  dt: number;
  main: { temp: number; temp_min: number; temp_max: number; humidity: number; pressure?: number };
  weather: { id: number; main: string; description: string; icon: string }[];
  wind: { speed: number };
  pop: number;
  dt_txt: string;
}

export interface ForecastResponse {
  list: ForecastItem[];
  city: { name: string; country: string; timezone: number; sunrise: number; sunset: number };
}

export interface AirPollution {
  list: {
    main: { aqi: number };
    components: Record<string, number>;
  }[];
}

async function j<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  return r.json() as Promise<T>;
}

export function geocode(query: string) {
  return j<GeoCity[]>(
    `${BASE}/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=5&appid=${OWM_KEY}`,
  );
}

export function reverseGeocode(lat: number, lon: number) {
  return j<GeoCity[]>(
    `${BASE}/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OWM_KEY}`,
  );
}

export function getCurrent(lat: number, lon: number, units: "metric" | "imperial" = "metric", lang = "en") {
  return j<CurrentWeather>(
    `${BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&lang=${lang}&appid=${OWM_KEY}`,
  );
}

export function getForecast(lat: number, lon: number, units: "metric" | "imperial" = "metric", lang = "en") {
  return j<ForecastResponse>(
    `${BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&lang=${lang}&appid=${OWM_KEY}`,
  );
}

export function getAir(lat: number, lon: number) {
  return j<AirPollution>(
    `${BASE}/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`,
  );
}

/* ─── Local weather icons (bundled assets, not OWM remote URLs) ─── */
import wClear from "@/assets/images/clear.png";
import wClearNight from "@/assets/images/clear-night.png";
import wPartlyCloudy from "@/assets/images/partlycloudy.png";
import wPartlyCloudyNight from "@/assets/images/partlycloudy-night.png";
import wCloudy from "@/assets/images/cloudy.png";
import wCloud from "@/assets/images/cloud.png";
import wDrizzle from "@/assets/images/drizzle.png";
import wDrizzleNight from "@/assets/images/drizzle-night.png";
import wRain from "@/assets/images/rain.png";
import wHeavyRain from "@/assets/images/heavyrain.png";
import wFreezingRain from "@/assets/images/freezingrain.png";
import wThunderstorm from "@/assets/images/thunderstorm.png";
import wSnow from "@/assets/images/snow.png";
import wHeavySnow from "@/assets/images/heavysnow.png";
import wMist from "@/assets/images/mist.png";
import wFog from "@/assets/images/fog.png";
import wHaze from "@/assets/images/haze.png";
import wWindy from "@/assets/images/windy.png";

/* Fallback to a generic cloudy icon if we don't have a specific variant. */
const DEFAULT_ICON = wCloud;

/* OpenWeather "id" groups → our bundled asset.
   We prefer ID-based mapping because it covers all OWM codes cleanly and
   does not depend on the exact 3-char icon suffix string (which varies). */
function assetForId(id: number, night = false): string {
  // Thunderstorm 2xx
  if (id >= 200 && id < 300) return wThunderstorm;
  // Drizzle 3xx
  if (id >= 300 && id < 400) return night ? wDrizzleNight : wDrizzle;
  // Rain 5xx
  if (id >= 500 && id < 600) {
    if (id === 511) return wFreezingRain;
    if (id >= 502 && id <= 504) return wHeavyRain;
    if (id >= 520) return wHeavyRain;
    return wRain;
  }
  // Snow 6xx
  if (id >= 600 && id < 700) {
    if (id >= 602 && id <= 622) return wHeavySnow;
    return wSnow;
  }
  // Atmosphere 7xx
  if (id >= 700 && id < 800) {
    switch (id) {
      case 701: return wMist;
      case 711: return wHaze; // smoke → haze
      case 721: return wHaze;
      case 731: return wHaze; // sand/dust → haze
      case 741: return wFog;
      case 751: return wHaze;
      case 761: return wHaze; // dust
      case 762: return wHaze; // ash
      case 771: return wWindy; // squalls
      case 781: return wThunderstorm; // tornado
      default: return wHaze;
    }
  }
  // Clear 800
  if (id === 800) return night ? wClearNight : wClear;
  // Clouds 801-804
  if (id === 801) return night ? wPartlyCloudyNight : wPartlyCloudy; // 11-25%
  if (id === 802) return night ? wPartlyCloudyNight : wPartlyCloudy; // scattered 25-50%
  if (id === 803) return wCloudy; // broken 51-84%
  if (id === 804) return wCloud;   // overcast 85-100%
  return DEFAULT_ICON;
}

/* Detect "night" from the OWM icon suffix: code ending in `n` means night. */
function isNightIcon(icon: string) {
  return icon.endsWith("n");
}

/**
 * Pick the bundled local weather image for an OpenWeather condition.
 * Accepts the numeric weather `id` plus the optional `icon` string so it can
 * correctly distinguish day vs. night variants.
 *
 * Previously we returned a remote URL via `iconUrl()`. This now gives back
 * the bundled asset path (Vite-processed import), which works offline,
 * matches the custom Apple-style assets, and loads instantly.
 */
export function weatherImage(id?: number, icon = ""): string {
  if (!id) return DEFAULT_ICON;
  return assetForId(id, isNightIcon(icon));
}

/**
 * Kept for backwards compatibility with places that only have an `icon`
 * string handy and no `id` nearby. Maps icon codes → asset path.
 *
 * OWM icon codes:
 *   01 = clear, 02 = few, 03 = scattered, 04 = broken/overcast,
 *   09 = shower, 10 = rain, 11 = thunderstorm, 13 = snow, 50 = mist
 * suffix d = day, n = night
 */
export function weatherImageFromIcon(icon: string): string {
  if (!icon) return DEFAULT_ICON;
  const night = isNightIcon(icon);
  const code = icon.slice(0, 2);
  switch (code) {
    case "01": return night ? wClearNight : wClear;
    case "02": return night ? wPartlyCloudyNight : wPartlyCloudy;
    case "03": return night ? wPartlyCloudyNight : wPartlyCloudy;
    case "04": return wCloud;
    case "09": return wHeavyRain;
    case "10": return night ? wDrizzleNight : wRain;
    case "11": return wThunderstorm;
    case "13": return wSnow;
    case "50": return wMist;
    default:   return DEFAULT_ICON;
  }
}

export function iconUrl(icon: string, big = false) {
  return `https://openweathermap.org/img/wn/${icon}${big ? "@4x" : "@2x"}.png`;
}

export function aqiLabel(aqi: number) {
  return ["—", "Good", "Fair", "Moderate", "Poor", "Very Poor"][aqi] ?? "—";
}

export function degToCompass(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function formatTime(unix: number, tzOffset: number) {
  const d = new Date((unix + tzOffset) * 1000);
  return d.toUTCString().slice(17, 22);
}

export function formatHour(unix: number, tzOffset: number) {
  const d = new Date((unix + tzOffset) * 1000);
  const h = d.getUTCHours();
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr} ${ampm}`;
}

export function formatDay(unix: number, tzOffset: number) {
  const d = new Date((unix + tzOffset) * 1000);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
}

export interface DailySummary {
  dt: number;
  min: number;
  max: number;
  icon: string;
  description: string;
  pop: number;
}

export function summarizeDaily(list: ForecastItem[], tzOffset: number): DailySummary[] {
  const groups = new Map<string, ForecastItem[]>();
  for (const it of list) {
    const d = new Date((it.dt + tzOffset) * 1000);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const out: DailySummary[] = [];
  for (const [, items] of groups) {
    const min = Math.min(...items.map((i) => i.main.temp_min));
    const max = Math.max(...items.map((i) => i.main.temp_max));
    const pop = Math.max(...items.map((i) => i.pop ?? 0));
    const mid = items[Math.floor(items.length / 2)];
    out.push({
      dt: items[0].dt,
      min,
      max,
      icon: mid.weather[0].icon,
      description: mid.weather[0].description,
      pop,
    });
  }
  return out.slice(0, 7);
}
