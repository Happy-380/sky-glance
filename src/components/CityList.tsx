import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { Search, Loader2, Trash2, MoreHorizontal, Check, Pencil, ChevronLeft } from "lucide-react";
import { geocode, getCurrent, iconUrl, type GeoCity } from "@/lib/weather";
import {
  useLocations, useUnits, setUnitsPref, addLocation, removeLocation,
  setActiveId, makeId, type SavedLocation,
} from "@/lib/locations-store";
import { detectLang, makeT, formatTimeL } from "@/lib/i18n";

export function CityList() {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const owmLang = lang === "zh" ? "zh_cn" : "en";
  const navigate = useNavigate();

  const locations = useLocations();
  const units = useUnits();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const search = useQuery({
    queryKey: ["geocode", query],
    queryFn: () => geocode(query),
    enabled: query.trim().length >= 2,
  });

  function pick(c: GeoCity) {
    const loc: SavedLocation = {
      id: makeId(c.lat, c.lon),
      name: c.name, country: c.country, state: c.state, lat: c.lat, lon: c.lon,
    };
    addLocation(loc);
    setActiveId(loc.id);
    setQuery("");
    navigate({ to: "/" });
  }

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden text-white"
      style={{ background: "linear-gradient(160deg, #14324f 0%, #0a1b2e 100%)" }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-2xl min-w-0 flex-col px-4 pb-10 pt-4 md:px-6">
        <header className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/"
            className="shrink-0 rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
            aria-label={T.t("back")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate text-3xl font-bold tracking-tight">{T.t("weatherTitle")}</h1>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
              aria-label="Menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-white/15 bg-black/60 text-sm backdrop-blur-2xl shadow-2xl">
                <button
                  onClick={() => { setEditing((v) => !v); setMenuOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10"
                >
                  <Pencil className="h-4 w-4" />
                  {editing ? T.t("done") : T.t("editList")}
                </button>
                <div className="h-px bg-white/10" />
                <MenuRow label={T.t("celsius")} mark="°C" checked={units === "metric"}
                  onClick={() => { setUnitsPref("metric"); setMenuOpen(false); }} />
                <MenuRow label={T.t("fahrenheit")} mark="°F" checked={units === "imperial"}
                  onClick={() => { setUnitsPref("imperial"); setMenuOpen(false); }} />
              </div>
            )}
          </div>
        </header>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={T.t("searchPlaceholder")}
            className="w-full rounded-full border border-white/15 bg-white/10 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/60 backdrop-blur-xl outline-none focus:border-white/30"
          />
          {query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-black/70 backdrop-blur-xl shadow-2xl">
              {search.isFetching && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/70">
                  <Loader2 className="h-4 w-4 animate-spin" /> {T.t("searching")}
                </div>
              )}
              {!search.isFetching && !search.data?.length && (
                <div className="px-4 py-3 text-sm text-white/60">{T.t("noResults")}</div>
              )}
              {search.data?.map((c, i) => (
                <button
                  key={`${c.lat}_${c.lon}_${i}`}
                  onClick={() => pick(c)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                >
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-white/60">{c.state ? `${c.state}, ` : ""}{c.country}</span>
                  </span>
                  <span className="text-xs text-white/60">{T.t("add")}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {locations.length === 0 && (
            <p className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              {T.t("noSaved")}
            </p>
          )}
          {locations.map((loc) => (
            <CityCard
              key={loc.id}
              loc={loc}
              units={units}
              owmLang={owmLang}
              editing={editing}
              T={T}
              onOpen={() => { setActiveId(loc.id); navigate({ to: "/" }); }}
              onRemove={() => removeLocation(loc.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuRow({ label, mark, checked, onClick }: {
  label: string; mark: string; checked: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10">
      <span className="w-4">{checked && <Check className="h-4 w-4" />}</span>
      <span className="w-6 text-white/80">{mark}</span>
      <span>{label}</span>
    </button>
  );
}

function CityCard({ loc, units, owmLang, editing, T, onOpen, onRemove }: {
  loc: SavedLocation;
  units: "metric" | "imperial";
  owmLang: string;
  editing: boolean;
  T: ReturnType<typeof makeT>;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const q = useQuery({
    queryKey: ["current", loc.lat, loc.lon, units, owmLang],
    queryFn: () => getCurrent(loc.lat, loc.lon, units, owmLang),
    refetchOnWindowFocus: false,
  });
  const d = q.data;
  return (
    <div className="flex items-center gap-2">
      {editing && (
        <button
          onClick={onRemove}
          className="rounded-full bg-red-500/80 p-2 text-white"
          aria-label="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={onOpen}
        className="relative min-w-0 flex-1 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-4 text-left backdrop-blur-xl transition hover:bg-white/15"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xl font-semibold">{loc.name}</div>
            <div className="text-xs text-white/70">
              {d ? formatTimeL(d.dt, d.timezone) : "—"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {d && <img src={iconUrl(d.weather[0].icon)} alt="" className="h-8 w-8" />}
            <span className="text-4xl font-light">{d ? Math.round(d.main.temp) : "—"}°</span>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 text-sm">
          <span className="truncate capitalize text-white/85">
            {d?.weather[0].description ?? ""}
          </span>
          {d && (
            <span className="shrink-0 text-white/85">
              {T.t("high")} {Math.round(d.main.temp_max)}° {T.t("low")} {Math.round(d.main.temp_min)}°
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
