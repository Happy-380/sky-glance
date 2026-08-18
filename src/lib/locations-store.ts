import { useEffect, useState } from "react";

export interface SavedLocation {
  id: string;
  name: string;
  country: string;
  state?: string;
  lat: number;
  lon: number;
}

const KEY = "vertex-weather-locations";
const ACTIVE_KEY = "vertex-weather-active";
const UNITS_KEY = "vertex-weather-units";
const EVT = "locations-changed";

/* 首次使用（本地从未写入过城市列表）时预置的默认城市。一旦用户增删，
   就写入真实存储并覆盖默认值。 */
const DEFAULT_LOCATIONS: SavedLocation[] = [
  { id: "39.904_116.407", name: "北京", country: "CN", lat: 39.9042, lon: 116.4074 },
  { id: "40.713_-74.006", name: "New York", country: "US", state: "NY", lat: 40.7128, lon: -74.006 },
];

function read(): SavedLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_LOCATIONS;
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function write(locs: SavedLocation[]) {
  localStorage.setItem(KEY, JSON.stringify(locs));
  window.dispatchEvent(new Event(EVT));
}

export function useLocations() {
  const [locs, setLocs] = useState<SavedLocation[]>([]);
  useEffect(() => {
    setLocs(read());
    const h = () => setLocs(read());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return locs;
}

export function addLocation(loc: SavedLocation) {
  const cur = read();
  if (cur.some((l) => l.id === loc.id)) return;
  write([...cur, loc]);
}

export function removeLocation(id: string) {
  write(read().filter((l) => l.id !== id));
}

export function makeId(lat: number, lon: number) {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

/* ---------- active location ---------- */

export function setActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new Event(EVT));
}

export function useActiveId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(localStorage.getItem(ACTIVE_KEY));
    const h = () => setId(localStorage.getItem(ACTIVE_KEY));
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return id;
}

/* ---------- units ---------- */

export type Units = "metric" | "imperial";

export type TempUnit = "celsius" | "fahrenheit" | "system";
export type WindUnit = "beaufort" | "mph" | "kmh" | "ms" | "kn";
export type PrecipUnit = "mm" | "in";
export type PressureUnit = "mbar" | "inHg" | "mmHg" | "hpa" | "kpa";
export type DistanceUnit = "mi" | "km";

export interface UnitSettings {
  temperature: TempUnit;
  wind: WindUnit;
  precipitation: PrecipUnit;
  pressure: PressureUnit;
  distance: DistanceUnit;
}

export const DEFAULT_UNITS: UnitSettings = {
  temperature: "system",
  wind: "beaufort",
  precipitation: "mm",
  pressure: "hpa",
  distance: "km",
};

const UNIT_SETTINGS_KEY = "vertex-weather-unit-settings";

export function getUnitSettings(): UnitSettings {
  try {
    const raw = localStorage.getItem(UNIT_SETTINGS_KEY);
    if (!raw) return DEFAULT_UNITS;
    return { ...DEFAULT_UNITS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_UNITS;
  }
}

export function setUnitSettings(s: UnitSettings) {
  localStorage.setItem(UNIT_SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(EVT));
}

export function useUnitSettings(): UnitSettings {
  /* Constant first value so SSR and hydration both start from the same state;
     localStorage is only read after mount (see useUnits above). */
  const [s, setS] = useState<UnitSettings>(DEFAULT_UNITS);
  useEffect(() => {
    setS(getUnitSettings());
    const h = () => setS(getUnitSettings());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return s;
}

/* ---------- unit conversion helpers ---------- */

const BEAUFORT_BANDS = [0.3, 1.5, 3.3, 5.4, 7.9, 10.7, 13.8, 17.1, 20.7, 24.4, 28.4, 32.6];

export function toBeaufort(ms: number): number {
  for (let i = 0; i < BEAUFORT_BANDS.length; i++) {
    if (ms < BEAUFORT_BANDS[i]) return i;
  }
  return 12;
}

export function convertWind(ms: number, unit: WindUnit): { value: number; label: string } {
  switch (unit) {
    case "beaufort":
      return { value: toBeaufort(ms), label: "" };
    case "mph":
      return { value: ms * 2.23694, label: "mph" };
    case "kmh":
      return { value: ms * 3.6, label: "km/h" };
    case "kn":
      return { value: ms * 1.94384, label: "kn" };
    case "ms":
    default:
      return { value: ms, label: "m/s" };
  }
}

export function formatWind(ms: number, unit: WindUnit, lang: "zh" | "en"): string {
  const { value, label } = convertWind(ms, unit);
  const rounded = unit === "beaufort" ? value : Math.round(value);
  if (unit === "beaufort") {
    return lang === "zh" ? `${rounded} 级` : `${rounded}`;
  }
  return lang === "zh" ? `${rounded} ${label}` : `${rounded} ${label}`;
}

export function windUnitLabel(unit: WindUnit, lang: "zh" | "en"): string {
  const map: Record<WindUnit, { zh: string; en: string }> = {
    beaufort: { zh: "级", en: "" },
    mph: { zh: "英里/时", en: "mph" },
    kmh: { zh: "公里/时", en: "km/h" },
    ms: { zh: "米/秒", en: "m/s" },
    kn: { zh: "节", en: "kn" },
  };
  return map[unit][lang];
}

export function convertPrecip(mm: number, unit: PrecipUnit): { value: number; label: string } {
  if (unit === "in") {
    return { value: mm / 25.4, label: "in" };
  }
  return { value: mm, label: "mm" };
}

export function formatPrecip(mm: number, unit: PrecipUnit): string {
  const { value, label } = convertPrecip(mm, unit);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${label}`;
}

export function convertPressure(hpa: number, unit: PressureUnit): { value: number; label: string } {
  switch (unit) {
    case "mbar":
      return { value: hpa, label: "mbar" };
    case "inHg":
      return { value: hpa / 33.864, label: "inHg" };
    case "mmHg":
      return { value: hpa * 0.750062, label: "mmHg" };
    case "kpa":
      return { value: hpa / 10, label: "kPa" };
    case "hpa":
    default:
      return { value: hpa, label: "hPa" };
  }
}

export function formatPressure(hpa: number, unit: PressureUnit): string {
  const { value, label } = convertPressure(hpa, unit);
  return `${Math.round(value)} ${label}`;
}

export function convertDistance(km: number, unit: DistanceUnit): { value: number; label: string } {
  if (unit === "mi") {
    return { value: km * 0.621371, label: "mi" };
  }
  return { value: km, label: "km" };
}

export function formatDistance(km: number, unit: DistanceUnit): string {
  const { value, label } = convertDistance(km, unit);
  return `${value.toFixed(1)} ${label}`;
}

export function resolveTemperatureUnit(settings: UnitSettings, systemUnits: Units): "c" | "f" {
  if (settings.temperature === "celsius") return "c";
  if (settings.temperature === "fahrenheit") return "f";
  return systemUnits === "metric" ? "c" : "f";
}

export function setUnitsPref(u: Units) {
  localStorage.setItem(UNITS_KEY, u);
  window.dispatchEvent(new Event(EVT));
}

export function useUnits(): Units {
  const [u, setU] = useState<Units>("metric");
  useEffect(() => {
    const get = () => (localStorage.getItem(UNITS_KEY) as Units) || "metric";
    setU(get());
    const h = () => setU(get());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return u;
}
