import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, Plus, Trash2, Loader2, Wind, Droplets, Eye, Gauge, Sunrise, Sunset, Thermometer } from "lucide-react";
import {
  geocode,
  getCurrent,
  getForecast,
  getAir,
  iconUrl,
  aqiLabel,
  degToCompass,
  formatHour,
  formatDay,
  formatTime,
  summarizeDaily,
  type GeoCity,
} from "@/lib/weather";
import {
  addLocation,
  removeLocation,
  useLocations,
  makeId,
  type SavedLocation,
} from "@/lib/locations-store";

const DEFAULT: SavedLocation = {
  id: makeId(40.7128, -74.006),
  name: "New York",
  country: "US",
  lat: 40.7128,
  lon: -74.006,
};

export function WeatherApp() {
  const locations = useLocations();
  const [active, setActive] = useState<SavedLocation>(DEFAULT);
  const [units, setUnits] = useState<"metric" | "imperial">("metric");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const activeList = useMemo(
    () => (locations.length ? locations : [DEFAULT]),
    [locations],
  );

  useEffect(() => {
    if (!locations.length) return;
    if (!locations.some((l) => l.id === active.id)) {
      setActive(locations[0]);
    }
  }, [locations, active.id]);

  const current = useQuery({
    queryKey: ["current", active.lat, active.lon, units],
    queryFn: () => getCurrent(active.lat, active.lon, units),
  });
  const forecast = useQuery({
    queryKey: ["forecast", active.lat, active.lon, units],
    queryFn: () => getForecast(active.lat, active.lon, units),
  });
  const air = useQuery({
    queryKey: ["air", active.lat, active.lon],
    queryFn: () => getAir(active.lat, active.lon),
  });

  const search = useQuery({
    queryKey: ["geocode", query],
    queryFn: () => geocode(query),
    enabled: query.trim().length >= 2,
  });

  const tz = current.data?.timezone ?? 0;
  const daily = forecast.data ? summarizeDaily(forecast.data.list, tz) : [];
  const hourly = forecast.data?.list.slice(0, 8) ?? [];
  const tempUnit = units === "metric" ? "°" : "°";
  const windUnit = units === "metric" ? "m/s" : "mph";

  const bg = weatherGradient(current.data?.weather[0]?.id, current.data?.weather[0]?.icon);

  function pickCity(c: GeoCity) {
    const loc: SavedLocation = {
      id: makeId(c.lat, c.lon),
      name: c.name,
      country: c.country,
      state: c.state,
      lat: c.lat,
      lon: c.lon,
    };
    addLocation(loc);
    setActive(loc);
    setQuery("");
    setSearchOpen(false);
  }

  return (
    <div className="min-h-screen text-white transition-colors" style={{ background: bg }}>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        {/* Top bar */}
        <header className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search for a city…"
              className="w-full rounded-full border border-white/15 bg-white/10 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/50 backdrop-blur-xl outline-none focus:border-white/30 focus:bg-white/15"
            />
            {searchOpen && query.trim().length >= 2 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-black/60 backdrop-blur-xl shadow-2xl">
                {search.isFetching && (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/70">
                    <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                  </div>
                )}
                {!search.isFetching && (!search.data || search.data.length === 0) && (
                  <div className="px-4 py-3 text-sm text-white/60">No cities found.</div>
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
                    <Plus className="h-4 w-4 text-white/60" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1 text-xs backdrop-blur-xl">
            <button
              onClick={() => setUnits("metric")}
              className={`rounded-full px-3 py-1.5 transition ${units === "metric" ? "bg-white text-black" : "text-white/80"}`}
            >
              °C
            </button>
            <button
              onClick={() => setUnits("imperial")}
              className={`rounded-full px-3 py-1.5 transition ${units === "imperial" ? "bg-white text-black" : "text-white/80"}`}
            >
              °F
            </button>
          </div>
        </header>

        {/* Main layout */}
        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar: saved locations */}
          <aside className="order-2 lg:order-1">
            <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-white/60">
              Saved Locations
            </h2>
            <div className="flex flex-col gap-2">
              {activeList.map((loc) => (
                <LocationCard
                  key={loc.id}
                  loc={loc}
                  active={loc.id === active.id}
                  units={units}
                  onSelect={() => setActive(loc)}
                  onRemove={
                    locations.length > 0 ? () => {
                      removeLocation(loc.id);
                    } : undefined
                  }
                />
              ))}
              {locations.length === 0 && (
                <p className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                  Search a city above and tap it to save.
                </p>
              )}
            </div>
          </aside>

          {/* Main content */}
          <main className="order-1 flex flex-col gap-6 lg:order-2">
            {current.isLoading && (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-white/70" />
              </div>
            )}
            {current.isError && (
              <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm">
                Failed to load weather. Check your API key or try again.
              </div>
            )}
            {current.data && (
              <>
                {/* Hero */}
                <section className="text-center">
                  <div className="flex items-center justify-center gap-1 text-white/80">
                    <MapPin className="h-4 w-4" />
                    <h1 className="text-lg font-medium">
                      {active.name}
                      {active.state ? `, ${active.state}` : ""}, {active.country}
                    </h1>
                  </div>
                  <div className="mt-2 flex items-start justify-center">
                    <span className="text-8xl font-thin tracking-tighter md:text-9xl">
                      {Math.round(current.data.main.temp)}
                    </span>
                    <span className="mt-4 text-3xl font-thin text-white/80 md:text-4xl">
                      {tempUnit}
                    </span>
                  </div>
                  <p className="text-lg capitalize text-white/85">
                    {current.data.weather[0].description}
                  </p>
                  <p className="text-sm text-white/70">
                    H: {Math.round(current.data.main.temp_max)}° · L:{" "}
                    {Math.round(current.data.main.temp_min)}° · Feels{" "}
                    {Math.round(current.data.main.feels_like)}°
                  </p>
                </section>

                {/* Hourly */}
                <section className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                  <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-white/60">
                    Next 24 Hours
                  </h3>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {hourly.map((h) => (
                      <div
                        key={h.dt}
                        className="flex min-w-[64px] flex-col items-center gap-1 rounded-2xl bg-white/5 px-3 py-3"
                      >
                        <span className="text-xs text-white/70">
                          {formatHour(h.dt, tz)}
                        </span>
                        <img
                          src={iconUrl(h.weather[0].icon)}
                          alt=""
                          className="h-10 w-10"
                        />
                        <span className="text-sm font-medium">
                          {Math.round(h.main.temp)}°
                        </span>
                        {h.pop > 0 && (
                          <span className="text-[10px] text-sky-200">
                            {Math.round(h.pop * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Daily */}
                <section className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-white/60">
                    {daily.length}-Day Forecast
                  </h3>
                  <div className="divide-y divide-white/10">
                    {daily.map((d, i) => (
                      <div
                        key={d.dt}
                        className="grid grid-cols-[64px_40px_1fr_auto] items-center gap-3 py-2.5"
                      >
                        <span className="text-sm text-white/85">
                          {i === 0 ? "Today" : formatDay(d.dt, tz)}
                        </span>
                        <img src={iconUrl(d.icon)} alt="" className="h-8 w-8" />
                        <span className="text-xs capitalize text-white/60">
                          {d.description}
                        </span>
                        <span className="text-sm tabular-nums">
                          <span className="text-white/60">{Math.round(d.min)}°</span>
                          <span className="mx-2 text-white/40">·</span>
                          <span>{Math.round(d.max)}°</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Details grid */}
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Detail
                    icon={<Thermometer className="h-4 w-4" />}
                    label="Feels Like"
                    value={`${Math.round(current.data.main.feels_like)}${tempUnit}`}
                  />
                  <Detail
                    icon={<Wind className="h-4 w-4" />}
                    label="Wind"
                    value={`${current.data.wind.speed.toFixed(1)} ${windUnit}`}
                    sub={degToCompass(current.data.wind.deg)}
                  />
                  <Detail
                    icon={<Droplets className="h-4 w-4" />}
                    label="Humidity"
                    value={`${current.data.main.humidity}%`}
                  />
                  <Detail
                    icon={<Gauge className="h-4 w-4" />}
                    label="Pressure"
                    value={`${current.data.main.pressure} hPa`}
                  />
                  <Detail
                    icon={<Eye className="h-4 w-4" />}
                    label="Visibility"
                    value={`${(current.data.visibility / 1000).toFixed(1)} km`}
                  />
                  <Detail
                    icon={<Sunrise className="h-4 w-4" />}
                    label="Sunrise"
                    value={formatTime(current.data.sys.sunrise, tz)}
                  />
                  <Detail
                    icon={<Sunset className="h-4 w-4" />}
                    label="Sunset"
                    value={formatTime(current.data.sys.sunset, tz)}
                  />
                  <Detail
                    icon={<span className="text-xs font-bold">AQI</span>}
                    label="Air Quality"
                    value={air.data ? aqiLabel(air.data.list[0].main.aqi) : "—"}
                    sub={
                      air.data ? `PM2.5 ${air.data.list[0].components.pm2_5.toFixed(0)}` : undefined
                    }
                  />
                </section>

                <footer className="pb-4 pt-2 text-center text-xs text-white/50">
                  Data from OpenWeather · Updated{" "}
                  {new Date(current.data.dt * 1000).toLocaleTimeString()}
                </footer>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-white/60">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-light">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-white/60">{sub}</div>}
    </div>
  );
}

function LocationCard({
  loc,
  active,
  units,
  onSelect,
  onRemove,
}: {
  loc: SavedLocation;
  active: boolean;
  units: "metric" | "imperial";
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const q = useQuery({
    queryKey: ["current", loc.lat, loc.lon, units],
    queryFn: () => getCurrent(loc.lat, loc.lon, units),
  });
  return (
    <div
      onClick={onSelect}
      className={`group relative cursor-pointer rounded-2xl border p-3 backdrop-blur-xl transition ${
        active
          ? "border-white/40 bg-white/20"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{loc.name}</div>
          <div className="truncate text-xs text-white/60">
            {q.data?.weather[0]?.description ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {q.data && (
            <span className="text-2xl font-light">
              {Math.round(q.data.main.temp)}°
            </span>
          )}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded-full p-1 text-white/50 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
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

function weatherGradient(id?: number, icon?: string): string {
  const night = icon?.endsWith("n");
  if (!id) return "linear-gradient(160deg, #1e3a8a 0%, #0f172a 100%)";
  if (id >= 200 && id < 300) return "linear-gradient(160deg, #1e293b 0%, #0b1220 100%)"; // storm
  if (id >= 300 && id < 600) return "linear-gradient(160deg, #334155 0%, #0f172a 100%)"; // rain
  if (id >= 600 && id < 700) return "linear-gradient(160deg, #64748b 0%, #1e293b 100%)"; // snow
  if (id >= 700 && id < 800) return "linear-gradient(160deg, #475569 0%, #1f2937 100%)"; // atmo
  if (id === 800)
    return night
      ? "linear-gradient(160deg, #0b1e4a 0%, #050914 100%)"
      : "linear-gradient(160deg, #2563eb 0%, #0ea5e9 60%, #7dd3fc 100%)"; // clear
  if (id > 800)
    return night
      ? "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)"
      : "linear-gradient(160deg, #3b82f6 0%, #64748b 100%)"; // clouds
  return "linear-gradient(160deg, #1e3a8a 0%, #0f172a 100%)";
}
