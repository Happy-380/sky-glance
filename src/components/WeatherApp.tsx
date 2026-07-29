import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Search, MapPin, Loader2, Wind, Droplets, Eye, Gauge,
  Sunrise, Sunset, Thermometer, Trash2, List,
} from "lucide-react";
import {
  geocode, getCurrent, getForecast, getAir,
  iconUrl, degToCompass, summarizeDaily,
  type GeoCity,
} from "@/lib/weather";
import {
  addLocation, removeLocation, useLocations, makeId,
  type SavedLocation,
} from "@/lib/locations-store";
import {
  detectLang, makeT, formatHourL, formatDayL, formatTimeL, isNightAt,
} from "@/lib/i18n";

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
  const [active, setActive] = useState<SavedLocation>(DEFAULT);
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (!locations.length) return;
    if (!locations.some((l) => l.id === active.id)) setActive(locations[0]);
  }, [locations, active.id]);

  const activeList = locations.length ? locations : [DEFAULT];

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
  const search = useQuery({
    queryKey: ["geocode", query],
    queryFn: () => geocode(query),
    enabled: query.trim().length >= 2,
  });

  const tz = current.data?.timezone ?? 0;
  const daily = forecast.data ? summarizeDaily(forecast.data.list, tz) : [];
  const hourly = forecast.data?.list.slice(0, 10) ?? [];
  const tempUnit = "°";
  const windUnit = units === "metric" ? (lang === "zh" ? "米/秒" : "m/s") : "mph";

  const night = current.data
    ? isNightAt(current.data.dt, current.data.sys.sunrise, current.data.sys.sunset)
    : false;

  // Sync dark class based on location time
  useEffect(() => {
    if (!current.data) return;
    const root = document.documentElement;
    if (night) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [night, current.data]);

  const bg = weatherGradient(current.data?.weather[0]?.id, night);

  function pickCity(c: GeoCity) {
    const loc: SavedLocation = {
      id: makeId(c.lat, c.lon),
      name: c.name, country: c.country, state: c.state,
      lat: c.lat, lon: c.lon,
    };
    addLocation(loc);
    setActive(loc);
    setQuery("");
    setSearchOpen(false);
    setListOpen(false);
  }

  // Weather sentence
  const sentence = useMemo(() => {
    if (!current.data || !forecast.data) return "";
    const maxWind = Math.max(...forecast.data.list.slice(0, 8).map((i) => i.wind.speed));
    const desc = current.data.weather[0].description;
    if (lang === "zh") {
      return `今天将持续${desc}。阵风风速最高 ${maxWind.toFixed(0)} ${windUnit}。`;
    }
    return `${desc.charAt(0).toUpperCase() + desc.slice(1)} conditions today. Wind gusts up to ${maxWind.toFixed(0)} ${windUnit}.`;
  }, [current.data, forecast.data, lang, windUnit]);

  const rangeMin = daily.length ? Math.min(...daily.map((d) => d.min)) : 0;
  const rangeMax = daily.length ? Math.max(...daily.map((d) => d.max)) : 1;

  return (
    <div className="min-h-screen text-white" style={{ background: bg }}>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-24 pt-4 md:px-8 md:pt-8 lg:pb-8">
        {/* Top bar */}
        <header className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder={T.t("searchPlaceholder")}
              className="w-full rounded-full border border-white/15 bg-white/10 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/60 backdrop-blur-xl outline-none focus:border-white/30 focus:bg-white/15"
            />
            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl shadow-2xl">
                {search.isFetching && (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" /> {T.t("searching")}
                  </div>
                )}
                {!search.isFetching && (!search.data || search.data.length === 0) && (
                  <div className="px-4 py-3 text-sm text-white/60">{T.t("noResults")}</div>
                )}
                {search.data?.map((c, i) => (
                  <button
                    key={`${c.lat}_${c.lon}_${i}`}
                    onClick={() => pickCity(c)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-white/60">
                        {c.state ? `${c.state}, ` : ""}{c.country}
                      </span>
                    </span>
                    <span className="text-xs text-white/60">{T.t("add")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1 text-xs backdrop-blur-xl">
            <button onClick={() => setUnits("metric")}
              className={`rounded-full px-3 py-1.5 transition ${units === "metric" ? "bg-white text-black" : "text-white/80"}`}>°C</button>
            <button onClick={() => setUnits("imperial")}
              className={`rounded-full px-3 py-1.5 transition ${units === "imperial" ? "bg-white text-black" : "text-white/80"}`}>°F</button>
          </div>
          <button
            onClick={() => setListOpen((v) => !v)}
            className="rounded-full border border-white/15 bg-white/10 p-2.5 text-white backdrop-blur-xl lg:hidden"
            aria-label="Locations"
          >
            <List className="h-4 w-4" />
          </button>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar */}
          <aside className={`${listOpen ? "block" : "hidden"} lg:block`}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-white/60">
              {T.t("savedLocations")}
            </h2>
            <div className="flex flex-col gap-2">
              {activeList.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  active={loc.id === active.id}
                  units={units}
                  onSelect={() => { setActive(loc); setListOpen(false); }}
                  onRemove={locations.length > 0 ? () => removeLocation(loc.id) : undefined}
                />
              ))}
              {locations.length === 0 && (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                  {T.t("savedHint")}
                </p>
              )}
            </div>
          </aside>

          {/* Main */}
          <main className="flex flex-col gap-4">
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
                {/* Hero — Apple Weather style */}
                <section className="pt-6 pb-8 text-center md:pt-10">
                  <div className="flex items-center justify-center gap-1 text-sm text-white/85">
                    {locations.length === 0 && <MapPin className="h-3.5 w-3.5" />}
                    <span>{locations.length === 0 ? T.t("myLocation") : (lang === "zh" ? "" : "")}</span>
                  </div>
                  <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">
                    {active.name}
                  </h1>
                  <div className="mt-1 flex items-start justify-center">
                    <span className="text-[110px] font-thin leading-none tracking-tighter md:text-[140px]">
                      {Math.round(current.data.main.temp)}
                    </span>
                    <span className="mt-4 text-4xl font-thin text-white/85 md:text-5xl">
                      {tempUnit}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-4 text-base text-white/90 md:text-lg">
                    <span>
                      <span className="text-white/70">{T.t("high")}</span> {Math.round(current.data.main.temp_max)}°
                    </span>
                    <span>
                      <span className="text-white/70">{T.t("low")}</span> {Math.round(current.data.main.temp_min)}°
                    </span>
                  </div>
                  <p className="mt-1 text-base capitalize text-white/90">
                    {current.data.weather[0].description}
                  </p>
                </section>

                {/* AQI card with color bar */}
                {air.data && (() => {
                  const aqi = air.data.list[0].main.aqi;
                  const pct = ((aqi - 1) / 4) * 100;
                  return (
                    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                      <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                        <span className="text-base font-semibold text-white">
                          {T.t("aqi")} · {T.aqi(aqi)}
                        </span>
                        <span className="text-xs uppercase tracking-widest">{aqi}/5</span>
                      </div>
                      <div
                        className="relative h-1.5 rounded-full"
                        style={{
                          background:
                            "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444, #a855f7)",
                        }}
                      >
                        <div
                          className="absolute top-1/2 h-3 w-3 rounded-full bg-white shadow"
                          style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-white/70">
                        PM2.5 {air.data.list[0].components.pm2_5.toFixed(0)} · PM10 {air.data.list[0].components.pm10.toFixed(0)} · O₃ {air.data.list[0].components.o3.toFixed(0)}
                      </p>
                    </div>
                  );
                })()}

                {/* Hourly */}
                <section className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                  <p className="mb-3 border-b border-white/15 pb-3 text-sm text-white/90">
                    {sentence}
                  </p>
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
                          {isSunset && (
                            <span className="text-[10px] text-amber-200">{T.t("sunset")}</span>
                          )}
                          {h.pop > 0.2 && (
                            <span className="text-[10px] text-sky-200">{Math.round(h.pop * 100)}%</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Daily with range bar */}
                <section className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
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

                {/* Details grid */}
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Detail icon={<Thermometer className="h-4 w-4" />} label={T.t("feelsLike")}
                    value={`${Math.round(current.data.main.feels_like)}${tempUnit}`} />
                  <Detail icon={<Wind className="h-4 w-4" />} label={T.t("wind")}
                    value={`${current.data.wind.speed.toFixed(1)} ${windUnit}`}
                    sub={T.compass(degToCompass(current.data.wind.deg))} />
                  <Detail icon={<Droplets className="h-4 w-4" />} label={T.t("humidity")}
                    value={`${current.data.main.humidity}%`} />
                  <Detail icon={<Gauge className="h-4 w-4" />} label={T.t("pressure")}
                    value={`${current.data.main.pressure} hPa`} />
                  <Detail icon={<Eye className="h-4 w-4" />} label={T.t("visibility")}
                    value={`${(current.data.visibility / 1000).toFixed(1)} km`} />
                  <Detail icon={<Sunrise className="h-4 w-4" />} label={T.t("sunrise")}
                    value={formatTimeL(current.data.sys.sunrise, tz)} />
                  <Detail icon={<Sunset className="h-4 w-4" />} label={T.t("sunset")}
                    value={formatTimeL(current.data.sys.sunset, tz)} />
                  <Detail icon={<span className="text-[10px] font-bold">AQI</span>} label={T.t("airQuality")}
                    value={air.data ? T.aqi(air.data.list[0].main.aqi) : "—"} />
                </section>

                <footer className="pt-2 text-center text-xs text-white/60">
                  {T.t("dataFrom")} · {T.t("updated")} {formatTimeL(current.data.dt, tz)}
                </footer>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/70">
        {icon}<span>{label}</span>
      </div>
      <div className="text-2xl font-light">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/70">{sub}</div>}
    </div>
  );
}

function LocationCard({ loc, active, units, onSelect, onRemove }: {
  loc: SavedLocation; active: boolean; units: "metric" | "imperial";
  onSelect: () => void; onRemove?: () => void;
}) {
  const q = useQuery({
    queryKey: ["current", loc.lat, loc.lon, units],
    queryFn: () => getCurrent(loc.lat, loc.lon, units),
    refetchOnWindowFocus: false,
  });
  return (
    <div onClick={onSelect}
      className={`group relative cursor-pointer rounded-2xl border p-3 backdrop-blur-xl transition ${
        active ? "border-white/40 bg-white/25" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{loc.name}</div>
          <div className="truncate text-xs capitalize text-white/70">
            {q.data?.weather[0]?.description ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {q.data && <span className="text-2xl font-light">{Math.round(q.data.main.temp)}°</span>}
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="rounded-full p-1 text-white/60 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function weatherGradient(id: number | undefined, night: boolean): string {
  if (!id) return night
    ? "linear-gradient(160deg, #0b1220 0%, #050914 100%)"
    : "linear-gradient(160deg, #7aa4c4 0%, #a8bccb 100%)";
  // Storm / rain
  if (id >= 200 && id < 600) {
    return night
      ? "linear-gradient(160deg, #1a2233 0%, #070a12 100%)"
      : "linear-gradient(160deg, #4b5f77 0%, #7f95ac 100%)";
  }
  // Snow
  if (id >= 600 && id < 700) {
    return night
      ? "linear-gradient(160deg, #2a3345 0%, #10131c 100%)"
      : "linear-gradient(160deg, #94a8bd 0%, #cfd9e4 100%)";
  }
  // Atmosphere (fog/haze)
  if (id >= 700 && id < 800) {
    return night
      ? "linear-gradient(160deg, #23262e 0%, #0e0f14 100%)"
      : "linear-gradient(160deg, #8a95a3 0%, #b7c0cc 100%)";
  }
  // Clear
  if (id === 800) {
    return night
      ? "linear-gradient(160deg, #0b1e4a 0%, #050914 100%)"
      : "linear-gradient(160deg, #3f8fd6 0%, #7fbde8 60%, #bfe0f5 100%)";
  }
  // Clouds
  return night
    ? "linear-gradient(160deg, #1b2436 0%, #090c15 100%)"
    : "linear-gradient(160deg, #6d8aa5 0%, #a3b6c8 100%)";
}
