import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Loader2, MapPin, List, MoreHorizontal, Check, Pencil, Sparkles,
  Cloud, Droplet, Wind as WindIcon, Navigation,
} from "lucide-react";
import {
  getCurrent, getForecast, getAir, iconUrl, summarizeDaily,
  type DailySummary,
} from "@/lib/weather";
import { getOpenMeteo, type OMDay, type OMHour } from "@/lib/openmeteo";
import {
  useLocations, useActiveId, useUnits, setUnitsPref, makeId,
  type SavedLocation,
} from "@/lib/locations-store";
import { detectLang, makeT, formatHourL, formatDayL, formatTimeL, isNightAt } from "@/lib/i18n";
import { weatherGradient } from "@/lib/gradient";
import { WeatherCards } from "@/components/WeatherCards";
import { CityListPanel } from "@/components/CityList";
import { buildHighlights } from "@/lib/highlights";

const DEFAULT: SavedLocation = {
  id: makeId(40.7128, -74.006),
  name: "New York",
  country: "US",
  lat: 40.7128,
  lon: -74.006,
};

type Mode = "weather" | "precip" | "wind";

export function WeatherApp() {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const owmLang = lang === "zh" ? "zh_cn" : "en";

  const locations = useLocations();
  const activeId = useActiveId();
  const units = useUnits();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("weather");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  const active =
    locations.find((l) => l.id === activeId) ?? locations[0] ?? DEFAULT;

  const current = useQuery({
    queryKey: ["current", active.lat, active.lon, units, owmLang],
    queryFn: () => getCurrent(active.lat, active.lon, units, owmLang),
    refetchOnWindowFocus: false,
  });
  const forecast = useQuery({
    queryKey: ["forecast", active.lat, active.lon, units, owmLang],
    queryFn: () => getForecast(active.lat, active.lon, units, owmLang),
    refetchOnWindowFocus: false,
  });
  const air = useQuery({
    queryKey: ["air", active.lat, active.lon],
    queryFn: () => getAir(active.lat, active.lon),
    refetchOnWindowFocus: false,
  });
  // 1-hour steps + 10 days (OpenWeather's free plan tops out at 3h / 5 days)
  const om = useQuery({
    queryKey: ["om", active.lat, active.lon, units, lang],
    queryFn: () => getOpenMeteo(active.lat, active.lon, units, lang),
    refetchOnWindowFocus: false,
  });

  const tz = current.data?.timezone ?? om.data?.utcOffset ?? 0;
  const nowTs = current.data?.dt ?? Math.floor(Date.now() / 1000);

  // Hourly: true 1h resolution when Open-Meteo answers, else OWM 3h steps.
  const hourly: OMHour[] = useMemo(() => {
    if (om.data) {
      return om.data.hourly.filter((h) => h.dt >= nowTs - 3600).slice(0, 24);
    }
    return (forecast.data?.list ?? []).slice(0, 10).map((i) => ({
      dt: i.dt,
      temp: i.main.temp,
      feels: i.main.feels_like,
      pop: i.pop ?? 0,
      precip: 0,
      wind: i.wind.speed,
      gust: i.wind.speed * 1.4,
      windDeg: 0,
      pressure: i.main.pressure ?? 0,
      humidity: i.main.humidity ?? 0,
      visibility: 10000,
      uv: 0,
      clouds: 0,
      isDay: true,
      icon: i.weather[0].icon,
      description: i.weather[0].description,
      code: i.weather[0].id,
    }));
  }, [om.data, forecast.data, nowTs]);

  // Daily: 10 days from Open-Meteo, falling back to the OWM 5-day summary.
  const daily = useMemo(() => {
    const base: (DailySummary & Partial<OMDay>)[] = om.data
      ? om.data.daily
      : forecast.data
        ? summarizeDaily(forecast.data.list, tz)
        : [];
    const list = base.slice();
    const cur = current.data;
    if (list.length && cur) {
      list[0] = {
        ...list[0],
        max: Math.max(list[0].max, cur.main.temp, cur.main.temp_max),
        min: Math.min(list[0].min, cur.main.temp, cur.main.temp_min),
      };
    }
    return list;
  }, [om.data, forecast.data, current.data, tz]);

  const pressureTrend = (() => {
    const a = hourly[0]?.pressure ?? 0;
    const b = hourly[Math.min(3, hourly.length - 1)]?.pressure ?? 0;
    if (!a || !b) return 0;
    return b - a;
  })();

  const windUnit = units === "metric" ? (lang === "zh" ? "米/秒" : "m/s") : "mph";

  const night = current.data
    ? isNightAt(current.data.dt, current.data.sys.sunrise, current.data.sys.sunset)
    : false;

  useEffect(() => {
    if (!current.data) return;
    const root = document.documentElement;
    if (night) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [night, current.data]);

  const bg = weatherGradient(current.data?.weather[0]?.id, night);

  const sentence = useMemo(() => {
    if (!current.data) return "";
    const maxWind = hourly.length
      ? Math.max(...hourly.slice(0, 12).map((h) => h.wind))
      : current.data.wind.speed;
    const desc = current.data.weather[0].description;
    if (lang === "zh") return `今天将持续${desc}。阵风风速最高 ${maxWind.toFixed(0)} ${windUnit}。`;
    return `${desc.charAt(0).toUpperCase() + desc.slice(1)} conditions today. Wind gusts up to ${maxWind.toFixed(0)} ${windUnit}.`;
  }, [current.data, hourly, lang, windUnit]);

  const rangeMin = daily.length ? Math.min(...daily.map((d) => d.min)) : 0;
  const rangeMax = daily.length ? Math.max(...daily.map((d) => d.max)) : 1;
  const windMaxAll = daily.length
    ? Math.max(...daily.map((d) => d.windMax ?? 0), 1)
    : 1;

  const todayHi = daily.length ? Math.round(daily[0].max) : Math.round(current.data?.main.temp ?? 0);
  const todayLo = daily.length ? Math.round(daily[0].min) : Math.round(current.data?.main.temp ?? 0);

  const highlights = useMemo(
    () =>
      forecast.data
        ? buildHighlights(forecast.data.list, tz, current.data?.dt ?? Date.now() / 1000, lang, units)
        : [],
    [forecast.data, tz, current.data?.dt, lang, units],
  );

  const modes: { key: Mode; icon: React.ReactNode; label: string }[] = [
    { key: "weather", icon: <Cloud className="h-4 w-4" />, label: T.t("modeWeather") },
    { key: "precip", icon: <Droplet className="h-4 w-4" />, label: T.t("modePrecip") },
    { key: "wind", icon: <WindIcon className="h-4 w-4" />, label: T.t("modeWind") },
  ];

  return (
    <div className="min-h-screen w-full overflow-x-hidden text-white" style={{ background: bg }}>
      {/* Wide-screen city list drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 hidden lg:block">
          <button
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-label={T.t("back")}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[380px] max-w-[85vw] flex-col overflow-hidden border-r border-white/15 bg-black/45 p-4 text-white backdrop-blur-2xl shadow-2xl">
            <CityListPanel embedded onClose={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-2xl flex-col px-4 pb-10 pt-3 md:px-6 lg:max-w-6xl">


        {/* Top bar */}
        <header className="flex items-center justify-between">
          <Link
            to="/cities"
            className="rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl lg:hidden"
            aria-label={T.t("cityList")}
          >
            <List className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setDrawerOpen(true)}
            className="hidden rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl lg:block"
            aria-label={T.t("cityList")}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
              aria-label="Menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-white/15 bg-black/60 text-sm backdrop-blur-2xl shadow-2xl">
                <MenuItem
                  icon={<Pencil className="h-4 w-4" />}
                  label={T.t("editList")}
                  to="/cities"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="h-px bg-white/10" />
                <MenuItem
                  icon={<span className="w-4 text-center">°C</span>}
                  label={T.t("celsius")}
                  checked={units === "metric"}
                  onClick={() => { setUnitsPref("metric"); setMenuOpen(false); }}
                />
                <MenuItem
                  icon={<span className="w-4 text-center">°F</span>}
                  label={T.t("fahrenheit")}
                  checked={units === "imperial"}
                  onClick={() => { setUnitsPref("imperial"); setMenuOpen(false); }}
                />
                <div className="h-px bg-white/10" />
                <MenuItem
                  icon={<List className="h-4 w-4" />}
                  label={T.t("cityList")}
                  to="/cities"
                  onClick={() => setMenuOpen(false)}
                />
              </div>
            )}
          </div>
        </header>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {current.isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            </div>
          )}
          {current.isError && (
            <div className="rounded-2xl border border-red-300/30 bg-red-500/20 p-4 text-sm">
              {T.t("errorLoad")}
            </div>
          )}
          {current.data && (
            <>
              {/* Hero */}
              <section className="pb-4 pt-2 text-center">
                <div className="flex items-center justify-center gap-1 text-sm text-white/85">
                  {locations.length === 0 && <MapPin className="h-3.5 w-3.5" />}
                  <span>{locations.length === 0 ? T.t("myLocation") : ""}</span>
                </div>
                <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">{active.name}</h1>
                <div className="mt-1 flex items-start justify-center">
                  <span className="font-thin leading-none tracking-tighter" style={{ fontSize: "clamp(72px, 22vw, 120px)" }}>
                    {Math.round(current.data.main.temp)}
                  </span>
                  <span className="mt-3 font-thin text-white/85" style={{ fontSize: "clamp(28px, 8vw, 42px)" }}>°</span>
                </div>
                <p className="mt-1 text-base capitalize text-white/90">
                  {current.data.weather[0].description}
                </p>
                <div className="mt-1 flex items-center justify-center gap-4 text-sm text-white/90">
                  <span><span className="text-white/70">{T.t("high")}</span> {todayHi}°</span>
                  <span><span className="text-white/70">{T.t("low")}</span> {todayLo}°</span>
                </div>
              </section>

              <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start">
                <div className="flex min-w-0 flex-col gap-4">
                  {/* Highlights */}
                  {highlights.length > 0 && (
                    <section className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                      <h3 className="mb-2 flex items-center gap-1.5 border-b border-white/15 pb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                        <Sparkles className="h-3.5 w-3.5" />
                        {T.t("highlights")}
                      </h3>
                      <ul className="space-y-2">
                        {highlights.map((h, i) => (
                          <li key={i} className="flex min-w-0 items-start gap-2 text-sm text-white/90">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                            <span className="min-w-0">{h.text}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Hourly + mode switch */}
                  <section className="min-w-0 rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                    <div className="mb-3 flex items-start justify-between gap-3 border-b border-white/15 pb-3">
                      <p className="min-w-0 flex-1 text-sm text-white/90">{sentence}</p>
                      <div className="flex shrink-0 rounded-full border border-white/15 bg-white/10 p-0.5">
                        {modes.map((m) => (
                          <button
                            key={m.key}
                            onClick={() => setMode(m.key)}
                            aria-label={m.label}
                            aria-pressed={mode === m.key}
                            className={`rounded-full p-1.5 transition ${
                              mode === m.key ? "bg-white/85 text-slate-900" : "text-white/80"
                            }`}
                          >
                            {m.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-1">
                      {hourly.map((h, i) => {
                        const isSunset =
                          current.data &&
                          h.dt <= current.data.sys.sunset &&
                          (hourly[i + 1]?.dt ?? Infinity) > current.data.sys.sunset;
                        return (
                          <div key={h.dt} className="flex min-w-[52px] flex-col items-center gap-2">
                            <span className="text-xs font-medium text-white/85">
                              {i === 0 ? T.t("now") : formatHourL(h.dt, tz, lang)}
                            </span>
                            {mode === "weather" && (
                              <>
                                <img src={iconUrl(h.icon)} alt="" className="h-9 w-9" />
                                <span className="text-sm font-medium">{Math.round(h.temp)}°</span>
                              </>
                            )}
                            {mode === "precip" && (
                              <>
                                <div className="flex h-9 w-2.5 items-end overflow-hidden rounded-full bg-white/20">
                                  <div
                                    className="w-full rounded-full bg-sky-300"
                                    style={{ height: `${Math.max(Math.round(h.pop * 100), 3)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-sky-100">
                                  {Math.round(h.pop * 100)}%
                                </span>
                              </>
                            )}
                            {mode === "wind" && (
                              <>
                                <div className="flex h-11 w-9 flex-col items-center justify-center rounded-lg border border-white/15 bg-white/15">
                                  <span className="text-sm font-semibold leading-none">{Math.round(h.wind)}</span>
                                  <span className="mt-0.5 text-[9px] leading-none text-white/70">{windUnit}</span>
                                </div>
                                <Navigation
                                  className="h-3.5 w-3.5 text-white/70"
                                  style={{ transform: `rotate(${h.windDeg + 180}deg)` }}
                                />
                              </>
                            )}
                            {isSunset && <span className="text-[10px] text-amber-200">{T.t("sunset")}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                {/* Daily */}
                <section className="min-w-0 rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                  <h3 className="mb-2 border-b border-white/15 pb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {T.t("dayForecast")} · {modes.find((m) => m.key === mode)?.label}
                  </h3>
                  <div className="divide-y divide-white/10">
                    {daily.map((d, i) => {
                      const leftPct = ((d.min - rangeMin) / (rangeMax - rangeMin || 1)) * 100;
                      const widthPct = ((d.max - d.min) / (rangeMax - rangeMin || 1)) * 100;
                      const pop = Math.round((d.pop ?? 0) * 100);
                      const wind = Math.round(d.windMax ?? 0);
                      return (
                        <div key={d.dt} className="grid grid-cols-[52px_32px_1fr] items-center gap-2 py-2.5 sm:grid-cols-[56px_36px_1fr] sm:gap-3">
                          <span className="truncate text-sm text-white/90">{formatDayL(d.dt, tz, lang, i === 0)}</span>
                          <img src={iconUrl(d.icon)} alt="" className="h-8 w-8" />

                          {mode === "weather" && (
                            <div className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
                              <span className="w-8 shrink-0 text-right text-white/60">{Math.round(d.min)}°</span>
                              <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
                                <div
                                  className="absolute top-0 h-full rounded-full"
                                  style={{
                                    left: `${leftPct}%`,
                                    width: `${Math.max(widthPct, 6)}%`,
                                    background: "linear-gradient(to right, #38bdf8, #fbbf24, #f97316)",
                                  }}
                                />
                              </div>
                              <span className="w-8 shrink-0 text-white">{Math.round(d.max)}°</span>
                            </div>
                          )}

                          {mode === "precip" && (
                            <div className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
                              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
                                <div
                                  className="h-full rounded-full bg-sky-300"
                                  style={{ width: `${pop}%` }}
                                />
                              </div>
                              <span className="w-12 shrink-0 text-right text-sky-100">{pop}%</span>
                              {d.precip !== undefined && (
                                <span className="w-14 shrink-0 text-right text-xs text-white/60">
                                  {d.precip.toFixed(1)}mm
                                </span>
                              )}
                            </div>
                          )}

                          {mode === "wind" && (
                            <div className="flex min-w-0 items-center gap-2 text-sm tabular-nums">
                              <Navigation
                                className="h-3.5 w-3.5 shrink-0 text-white/80"
                                style={{ transform: `rotate(${(d.windDeg ?? 0) + 180}deg)` }}
                              />
                              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
                                <div
                                  className="h-full rounded-full bg-teal-200"
                                  style={{ width: `${(wind / windMaxAll) * 100}%` }}
                                />
                              </div>
                              <span className="flex w-16 shrink-0 items-baseline justify-end gap-1 text-right text-white sm:w-20">
                                {wind}
                                <span className="text-xs text-white/60">{windUnit}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Detail cards */}
              <WeatherCards
                cur={current.data}
                daily={daily}
                T={T}
                lang={lang}
                tz={tz}
                units={units}
                pop={hourly[0]?.pop ?? 0}
                todayHi={todayHi}
                pressureTrend={pressureTrend}
                air={
                  air.data
                    ? {
                        aqi: air.data.list[0].main.aqi,
                        pm2_5: air.data.list[0].components.pm2_5,
                        pm10: air.data.list[0].components.pm10,
                        o3: air.data.list[0].components.o3,
                      }
                    : undefined
                }
              />

              <footer className="pt-2 text-center text-xs text-white/60">
                {T.t("dataFrom")} · {T.t("updated")} {formatTimeL(current.data.dt, tz)}
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function MenuItem({
  icon, label, checked, onClick, to,
}: {
  icon: React.ReactNode; label: string; checked?: boolean;
  onClick?: () => void; to?: string;
}) {
  const inner = (
    <>
      <span className="flex w-4 justify-center">{checked ? <Check className="h-4 w-4" /> : null}</span>
      <span className="flex w-5 justify-center text-white/80">{icon}</span>
      <span className="flex-1">{label}</span>
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10";
  if (to)
    return (
      <Link to={to} onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
