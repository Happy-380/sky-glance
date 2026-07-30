import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MapPin, List, MoreHorizontal, Check, Pencil } from "lucide-react";
import {
  getCurrent, getForecast, getAir, iconUrl, summarizeDaily,
} from "@/lib/weather";
import {
  useLocations, useActiveId, useUnits, setUnitsPref, makeId,
  type SavedLocation,
} from "@/lib/locations-store";
import { detectLang, makeT, formatHourL, formatDayL, formatTimeL, isNightAt } from "@/lib/i18n";
import { weatherGradient } from "@/lib/gradient";
import { WeatherCards } from "@/components/WeatherCards";

const DEFAULT: SavedLocation = {
  id: makeId(40.7128, -74.006),
  name: "New York",
  country: "US",
  lat: 40.7128,
  lon: -74.006,
};

export function WeatherApp() {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const owmLang = lang === "zh" ? "zh_cn" : "en";

  const locations = useLocations();
  const activeId = useActiveId();
  const units = useUnits();
  const [menuOpen, setMenuOpen] = useState(false);
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

  const tz = current.data?.timezone ?? 0;
  const daily = forecast.data ? summarizeDaily(forecast.data.list, tz) : [];
  const hourly = forecast.data?.list.slice(0, 10) ?? [];
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
    if (!current.data || !forecast.data) return "";
    const maxWind = Math.max(...forecast.data.list.slice(0, 8).map((i) => i.wind.speed));
    const desc = current.data.weather[0].description;
    if (lang === "zh") return `今天将持续${desc}。阵风风速最高 ${maxWind.toFixed(0)} ${windUnit}。`;
    return `${desc.charAt(0).toUpperCase() + desc.slice(1)} conditions today. Wind gusts up to ${maxWind.toFixed(0)} ${windUnit}.`;
  }, [current.data, forecast.data, lang, windUnit]);

  const rangeMin = daily.length ? Math.min(...daily.map((d) => d.min)) : 0;
  const rangeMax = daily.length ? Math.max(...daily.map((d) => d.max)) : 1;

  return (
    <div className="min-h-screen w-full overflow-x-hidden text-white" style={{ background: bg }}>
      <div className="mx-auto flex min-h-screen w-full max-w-2xl min-w-0 flex-col px-4 pb-10 pt-3 md:px-6">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <Link
            to="/cities"
            className="rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
            aria-label={T.t("cityList")}
          >
            <List className="h-4 w-4" />
          </Link>
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
                  <span className="font-thin leading-none tracking-tighter" style={{ fontSize: "clamp(72px, 22vw, 130px)" }}>
                    {Math.round(current.data.main.temp)}
                  </span>
                  <span className="mt-3 font-thin text-white/85" style={{ fontSize: "clamp(28px, 8vw, 46px)" }}>°</span>
                </div>
                <p className="mt-1 text-base capitalize text-white/90">
                  {current.data.weather[0].description}
                </p>
                <div className="mt-1 flex items-center justify-center gap-4 text-sm text-white/90">
                  <span><span className="text-white/70">{T.t("high")}</span> {Math.round(current.data.main.temp_max)}°</span>
                  <span><span className="text-white/70">{T.t("low")}</span> {Math.round(current.data.main.temp_min)}°</span>
                </div>
              </section>

              {/* Hourly */}
              <section className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                <p className="mb-3 border-b border-white/15 pb-3 text-sm text-white/90">{sentence}</p>
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
                        <img src={iconUrl(h.weather[0].icon)} alt="" className="h-9 w-9" />
                        <span className="text-sm font-medium">{Math.round(h.main.temp)}°</span>
                        {isSunset && <span className="text-[10px] text-amber-200">{T.t("sunset")}</span>}
                        {h.pop > 0.2 && <span className="text-[10px] text-sky-200">{Math.round(h.pop * 100)}%</span>}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Daily */}
              <section className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                <h3 className="mb-2 border-b border-white/15 pb-2 text-xs font-semibold uppercase tracking-widest text-white/60">
                  {T.t("dayForecast")}
                </h3>
                <div className="divide-y divide-white/10">
                  {daily.map((d, i) => {
                    const leftPct = ((d.min - rangeMin) / (rangeMax - rangeMin || 1)) * 100;
                    const widthPct = ((d.max - d.min) / (rangeMax - rangeMin || 1)) * 100;
                    return (
                      <div key={d.dt} className="grid grid-cols-[56px_36px_1fr] items-center gap-3 py-2.5">
                        <span className="text-sm text-white/90">{formatDayL(d.dt, tz, lang, i === 0)}</span>
                        <img src={iconUrl(d.icon)} alt="" className="h-8 w-8" />
                        <div className="flex items-center gap-2 text-sm tabular-nums">
                          <span className="w-8 text-right text-white/60">{Math.round(d.min)}°</span>
                          <div className="relative h-1.5 flex-1 rounded-full bg-white/20">
                            <div
                              className="absolute top-0 h-full rounded-full"
                              style={{
                                left: `${leftPct}%`,
                                width: `${Math.max(widthPct, 6)}%`,
                                background: "linear-gradient(to right, #38bdf8, #fbbf24, #f97316)",
                              }}
                            />
                          </div>
                          <span className="w-8 text-white">{Math.round(d.max)}°</span>
                        </div>
                      </div>
                    );
                  })}
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
                pop={forecast.data?.list[0]?.pop ?? 0}
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
