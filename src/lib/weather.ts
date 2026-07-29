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
  main: { temp: number; temp_min: number; temp_max: number; humidity: number };
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
