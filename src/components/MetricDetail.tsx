import { useEffect, useMemo, useState } from "react";
import {
  X, Cloud, Sun, Wind as WindIcon, Droplet, Droplets, Eye, Gauge,
  Sunrise as SunriseIcon, ChevronDown, Check, Navigation,
} from "lucide-react";
import type { OMDay, OMHour } from "@/lib/openmeteo";
import type { CurrentWeather } from "@/lib/weather";
import { degToCompass, iconUrl } from "@/lib/weather";
import { formatTimeL, type Lang } from "@/lib/i18n";

type T = ReturnType<typeof import("@/lib/i18n").makeT>;

export type MetricKey =
  | "conditions" | "uv" | "wind" | "precip"
  | "humidity" | "visibility" | "pressure" | "sun" | "aqi";

const HOUR = 3600;

function localParts(unix: number, tz: number) {
  const d = new Date((unix + tz) * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    hour: d.getUTCHours(),
  };
}

function dayKey(unix: number, tz: number) {
  const p = localParts(unix, tz);
  return `${p.y}-${p.m}-${p.day}`;
}

/* ---------------- chart ---------------- */

function Chart({
  points, color, min, max, format, area = true, bars = false, bands,
}: {
  points: { h: number; v: number }[];
  color: string;
  min: number;
  max: number;
  format: (v: number) => string;
  area?: boolean;
  bars?: boolean;
  bands?: { at: number; label: string }[];
}) {
  const W = 320;
  const H = 150;
  const span = max - min || 1;
  const x = (h: number) => (h / 23) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const id = useMemo(() => `g${Math.random().toString(36).slice(2)}`, []);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.h).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const fill = `${line} L${W} ${H} L0 ${H} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + span * f).reverse();

  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[150px] w-full">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.55" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          ))}
          {[6, 12, 18].map((h) => (
            <line key={h} x1={x(h)} y1="0" x2={x(h)} y2={H} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3 4" />
          ))}
          {bars
            ? points.map((p) => (
                <rect
                  key={p.h}
                  x={x(p.h) - 5}
                  y={y(p.v)}
                  width="10"
                  height={Math.max(H - y(p.v), 0)}
                  fill={color}
                  opacity="0.75"
                  rx="2"
                />
              ))
            : (
              <>
                {area && <path d={fill} fill={`url(#${id})`} />}
                <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </>
            )}
        </svg>
        {bands && (
          <div className="pointer-events-none absolute inset-0">
            {bands.map((b) => (
              <span
                key={b.label}
                className="absolute left-1 text-[10px] text-white/50"
                style={{ top: `${(1 - (b.at - min) / span) * 100}%` }}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-between text-[10px] text-white/50">
          <span>0</span><span>6</span><span>12</span><span>18</span><span>24</span>
        </div>
      </div>
      <div className="flex w-12 shrink-0 flex-col justify-between py-0 text-right text-[10px] tabular-nums text-white/55">
        {ticks.map((t, i) => <span key={i}>{format(t)}</span>)}
      </div>
    </div>
  );
}

/* ---------------- modal ---------------- */

export function MetricDetail({
  metric, onClose, hours, days, tz, lang, T, units, cur, air,
}: {
  metric: MetricKey;
  onClose: () => void;
  hours: OMHour[];
  days: (OMDay & { dt: number })[];
  tz: number;
  lang: Lang;
  T: T;
  units: "metric" | "imperial";
  cur: CurrentWeather;
  air?: { aqi: number; pm2_5: number; pm10: number; o3: number };
}) {
  const [key, setKey] = useState<MetricKey>(metric);
  const [dayIdx, setDayIdx] = useState(0);
  const [tempTab, setTempTab] = useState<"actual" | "feels">("actual");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setKey(metric); setDayIdx(0); }, [metric]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const windUnit = units === "metric" ? (lang === "zh" ? "米/秒" : "m/s") : "mph";
  const day = days[dayIdx];
  const dayHours = useMemo(() => {
    if (!day) return [];
    const k = dayKey(day.dt, tz);
    const list = hours.filter((h) => dayKey(h.dt, tz) === k);
    return list.length ? list : hours.slice(0, 24);
  }, [hours, day, tz]);

  const pts = (get: (h: OMHour) => number) =>
    dayHours.map((h) => ({ h: localParts(h.dt, tz).hour, v: get(h) }));

  const dateLabel = day
    ? (() => {
        const p = localParts(day.dt, tz);
        return lang === "zh"
          ? `${p.y}年${p.m}月${p.day}日 ${T.day(p.dow)}`
          : `${T.day(p.dow)}, ${p.m}/${p.day}/${p.y}`;
      })()
    : "";

  const metrics: { k: MetricKey; icon: React.ReactNode; label: string }[] = [
    { k: "conditions", icon: <Cloud className="h-4 w-4" />, label: T.t("conditions") },
    { k: "uv", icon: <Sun className="h-4 w-4" />, label: T.t("uvIndex") },
    { k: "wind", icon: <WindIcon className="h-4 w-4" />, label: T.t("wind") },
    { k: "precip", icon: <Droplet className="h-4 w-4" />, label: T.t("modePrecip") },
    { k: "humidity", icon: <Droplets className="h-4 w-4" />, label: T.t("humidity") },
    { k: "visibility", icon: <Eye className="h-4 w-4" />, label: T.t("visibility") },
    { k: "pressure", icon: <Gauge className="h-4 w-4" />, label: T.t("pressure") },
  ];
  const head =
    key === "sun"
      ? { icon: <SunriseIcon className="h-5 w-5" />, label: T.t("sunrise") }
      : key === "aqi"
        ? { icon: <span className="text-sm font-bold">AQI</span>, label: T.t("airQuality") }
        : metrics.find((m) => m.k === key)!;

  const uvLevel = (v: number) =>
    v < 3 ? T.t("uvLow") : v < 6 ? T.t("uvModerate") : v < 8 ? T.t("uvHigh") : v < 11 ? T.t("uvVeryHigh") : T.t("uvExtreme");
  const visLevel = (km: number) =>
    km < 2 ? T.t("visPoor") : km < 8 ? T.t("visFair") : km < 15 ? T.t("visGood") : T.t("visVeryGood");

  const minmax = (vals: number[], pad = 0.1, floor?: number) => {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const p = (hi - lo || 1) * pad;
    return { min: floor !== undefined ? Math.min(floor, lo) : lo - p, max: hi + p };
  };

  function Body() {
    if (!dayHours.length) return null;

    if (key === "conditions") {
      const use = (h: OMHour) => (tempTab === "actual" ? h.temp : h.feels);
      const vals = dayHours.map(use);
      const r = minmax(vals);
      return (
        <>
          <TopValue
            big={`${Math.round(tempTab === "actual" ? cur.main.temp : cur.main.feels_like)}°`}
            sub={
              tempTab === "actual"
                ? `${T.t("high")} ${Math.round(day.max)}° ${T.t("low")} ${Math.round(day.min)}°`
                : `${T.t("actualTemp")}：${Math.round(cur.main.temp)}°`
            }
            aside={<img src={iconUrl(cur.weather[0].icon)} alt="" className="h-12 w-12" />}
          />
          <IconRow hours={dayHours} tz={tz} />
          <Chart points={pts(use)} color="#f97316" min={r.min} max={r.max} format={(v) => `${Math.round(v)}°`} />
          <div className="mt-3 flex rounded-full bg-white/10 p-1 text-sm">
            {(["actual", "feels"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTempTab(t)}
                className={`flex-1 rounded-full py-1.5 transition ${tempTab === t ? "bg-white/25 font-medium" : "text-white/75"}`}
              >
                {t === "actual" ? T.t("actualTemp") : T.t("apparentTemp")}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-white/70">
            {tempTab === "actual" ? T.t("actualTempDesc") : T.t("apparentTempDesc")}
          </p>
        </>
      );
    }

    if (key === "uv") {
      const vals = dayHours.map((h) => h.uv);
      const nowUv = dayIdx === 0 ? (dayHours.find((h) => h.dt >= cur.dt)?.uv ?? 0) : (day.uvMax ?? Math.max(...vals));
      return (
        <>
          <TopValue big={`${Math.round(nowUv)}`} unit={uvLevel(nowUv)} sub={T.t("whoUvi")} />
          <ValueRow hours={dayHours} value={(h) => `${Math.round(h.uv)}`} />
          <Chart
            points={pts((h) => h.uv)}
            color="#facc15"
            min={0}
            max={Math.max(11, Math.max(...vals) + 1)}
            format={(v) => `${Math.round(v)}`}
            bands={[
              { at: 2, label: T.t("uvLow") },
              { at: 5, label: T.t("uvModerate") },
              { at: 7, label: T.t("uvHigh") },
              { at: 10, label: T.t("uvVeryHigh") },
            ]}
          />
          <Summary text={
            lang === "zh"
              ? `今天紫外线最高为 ${Math.round(Math.max(...vals))}（${uvLevel(Math.max(...vals))}）。`
              : `Peak UV today is ${Math.round(Math.max(...vals))} (${uvLevel(Math.max(...vals))}).`
          } title={T.t("dailySummary")} />
        </>
      );
    }

    if (key === "wind") {
      const vals = dayHours.map((h) => Math.max(h.wind, h.gust));
      return (
        <>
          <TopValue
            big={`${cur.wind.speed.toFixed(0)}`}
            unit={windUnit}
            sub={`${T.t("gustsLabel")}${Math.round(cur.wind.speed * 1.4)} ${windUnit} · ${T.compass(degToCompass(cur.wind.deg))}`}
          />
          <div className="flex justify-between px-1">
            {dayHours.filter((_, i) => i % 2 === 0).map((h) => (
              <Navigation
                key={h.dt}
                className="h-3.5 w-3.5 text-white/60"
                style={{ transform: `rotate(${h.windDeg + 180}deg)` }}
              />
            ))}
          </div>
          <Chart points={pts((h) => h.wind)} color="#2dd4bf" min={0} max={Math.max(...vals) * 1.15 || 5} format={(v) => `${Math.round(v)}`} />
          <Summary
            title={T.t("dailySummary")}
            text={
              lang === "zh"
                ? `今天风速 ${Math.round(Math.min(...dayHours.map((h) => h.wind)))}–${Math.round(Math.max(...dayHours.map((h) => h.wind)))} ${windUnit}，阵风最高 ${Math.round(Math.max(...dayHours.map((h) => h.gust)))} ${windUnit}。`
                : `Wind ${Math.round(Math.min(...dayHours.map((h) => h.wind)))}–${Math.round(Math.max(...dayHours.map((h) => h.wind)))} ${windUnit} today, gusting to ${Math.round(Math.max(...dayHours.map((h) => h.gust)))} ${windUnit}.`
            }
          />
        </>
      );
    }

    if (key === "precip") {
      const total = dayHours.reduce((s, h) => s + h.precip, 0);
      const maxP = Math.max(...dayHours.map((h) => h.precip), 1);
      return (
        <>
          <TopValue big={total.toFixed(total >= 10 ? 0 : 1)} unit={T.t("mm")} sub={T.t("fullDayTotal")} />
          <Chart points={pts((h) => h.precip)} color="#38bdf8" min={0} max={maxP * 1.2} format={(v) => v.toFixed(1)} bars />
          <h4 className="mt-4 text-base font-semibold">{T.t("precip")}</h4>
          <p className="mb-1 text-sm text-white/70">
            {T.t("precipChanceToday")}{Math.round((day.pop ?? 0) * 100)}%
          </p>
          <Chart points={pts((h) => h.pop * 100)} color="#7dd3fc" min={0} max={100} format={(v) => `${Math.round(v)}%`} />
          <Summary
            title={T.t("precipTotal")}
            text={`${T.t("nextDay")} · ${T.t("rain")} ${total.toFixed(1)} ${T.t("mm")}`}
          />
        </>
      );
    }

    if (key === "humidity") {
      return (
        <>
          <TopValue big={`${cur.main.humidity}`} unit="%" sub={`${T.t("feelsLike")} ${Math.round(cur.main.feels_like)}°`} />
          <ValueRow hours={dayHours} value={(h) => `${Math.round(h.humidity)}`} />
          <Chart points={pts((h) => h.humidity)} color="#60a5fa" min={0} max={100} format={(v) => `${Math.round(v)}%`} />
          <Summary
            title={T.t("dailySummary")}
            text={
              lang === "zh"
                ? `今天湿度在 ${Math.round(Math.min(...dayHours.map((h) => h.humidity)))}% 至 ${Math.round(Math.max(...dayHours.map((h) => h.humidity)))}% 之间。`
                : `Humidity ranges ${Math.round(Math.min(...dayHours.map((h) => h.humidity)))}%–${Math.round(Math.max(...dayHours.map((h) => h.humidity)))}% today.`
            }
          />
        </>
      );
    }

    if (key === "visibility") {
      const km = dayHours.map((h) => (h.visibility || cur.visibility) / 1000);
      const nowKm = cur.visibility / 1000;
      return (
        <>
          <TopValue big={nowKm.toFixed(0)} unit={T.t("km")} sub={visLevel(nowKm)} />
          <ValueRow hours={dayHours} value={(h) => `${Math.round((h.visibility || cur.visibility) / 1000)}`} />
          <Chart points={pts((h) => (h.visibility || cur.visibility) / 1000)} color="#cbd5e1" min={0} max={Math.max(...km) * 1.15 || 20} format={(v) => `${Math.round(v)}`} />
          <Summary
            title={T.t("dailySummary")}
            text={
              lang === "zh"
                ? `今天能见度最低 ${Math.round(Math.min(...km))} 公里（${visLevel(Math.min(...km))}），最高 ${Math.round(Math.max(...km))} 公里（${visLevel(Math.max(...km))}）。`
                : `Visibility today ranges from ${Math.round(Math.min(...km))} km (${visLevel(Math.min(...km))}) to ${Math.round(Math.max(...km))} km (${visLevel(Math.max(...km))}).`
            }
          />
        </>
      );
    }

    if (key === "pressure") {
      const vals = dayHours.map((h) => h.pressure || cur.main.pressure);
      const r = minmax(vals, 0.25);
      const trend = (vals[vals.length - 1] ?? 0) - (vals[0] ?? 0);
      const label = trend > 1 ? T.t("trendRising") : trend < -1 ? T.t("trendFalling") : T.t("trendSteady");
      return (
        <>
          <TopValue big={cur.main.pressure.toLocaleString()} unit={T.t("hPa")} sub={label} />
          <Chart points={pts((h) => h.pressure || cur.main.pressure)} color="#c084fc" min={r.min} max={r.max} format={(v) => `${Math.round(v)}`} />
          <Summary
            title={T.t("dailySummary")}
            text={
              lang === "zh"
                ? `当前气压为 ${cur.main.pressure} 百帕，${label}。今天平均气压约 ${Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)} 百帕。`
                : `Pressure is ${cur.main.pressure} hPa and ${label.toLowerCase()}. Today's average is about ${Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)} hPa.`
            }
          />
        </>
      );
    }

    if (key === "sun") {
      const sr = day?.sunrise || cur.sys.sunrise;
      const ss = day?.sunset || cur.sys.sunset;
      const p = Math.min(Math.max((cur.dt - sr) / ((ss - sr) || 1), 0), 1);
      return (
        <>
          <TopValue big={formatTimeL(ss, tz)} sub={T.t("todaySunset")} />
          <svg viewBox="0 0 320 140" className="h-[140px] w-full">
            <line x1="0" y1="95" x2="320" y2="95" stroke="rgba(255,255,255,0.3)" />
            <path d="M0 130 Q160 -30 320 130" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
            <circle cx={p * 320} cy={130 - Math.sin(p * Math.PI) * 160 * 0.62} r="7" fill="white" />
          </svg>
          <div className="mt-2 divide-y divide-white/10 text-sm">
            <SunRow label={T.t("firstLight")} value={formatTimeL(sr - 27 * 60, tz)} />
            <SunRow label={T.t("todaySunrise")} value={formatTimeL(sr, tz)} />
            <SunRow label={T.t("todaySunset")} value={formatTimeL(ss, tz)} />
            <SunRow label={T.t("lastLight")} value={formatTimeL(ss + 25 * 60, tz)} />
          </div>
        </>
      );
    }

    if (key === "aqi" && air) {
      const pct = ((air.aqi - 1) / 4) * 100;
      return (
        <>
          <TopValue big={`${air.aqi}`} unit={T.aqi(air.aqi)} sub={T.t("currentAqi")} />
          <div
            className="relative mt-2 h-2 rounded-full"
            style={{ background: "linear-gradient(to right,#22c55e,#eab308,#f97316,#ef4444,#a855f7)" }}
          >
            <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${pct}%` }} />
          </div>
          <div className="mt-4 divide-y divide-white/10 text-sm">
            <SunRow label="PM2.5" value={`${air.pm2_5.toFixed(0)} μg/m³`} />
            <SunRow label="PM10" value={`${air.pm10.toFixed(0)} μg/m³`} />
            <SunRow label="O₃" value={`${air.o3.toFixed(0)} μg/m³`} />
          </div>
        </>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label={T.t("close")} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-neutral-900/85 text-white shadow-2xl backdrop-blur-2xl sm:rounded-3xl">
        {/* header */}
        <div className="flex items-center justify-center border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            {head.icon}
            <span>{head.label}</span>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 rounded-full bg-white/15 p-1.5 hover:bg-white/25"
            aria-label={T.t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-3">
          {/* day strip */}
          {key !== "aqi" && (
            <>
              <div className="flex justify-between gap-1 overflow-x-auto">
                {days.slice(0, 10).map((d, i) => {
                  const p = localParts(d.dt, tz);
                  const on = i === dayIdx;
                  return (
                    <button key={d.dt} onClick={() => setDayIdx(i)} className="flex min-w-[30px] flex-1 flex-col items-center gap-1">
                      <span className="text-xs text-white/60">{T.day(p.dow)}</span>
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${on ? "bg-sky-400 font-semibold text-slate-900" : "text-white/85"}`}>
                        {p.day}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 border-b border-white/10 pb-3 text-center text-sm text-white/85">{dateLabel}</p>
            </>
          )}

          {/* metric switcher */}
          {key !== "aqi" && (
            <div className="relative mt-3 flex justify-end">
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm"
              >
                {head.icon}
                <ChevronDown className="h-4 w-4" />
              </button>
              {pickerOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/95 py-1 shadow-2xl backdrop-blur-2xl">
                  {metrics.map((m) => (
                    <button
                      key={m.k}
                      onClick={() => { setKey(m.k); setPickerOpen(false); }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                    >
                      <span className="w-4">{key === m.k ? <Check className="h-4 w-4" /> : null}</span>
                      {m.icon}
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-1">{Body()}</div>
        </div>
      </div>
    </div>
  );
}

function TopValue({ big, unit, sub, aside }: { big: string; unit?: string; sub?: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="text-[44px] font-light leading-none">{big}</span>
          {unit && <span className="text-lg text-white/85">{unit}</span>}
        </div>
        {sub && <p className="mt-1.5 text-sm text-white/70">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

function IconRow({ hours, tz }: { hours: OMHour[]; tz: number }) {
  const step = Math.max(1, Math.ceil(hours.length / 12));
  return (
    <div className="flex justify-between">
      {hours.filter((_, i) => i % step === 0).map((h) => (
        <img key={h.dt} src={iconUrl(h.icon)} alt="" className="h-6 w-6" />
      ))}
    </div>
  );
}

function ValueRow({ hours, value }: { hours: OMHour[]; value: (h: OMHour) => string }) {
  const step = Math.max(1, Math.ceil(hours.length / 12));
  return (
    <div className="flex justify-between text-[11px] tabular-nums text-white/70">
      {hours.filter((_, i) => i % step === 0).map((h) => (
        <span key={h.dt}>{value(h)}</span>
      ))}
    </div>
  );
}

function SunRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-white/85">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export { HOUR };
