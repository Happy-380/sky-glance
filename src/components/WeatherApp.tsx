import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import {
  Loader2, List, MoreHorizontal, Check, Pencil, CalendarDays,
  Cloud, Droplet, Wind as WindIcon, Navigation,
} from "lucide-react";
import {
  getCurrent, getForecast, getAir, summarizeDaily, weatherImage, weatherImageFromIcon,
  type DailySummary,
} from "@/lib/weather";
import { getOpenMeteo, type OMDay, type OMHour, weatherImageForWmo } from "@/lib/openmeteo";
import {
  useLocations, useActiveId, useUnits, useUnitSettings, setUnitsPref, setActiveId, makeId,
  convertWind, windUnitLabel, formatWind, formatPrecip, resolveTemperatureUnit,
  type SavedLocation,
} from "@/lib/locations-store";
import { detectLang, makeT, formatHourL, formatDayL, formatTimeL, isNightAt, type Lang } from "@/lib/i18n";
import { weatherGradient } from "@/lib/gradient";
import { WeatherCards } from "@/components/WeatherCards";
import { CityListPanel } from "@/components/CityList";
import { UnitSettingsSheet } from "@/components/UnitSettings";
import { MetricDetail, temperatureStrokeColor, type MetricKey } from "@/components/MetricDetail";
import sunriseIcon from "@/assets/images/sunrise.png";
import sunsetIcon from "@/assets/images/sunset.png";

const DEFAULT: SavedLocation = {
  id: makeId(40.7128, -74.006),
  name: "New York",
  country: "US",
  lat: 40.7128,
  lon: -74.006,
};

type Mode = "weather" | "precip" | "wind";

export function WeatherApp() {
  /* Deterministic initial value so SSR and the first client (hydration) render
     match. `navigator.language` is only read after mount — reading it during
     hydration would differ from the server and trigger a full-client re-render
     (the "page refresh" on load). */
  const [lang, setLang] = useState<Lang>("en");
  const T = useMemo(() => makeT(lang), [lang]);
  const owmLang = lang === "zh" ? "zh_cn" : "en";

  useEffect(() => {
    setLang(detectLang());
  }, []);

  const locations = useLocations();
  const activeId = useActiveId();
  const units = useUnits();
  const unitSettings = useUnitSettings();
  const tempUnit = resolveTemperatureUnit(unitSettings, units);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("weather");
  const [detail, setDetail] = useState<MetricKey | null>(null);
  const [unitsOpen, setUnitsOpen] = useState(false);
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

  /* placeholderData keeps the previous result visible while a *changed query key*
     (active location or language) refetches. Without it, a key change briefly
     swaps `data` back to undefined, the `{current.data && …}` tree unmounts, and
     the whole dashboard flashes to the spinner — that is the "page refresh". */
  const current = useQuery({
    queryKey: ["current", active.lat, active.lon, units, owmLang],
    queryFn: () => getCurrent(active.lat, active.lon, units, owmLang),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
  const forecast = useQuery({
    queryKey: ["forecast", active.lat, active.lon, units, owmLang],
    queryFn: () => getForecast(active.lat, active.lon, units, owmLang),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
  const air = useQuery({
    queryKey: ["air", active.lat, active.lon],
    queryFn: () => getAir(active.lat, active.lon),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
  // 1-hour steps + 10 days (OpenWeather's free plan tops out at 3h / 5 days)
  const om = useQuery({
    queryKey: ["om", active.lat, active.lon, units, lang],
    queryFn: () => getOpenMeteo(active.lat, active.lon, units, lang),
    placeholderData: (previous) => previous,
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
      feels: i.main.temp,
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

  const windUnit = windUnitLabel(unitSettings.wind, lang);

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
    const maxWindConverted = convertWind(maxWind, unitSettings.wind).value;
    const desc = current.data.weather[0].description;
    if (lang === "zh") return `今天将持续${desc}。阵风风速最高 ${maxWindConverted.toFixed(0)} ${windUnit}。`;
    return `${desc.charAt(0).toUpperCase() + desc.slice(1)} conditions today. Wind gusts up to ${maxWindConverted.toFixed(0)} ${windUnit}.`;
  }, [current.data, hourly, lang, windUnit, unitSettings.wind]);

  const rangeMin = daily.length ? Math.min(...daily.map((d) => d.min)) : 0;
  const rangeMax = daily.length ? Math.max(...daily.map((d) => d.max)) : 1;
  const windMaxAll = daily.length
    ? Math.max(...daily.map((d) => d.windMax ?? 0), 1)
    : 1;

  const todayHi = daily.length ? Math.round(daily[0].max) : Math.round(current.data?.main.temp ?? 0);
  const todayLo = daily.length ? Math.round(daily[0].min) : Math.round(current.data?.main.temp ?? 0);

  const toDisplayTemp = (celsius: number) => {
    if (tempUnit === "f") return Math.round(celsius * 9 / 5 + 32);
    return Math.round(celsius);
  };
  const tempSuffix = tempUnit === "f" ? "°F" : "°";

  /* The first saved location always plays the role of "My Location" — it is
     the one the list pins to the top, exactly like the iOS list. */
  const isMyLocation = locations.length > 0 && locations[0].id === active.id;

  /* `今天` owns a dot on its temperature bar showing where the current reading
     sits inside the day's range. */
  const nowPct = (() => {
    const span = rangeMax - rangeMin || 1;
    const t = current.data?.main.temp ?? todayHi;
    return Math.min(Math.max(((t - rangeMin) / span) * 100, 0), 100);
  })();
  const modes: { key: Mode; icon: React.ReactNode; label: string }[] = [
    { key: "weather", icon: <Cloud className="h-4 w-4" />, label: T.t("modeWeather") },
    { key: "precip", icon: <Droplet className="h-4 w-4" />, label: T.t("modePrecip") },
    { key: "wind", icon: <WindIcon className="h-4 w-4" />, label: T.t("modeWind") },
  ];

  /* Title + unit line under it, mirroring the heading of the hourly card. */
  const modeHeading = {
    weather: {
      title: T.t("conditions"),
      sub: `${T.t("tempSub")} (${tempUnit === "f" ? "°F" : "°C"})`,
    },
    precip: { title: T.t("modePrecip"), sub: T.t("precipSub") },
    wind: {
      title: T.t("modeWind"),
      sub: `${T.t("windSubSpeed")}（${windUnit}）· ${T.t("gusts")}`,
    },
  }[mode];

  return (
    <div
      className="page-enter relative min-h-screen w-full overflow-x-hidden text-white"
      style={{ background: bg }}
    >
      {/* Sky depth. A flat two-stop gradient reads as a rectangle of colour.
         A soft scrim at the zenith lifts the hero's contrast on every weather,
         and the base vignette keeps the footer from floating. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(4,8,16,0.22), rgba(4,8,16,0) 340px), linear-gradient(to top, rgba(4,8,16,0.34), rgba(4,8,16,0) 460px)",
        }}
      />
      {/* Wide-screen city list drawer. Portaled to body so the .page-enter
         transform on this page can't become its containing block. */}
      {drawerOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 hidden lg:block">
            <button
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
              aria-label={T.t("back")}
            />
            <aside className="absolute inset-y-0 left-0 flex w-[380px] max-w-[85vw] flex-col overflow-hidden border-r border-white/15 bg-black/45 p-4 text-white backdrop-blur-2xl shadow-2xl">
              <CityListPanel embedded onClose={() => setDrawerOpen(false)} />
            </aside>
          </div>,
          document.body,
        )}
      <div className="relative mx-auto flex min-h-screen w-full min-w-0 max-w-2xl flex-col px-4 pb-6 pt-3 md:px-6 lg:max-w-6xl lg:pb-8">
        {/* Top bar. On phones the city list lives in the floating bar at the
           bottom (where the thumb is); on wide screens it opens the side
           panel, so only then does a top-left control appear. */}
        <header className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="sky-chip hidden h-11 w-11 items-center justify-center lg:inline-flex"
            aria-label={T.t("cityList")}
          >
            <List className="h-4 w-4" />
          </button>
          <div className="relative ml-auto" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="sky-chip inline-flex h-11 w-11 items-center justify-center"
              aria-label="Menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="menu-pop absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-white/15 bg-black/60 text-sm backdrop-blur-2xl shadow-2xl">
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
                  icon={<span className="w-4 text-center text-xs">U</span>}
                  label={T.t("units")}
                  onClick={() => { setMenuOpen(false); setUnitsOpen(true); }}
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
          {!current.data && current.isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            </div>
          )}
          {!current.data && current.isError && (
            <div className="rounded-2xl border border-red-300/30 bg-red-500/20 p-4 text-sm">
              {T.t("errorLoad")}
            </div>
          )}
          {current.data && (
            <>
              {/* Hero — same vertical rhythm as the iOS app: place label, city,
                 reading, high/low, then feels-like. Nothing else competes. */}
              <section className="sky-hero-shadow px-2 pb-2 pt-1 text-center">
                {isMyLocation && <p className="text-sm text-white/85">{T.t("myLocation")}</p>}
                <h1 className="text-[28px] font-medium leading-tight tracking-tight md:text-[32px]">
                  {active.name}
                </h1>
                <div className="mt-0.5 flex items-start justify-center">
                  <span
                    className="font-thin leading-[0.94] tracking-[-0.03em]"
                    style={{ fontSize: "clamp(68px, 19vw, 104px)" }}
                  >
                    {toDisplayTemp(current.data.main.temp)}
                  </span>
                  <span
                    className="font-thin leading-none text-white/90"
                    style={{ fontSize: "clamp(26px, 7vw, 38px)" }}
                  >
                    {tempSuffix}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-3 text-white/95">
                  <StackedStat
                    label={T.t("high")}
                    value={`${toDisplayTemp(todayHi)}${tempSuffix}`}
                  />
                  <StackedStat
                    label={T.t("low")}
                    value={`${toDisplayTemp(todayLo)}${tempSuffix}`}
                  />
                </div>
                <p className="mt-1.5 text-[15px] text-white/85">
                  {T.t("feelsLikeInline")}
                  {toDisplayTemp(current.data.main.feels_like)}
                  {tempSuffix}
                </p>
              </section>

              {/* Hourly — heading + readout switcher on top, the day summary
                 under them, then the strip. Same stack as the iOS card. */}
              <section className="sky-card min-w-0 overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-medium leading-tight">
                      {modeHeading.title}
                    </h2>
                    <p className="mt-0.5 truncate text-[13px] leading-tight text-white/70">
                      {modeHeading.sub}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center rounded-full bg-white/12 p-0.5">
                    {modes.map((m, i) => (
                      <Fragment key={m.key}>
                        {i === 2 && (
                          <span className="mx-0.5 h-5 w-px shrink-0 bg-white/20" aria-hidden />
                        )}
                        <button
                          onClick={() => setMode(m.key)}
                          aria-label={m.label}
                          aria-pressed={mode === m.key}
                          className={`flex h-8 w-9 items-center justify-center rounded-full transition duration-200 ease-out ${
                            mode === m.key
                              ? "bg-white/80 text-slate-900"
                              : "text-white/80 hover:text-white"
                          }`}
                        >
                          {m.icon}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                </div>

                <p className="mt-3 border-y border-white/12 px-4 py-2 text-[13px] leading-snug text-white/90">
                  {sentence}
                </p>

                {/* No horizontal padding: the first column's centred label then
                   lands exactly on the card's text edge, flush with the
                   heading above it. */}
                <div className="scrollbar-none flex overflow-x-auto py-3">
                  {hourly.map((h, i) => {
                    const next = hourly[i + 1]?.dt ?? Infinity;
                    const sun = current.data;
                    const isSunrise =
                      mode === "weather" &&
                      !!sun &&
                      h.dt <= sun.sys.sunrise &&
                      next > sun.sys.sunrise;
                    const isSunset =
                      mode === "weather" &&
                      !!sun &&
                      h.dt <= sun.sys.sunset &&
                      next > sun.sys.sunset;
                    const marker = isSunrise ? "sunrise" : isSunset ? "sunset" : null;
                    return (
                      <div
                        key={h.dt}
                        className="flex w-[58px] shrink-0 flex-col items-center gap-1.5 lg:w-auto lg:min-w-0 lg:flex-1"
                      >
                        <span className="text-[13px] font-medium text-white/85">
                          {marker && sun
                            ? formatTimeL(isSunrise ? sun.sys.sunrise : sun.sys.sunset, tz)
                            : i === 0
                              ? T.t("now")
                              : formatHourL(h.dt, tz, lang)}
                        </span>

                        {mode === "weather" && (
                          <>
                            <img
                              src={
                                marker
                                  ? isSunrise
                                    ? sunriseIcon
                                    : sunsetIcon
                                  : weatherImageForWmo(h.code, !h.isDay)
                              }
                              alt=""
                              className="h-8 w-8 object-contain"
                            />
                            <span className="text-[15px] font-medium">
                              {marker
                                ? T.t(isSunrise ? "sunrise" : "sunset")
                                : `${Math.round(h.temp)}°`}
                            </span>
                          </>
                        )}

                        {mode === "precip" && (
                          <>
                            <div className="flex h-8 w-2.5 items-end overflow-hidden rounded-full bg-white/20">
                              <div
                                className="w-full rounded-full bg-sky-300"
                                style={{ height: `${Math.max(Math.round(h.pop * 100), 4)}%` }}
                              />
                            </div>
                            <span className="text-[15px] font-medium text-sky-100">
                              {Math.round(h.pop * 100)}%
                            </span>
                          </>
                        )}

                        {mode === "wind" && (
                          <>
                            <span className="flex h-8 flex-col items-center justify-center leading-none">
                              <span className="text-[17px] font-medium">
                                {convertWind(h.wind, unitSettings.wind).value.toFixed(0)}
                              </span>
                              <span className="mt-1 text-[11px] text-white/70">{windUnit}</span>
                            </span>
                            <Navigation
                              className="h-3.5 w-3.5 text-white/70"
                              style={{ transform: `rotate(${h.windDeg + 180}deg)` }}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Forecast list + metric tiles. Stacked on phones; on wide
                 screens they sit side by side so neither column ends in a
                 stretch of empty sky. */}
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
                {/* Daily */}
                <section className="sky-card min-w-0">
                  <h2 className="flex items-center gap-1.5 px-4 pb-1 pt-3.5 text-[17px] font-medium">
                    <CalendarDays className="h-4 w-4 shrink-0 text-white/70" />
                    <span className="truncate">{T.t("tenDay")}</span>
                  </h2>
                  <div className="px-4 pb-2">
                    <div className="divide-y divide-white/12">
                      {daily.map((d, i) => {
                        const leftPct = ((d.min - rangeMin) / (rangeMax - rangeMin || 1)) * 100;
                        const widthPct = ((d.max - d.min) / (rangeMax - rangeMin || 1)) * 100;
                        const pop = Math.round((d.pop ?? 0) * 100);
                        const wind = Math.round(d.windMax ?? 0);
                        return (
                          <div
                            key={d.dt}
                            className="grid grid-cols-[3.25rem_1.75rem_minmax(0,1fr)] items-center gap-x-2 py-2"
                          >
                            <span className="truncate text-[15px] text-white/90">
                              {formatDayL(d.dt, tz, lang, i === 0)}
                            </span>
                            <img
                              src={
                                typeof d.code === "number"
                                  ? weatherImageForWmo(d.code, false)
                                  : weatherImageFromIcon(d.icon)
                              }
                              alt=""
                              className="h-7 w-7 object-contain"
                            />

                            {mode === "weather" && (
                              <div className="flex min-w-0 items-center gap-2 text-[15px] tabular-nums">
                                <span className="w-8 shrink-0 text-right text-white/55">
                                  {toDisplayTemp(d.min)}
                                  {tempSuffix}
                                </span>
                                <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
                                  <div
                                    className="absolute top-0 h-full rounded-full"
                                    style={{
                                      left: `${leftPct}%`,
                                      width: `${Math.max(widthPct, 6)}%`,
                                      /* 每日温度条按温度真实值从左(低)到右(高)水平渐变，
                                       与详细卡片温度曲线的色阶 (temperatureStrokeColor) 完全一致：
                                       冷蓝 → 青绿 → 黄绿 → 金黄 → 橙 → 红 → 深红。
                                       在 [d.min, d.max] 区间采样 12 个点生成 stops，保证平滑。 */
                                      background: (() => {
                                        const N = 12;
                                        const parts: string[] = [];
                                        for (let i = 0; i <= N; i++) {
                                          const tCelsius = d.min + (i / N) * (d.max - d.min);
                                          const pct = (i / N) * 100;
                                          parts.push(
                                            `${temperatureStrokeColor(tCelsius)} ${pct.toFixed(2)}%`,
                                          );
                                        }
                                        return `linear-gradient(to right, ${parts.join(", ")})`;
                                      })(),
                                    }}
                                  />
                                  {/* Where we are right now inside today's range. */}
                                  {i === 0 && (
                                    <span
                                      className="absolute top-1/2 h-[7px] w-[7px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.45)]"
                                      style={{
                                        left: `${nowPct}%`,
                                        transform: "translate(-50%,-50%)",
                                      }}
                                    />
                                  )}
                                </div>
                                <span className="w-8 shrink-0 text-white">
                                  {toDisplayTemp(d.max)}
                                  {tempSuffix}
                                </span>
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
                                <span className="w-12 shrink-0 text-right text-sky-100">
                                  {pop}%
                                </span>
                                {d.precip !== undefined && (
                                  <span className="w-14 shrink-0 text-right text-xs text-white/60">
                                    {formatPrecip(d.precip, unitSettings.precipitation)}
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
                                  {convertWind(wind, unitSettings.wind).value.toFixed(0)}
                                  <span className="text-xs text-white/60">{windUnit}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Detail cards */}
                <WeatherCards
                  cur={current.data}
                  daily={daily}
                  T={T}
                  lang={lang}
                  tz={tz}
                  units={units}
                  unitSettings={unitSettings}
                  pop={hourly[0]?.pop ?? 0}
                  todayHi={todayHi}
                  pressureTrend={pressureTrend}
                  onOpen={setDetail}
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
              </div>

              {detail && (
                <MetricDetail
                  metric={detail}
                  onClose={() => setDetail(null)}
                  hours={om.data?.hourly ?? hourly}
                  days={om.data?.daily ?? daily}
                  tz={tz}
                  lang={lang}
                  T={T}
                  units={units}
                  unitSettings={unitSettings}
                  cur={current.data}
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
              )}

              <footer className="pb-12 pt-2 text-center text-xs text-white/55 lg:pb-2">
                {T.t("dataFrom")} · {T.t("updated")} {formatTimeL(current.data.dt, tz)}
              </footer>
            </>
          )}
        </main>
      </div>

      {/* Floating bar — the two things you actually reach for while reading the
         forecast, parked where the thumb is. The page dots double as a city
         switcher, so changing location never costs a navigation.

         Portaled to <body>: `.page-enter` keeps `will-change: transform`, which
         makes the page element a containing block that would trap
         `position: fixed` inside its own box. */}
      {current.data &&
        locations.length > 0 &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
            <div className="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center px-4 md:px-6">
              <span aria-hidden />
              <div className="sky-bar pointer-events-auto flex items-center gap-1.5 px-3.5 py-2.5">
                {locations.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setActiveId(l.id)}
                    aria-label={l.name}
                    aria-current={l.id === active.id}
                    className={`rounded-full transition-all duration-200 ease-out ${
                      l.id === active.id ? "h-2 w-2 bg-white" : "h-1.5 w-1.5 bg-white/40"
                    }`}
                  />
                ))}
              </div>
              <Link
                to="/cities"
                className="sky-chip pointer-events-auto inline-flex h-11 w-11 items-center justify-center justify-self-end"
                aria-label={T.t("cityList")}
              >
                <List className="h-4 w-4" />
              </Link>
            </div>
          </div>,
          document.body,
        )}

      {unitsOpen && <UnitSettingsSheet onClose={() => setUnitsOpen(false)} />}
    </div>
  );
}

/* "最高 23°" — the label is set vertically so it can stay small while the
   number stays loud. Splitting on characters keeps it working for 最高/最低
   and for the single-letter H/L. */
function StackedStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-start gap-1">
      <span className="flex flex-col pt-[3px] text-[11px] font-normal leading-[1.12] text-white/75">
        {[...label].map((ch, i) => (
          <span key={i}>{ch}</span>
        ))}
      </span>
      <span className="text-[22px] leading-none">{value}</span>
    </span>
  );
}

function MenuItem({
  icon,
  label,
  checked,
  onClick,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  checked?: boolean;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <>
      <span className="flex w-4 justify-center">
        {checked ? <Check className="h-4 w-4" /> : null}
      </span>
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
