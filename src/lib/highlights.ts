import type { ForecastItem } from "@/lib/weather";
import type { Lang } from "@/lib/i18n";

export type Highlight = {
  kind: "rain" | "storm" | "snow" | "heat" | "cold" | "wind" | "drop" | "clear";
  text: string;
};

function dayLabel(unix: number, tz: number, lang: Lang, nowUnix: number) {
  const dayIdx = Math.floor((unix + tz) / 86400) - Math.floor((nowUnix + tz) / 86400);
  const DAYS = {
    zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  } as const;
  if (dayIdx <= 0) return lang === "zh" ? "今天" : "today";
  if (dayIdx === 1) return lang === "zh" ? "明天" : "tomorrow";
  const d = new Date((unix + tz) * 1000);
  const name = DAYS[lang][d.getUTCDay()];
  return lang === "zh" ? name : `on ${name}`;
}

/** Detect notable weather events in the coming days from the 3-hourly forecast. */
export function buildHighlights(
  list: ForecastItem[],
  tz: number,
  nowUnix: number,
  lang: Lang,
  units: "metric" | "imperial",
): Highlight[] {
  if (!list.length) return [];
  const zh = lang === "zh";
  const out: Highlight[] = [];
  const L = (u: number) => dayLabel(u, tz, lang, nowUnix);
  const windUnit = units === "metric" ? (zh ? "米/秒" : "m/s") : "mph";
  const hotLimit = units === "metric" ? 35 : 95;
  const coldLimit = units === "metric" ? 0 : 32;
  const windLimit = units === "metric" ? 10.8 : 24;

  const storm = list.find((i) => i.weather[0].id >= 200 && i.weather[0].id < 300);
  if (storm)
    out.push({
      kind: "storm",
      text: zh
        ? `${L(storm.dt)}可能出现雷暴天气，注意防范。`
        : `Thunderstorms expected ${L(storm.dt)}.`,
    });

  const snow = list.find((i) => i.weather[0].id >= 600 && i.weather[0].id < 700);
  if (snow)
    out.push({
      kind: "snow",
      text: zh ? `${L(snow.dt)}有降雪。` : `Snow expected ${L(snow.dt)}.`,
    });

  const rain = list.find((i) => (i.pop ?? 0) >= 0.5 && i.weather[0].id >= 300 && i.weather[0].id < 600);
  if (rain && !storm)
    out.push({
      kind: "rain",
      text: zh
        ? `${L(rain.dt)}有较大概率降雨（${Math.round((rain.pop ?? 0) * 100)}%），记得带伞。`
        : `Rain likely ${L(rain.dt)} (${Math.round((rain.pop ?? 0) * 100)}% chance).`,
    });

  const hot = list.reduce<ForecastItem | null>(
    (a, b) => (!a || b.main.temp_max > a.main.temp_max ? b : a),
    null,
  );
  if (hot && hot.main.temp_max >= hotLimit)
    out.push({
      kind: "heat",
      text: zh
        ? `${L(hot.dt)}最高气温可达 ${Math.round(hot.main.temp_max)}°，注意防暑。`
        : `Highs reach ${Math.round(hot.main.temp_max)}° ${L(hot.dt)} — stay cool.`,
    });

  const cold = list.reduce<ForecastItem | null>(
    (a, b) => (!a || b.main.temp_min < a.main.temp_min ? b : a),
    null,
  );
  if (cold && cold.main.temp_min <= coldLimit)
    out.push({
      kind: "cold",
      text: zh
        ? `${L(cold.dt)}最低气温 ${Math.round(cold.main.temp_min)}°，注意保暖。`
        : `Lows near ${Math.round(cold.main.temp_min)}° ${L(cold.dt)} — bundle up.`,
    });

  const windy = list.find((i) => i.wind.speed >= windLimit);
  if (windy)
    out.push({
      kind: "wind",
      text: zh
        ? `${L(windy.dt)}风力较大，最高 ${windy.wind.speed.toFixed(0)} ${windUnit}。`
        : `Strong winds ${L(windy.dt)}, up to ${windy.wind.speed.toFixed(0)} ${windUnit}.`,
    });

  // Sharp temperature drop between consecutive days
  const byDay = new Map<number, number[]>();
  for (const i of list) {
    const k = Math.floor((i.dt + tz) / 86400);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(i.main.temp_max);
  }
  const days = [...byDay.entries()].map(([k, v]) => ({ k, max: Math.max(...v) }));
  for (let i = 1; i < days.length; i++) {
    const delta = days[i].max - days[i - 1].max;
    if (delta <= -6) {
      const unix = days[i].k * 86400 - tz + 43200;
      out.push({
        kind: "drop",
        text: zh
          ? `${L(unix)}气温骤降约 ${Math.abs(Math.round(delta))}°，注意添衣。`
          : `Temperature drops about ${Math.abs(Math.round(delta))}° ${L(unix)}.`,
      });
      break;
    }
  }

  if (!out.length)
    out.push({
      kind: "clear",
      text: zh ? "未来一周内没有明显的天气变化。" : "No significant weather expected this week.",
    });

  return out.slice(0, 4);
}
