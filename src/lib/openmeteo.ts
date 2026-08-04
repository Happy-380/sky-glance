/**
 * OpenWeather's free plan only exposes 3-hourly / 5-day forecasts
 * (One Call 3.0, /forecast/hourly and /forecast/daily all return 401).
 * Open-Meteo is key-less and gives true 1-hour steps and 10-day dailies,
 * so we use it for the hourly + daily timelines and keep OpenWeather for
 * current conditions and air quality.
 */

export interface OMHour {
  dt: number;
  temp: number;
  pop: number; // 0..1
  precip: number; // mm
  wind: number;
  gust: number;
  windDeg: number;
  pressure: number;
  icon: string;
  description: string;
  code: number;
}

export interface OMDay {
  dt: number;
  min: number;
  max: number;
  pop: number;
  precip: number;
  windMax: number;
  windDeg: number;
  icon: string;
  description: string;
  code: number;
  sunrise: number;
  sunset: number;
}

export interface OMForecast {
  hourly: OMHour[];
  daily: OMDay[];
  utcOffset: number;
}

const WMO: Record<number, { d: string; n: string; zh: string; en: string }> = {
  0: { d: "01d", n: "01n", zh: "晴", en: "Clear sky" },
  1: { d: "01d", n: "01n", zh: "大致晴朗", en: "Mainly clear" },
  2: { d: "02d", n: "02n", zh: "局部多云", en: "Partly cloudy" },
  3: { d: "04d", n: "04n", zh: "阴", en: "Overcast" },
  45: { d: "50d", n: "50n", zh: "雾", en: "Fog" },
  48: { d: "50d", n: "50n", zh: "雾凇", en: "Rime fog" },
  51: { d: "09d", n: "09n", zh: "小毛毛雨", en: "Light drizzle" },
  53: { d: "09d", n: "09n", zh: "毛毛雨", en: "Drizzle" },
  55: { d: "09d", n: "09n", zh: "强毛毛雨", en: "Dense drizzle" },
  56: { d: "09d", n: "09n", zh: "冻毛毛雨", en: "Freezing drizzle" },
  57: { d: "09d", n: "09n", zh: "强冻毛毛雨", en: "Freezing drizzle" },
  61: { d: "10d", n: "10n", zh: "小雨", en: "Light rain" },
  63: { d: "10d", n: "10n", zh: "中雨", en: "Rain" },
  65: { d: "10d", n: "10n", zh: "大雨", en: "Heavy rain" },
  66: { d: "13d", n: "13n", zh: "冻雨", en: "Freezing rain" },
  67: { d: "13d", n: "13n", zh: "强冻雨", en: "Freezing rain" },
  71: { d: "13d", n: "13n", zh: "小雪", en: "Light snow" },
  73: { d: "13d", n: "13n", zh: "中雪", en: "Snow" },
  75: { d: "13d", n: "13n", zh: "大雪", en: "Heavy snow" },
  77: { d: "13d", n: "13n", zh: "雪粒", en: "Snow grains" },
  80: { d: "09d", n: "09n", zh: "阵雨", en: "Rain showers" },
  81: { d: "09d", n: "09n", zh: "强阵雨", en: "Rain showers" },
  82: { d: "09d", n: "09n", zh: "暴雨", en: "Violent showers" },
  85: { d: "13d", n: "13n", zh: "阵雪", en: "Snow showers" },
  86: { d: "13d", n: "13n", zh: "强阵雪", en: "Snow showers" },
  95: { d: "11d", n: "11n", zh: "雷暴", en: "Thunderstorm" },
  96: { d: "11d", n: "11n", zh: "雷暴伴冰雹", en: "Thunderstorm with hail" },
  99: { d: "11d", n: "11n", zh: "强雷暴伴冰雹", en: "Thunderstorm with hail" },
};

export function wmoInfo(code: number, night: boolean, lang: "zh" | "en") {
  const w = WMO[code] ?? WMO[3];
  return { icon: night ? w.n : w.d, description: lang === "zh" ? w.zh : w.en };
}

export async function getOpenMeteo(
  lat: number,
  lon: number,
  units: "metric" | "imperial",
  lang: "zh" | "en",
): Promise<OMForecast> {
  const tempUnit = units === "metric" ? "celsius" : "fahrenheit";
  const windUnit = units === "metric" ? "ms" : "mph";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset` +
    `&forecast_days=10&timeformat=unixtime&timezone=auto` +
    `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo failed: ${r.status}`);
  const d = (await r.json()) as any;

  const h = d.hourly;
  const hourly: OMHour[] = h.time.map((t: number, i: number) => {
    const code = h.weather_code[i] ?? 3;
    const info = wmoInfo(code, h.is_day[i] === 0, lang);
    return {
      dt: t,
      temp: h.temperature_2m[i] ?? 0,
      pop: (h.precipitation_probability?.[i] ?? 0) / 100,
      precip: h.precipitation?.[i] ?? 0,
      wind: h.wind_speed_10m[i] ?? 0,
      gust: h.wind_gusts_10m?.[i] ?? 0,
      windDeg: h.wind_direction_10m[i] ?? 0,
      pressure: h.surface_pressure?.[i] ?? 0,
      code,
      ...info,
    };
  });

  const dd = d.daily;
  const daily: OMDay[] = dd.time.map((t: number, i: number) => {
    const code = dd.weather_code[i] ?? 3;
    const info = wmoInfo(code, false, lang);
    return {
      dt: t,
      min: dd.temperature_2m_min[i],
      max: dd.temperature_2m_max[i],
      pop: (dd.precipitation_probability_max?.[i] ?? 0) / 100,
      precip: dd.precipitation_sum?.[i] ?? 0,
      windMax: dd.wind_speed_10m_max?.[i] ?? 0,
      windDeg: dd.wind_direction_10m_dominant?.[i] ?? 0,
      sunrise: dd.sunrise?.[i] ?? 0,
      sunset: dd.sunset?.[i] ?? 0,
      code,
      ...info,
    };
  });

  return { hourly, daily, utcOffset: d.utc_offset_seconds ?? 0 };
}
