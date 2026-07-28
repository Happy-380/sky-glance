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
  window.dispatchEvent(new Event("locations-changed"));
}

export function useLocations() {
  const [locs, setLocs] = useState<SavedLocation[]>([]);
  useEffect(() => {
    setLocs(read());
    const h = () => setLocs(read());
    window.addEventListener("locations-changed", h);
    return () => window.removeEventListener("locations-changed", h);
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
