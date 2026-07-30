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

function read(): SavedLocation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
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
