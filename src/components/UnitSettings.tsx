import { useMemo, useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronDown, Check } from "lucide-react";
import {
  useUnitSettings, setUnitSettings, getUnitSettings,
  type UnitSettings, type TempUnit, type WindUnit,
  type PrecipUnit, type PressureUnit, type DistanceUnit,
} from "@/lib/locations-store";
import { detectLang, makeT } from "@/lib/i18n";

const TEMP_OPTIONS: { value: TempUnit; labelZh: string; labelEn: string }[] = [
  { value: "celsius", labelZh: "°C（摄氏度）", labelEn: "°C" },
  { value: "fahrenheit", labelZh: "°F（华氏度）", labelEn: "°F" },
  { value: "system", labelZh: "使用系统设置（°C）", labelEn: "Use System Settings (°C)" },
];

const WIND_OPTIONS: { value: WindUnit; labelZh: string; labelEn: string }[] = [
  { value: "beaufort", labelZh: "级", labelEn: "Level" },
  { value: "mph", labelZh: "英里/小时 (mi/h)", labelEn: "Miles per hour (mi/h)" },
  { value: "kmh", labelZh: "公里/时 (km/h)", labelEn: "Kilometers per hour (km/h)" },
  { value: "ms", labelZh: "米/秒 (m/s)", labelEn: "Meters per second (m/s)" },
  { value: "kn", labelZh: "节 (kn)", labelEn: "Knots (kn)" },
];

const PRECIP_OPTIONS: { value: PrecipUnit; labelZh: string; labelEn: string }[] = [
  { value: "mm", labelZh: "毫米和厘米 (mm, cm)", labelEn: "Millimeters and centimeters (mm, cm)" },
  { value: "in", labelZh: "英寸 (in)", labelEn: "Inches (in)" },
];

const PRESSURE_OPTIONS: { value: PressureUnit; labelZh: string; labelEn: string }[] = [
  { value: "hpa", labelZh: "百帕 (hPa)", labelEn: "Hectopascal (hPa)" },
  { value: "mbar", labelZh: "毫巴 (mbar)", labelEn: "Millibar (mbar)" },
  { value: "inHg", labelZh: "英寸汞柱 (inHg)", labelEn: "Inches of mercury (inHg)" },
  { value: "mmHg", labelZh: "毫米汞柱 (mmHg)", labelEn: "Millimeters of mercury (mmHg)" },
  { value: "kpa", labelZh: "千帕 (kPa)", labelEn: "Kilopascal (kPa)" },
];

const DISTANCE_OPTIONS: { value: DistanceUnit; labelZh: string; labelEn: string }[] = [
  { value: "km", labelZh: "公里 (km)", labelEn: "Kilometers (km)" },
  { value: "mi", labelZh: "英里 (mi)", labelEn: "Miles (mi)" },
];

function UnitDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  lang,
}: {
  label: string;
  options: { value: T; labelZh: string; labelEn: string }[];
  value: T;
  onChange: (v: T) => void;
  lang: "zh" | "en";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const displayLabel = lang === "zh" ? current?.labelZh : current?.labelEn;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] hover:bg-white/5"
      >
        <span className="text-white/60">{label}</span>
        <span className="flex items-center gap-1 text-white">
          {displayLabel}
          <ChevronDown className={`h-4 w-4 text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1e] shadow-2xl backdrop-blur-xl">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const optLabel = lang === "zh" ? opt.labelZh : opt.labelEn;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-white/10"
              >
                <span className="w-4">
                  {isSelected && <Check className="h-4 w-4 text-white" />}
                </span>
                <span className={isSelected ? "text-white" : "text-white/60"}>{optLabel}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UnitSettingsPage() {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const settings = useUnitSettings();
  const [local, setLocal] = useState<UnitSettings>(settings);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  function update<K extends keyof UnitSettings>(key: K, value: UnitSettings[K]) {
    const next = { ...local, [key]: value };
    setLocal(next);
    setUnitSettings(next);
  }

  function restoreDefaults() {
    const defaults = getUnitSettings();
    setLocal(defaults);
    setUnitSettings(defaults);
  }

  const isDefault =
    local.temperature === "system" &&
    local.wind === "beaufort" &&
    local.precipitation === "mm" &&
    local.pressure === "hpa" &&
    local.distance === "km";

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{ background: "linear-gradient(160deg, #14324f 0%, #0a1b2e 100%)" }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-2xl min-w-0 flex-col px-4 pb-10 pt-4 md:px-6">
        <header className="mb-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/"
            className="shrink-0 rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
            aria-label={T.t("back")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="truncate text-center text-2xl font-bold tracking-tight">
            {T.t("unitSettings")}
          </h1>
          <div className="shrink-0 w-10" />
        </header>

        <div className="flex flex-col gap-4">
          {/* Temperature */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-xl">
            <div className="px-4 pt-3 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                {T.t("celsius")}
              </span>
            </div>
            {TEMP_OPTIONS.map((opt, i) => {
              const isSelected = opt.value === local.temperature;
              const label = lang === "zh" ? opt.labelZh : opt.labelEn;
              return (
                <button
                  key={opt.value}
                  onClick={() => update("temperature", opt.value)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] hover:bg-white/5 ${
                    i < TEMP_OPTIONS.length - 1 ? "border-b border-white/[0.06]" : ""
                  }`}
                >
                  <span className={isSelected ? "text-white" : "text-white/60"}>{label}</span>
                  <span className="w-4">
                    {isSelected && <Check className="h-4 w-4 text-blue-400" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Other Units */}
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-white/50">
              {T.t("otherUnits")}
            </h2>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-xl">
              <UnitDropdown
                label={T.t("wind")}
                options={WIND_OPTIONS}
                value={local.wind}
                onChange={(v) => update("wind", v)}
                lang={lang}
              />
              <div className="h-px bg-white/[0.06]" />
              <UnitDropdown
                label={T.t("precip")}
                options={PRECIP_OPTIONS}
                value={local.precipitation}
                onChange={(v) => update("precipitation", v)}
                lang={lang}
              />
              <div className="h-px bg-white/[0.06]" />
              <UnitDropdown
                label={T.t("pressure")}
                options={PRESSURE_OPTIONS}
                value={local.pressure}
                onChange={(v) => update("pressure", v)}
                lang={lang}
              />
              <div className="h-px bg-white/[0.06]" />
              <UnitDropdown
                label={T.t("distance")}
                options={DISTANCE_OPTIONS}
                value={local.distance}
                onChange={(v) => update("distance", v)}
                lang={lang}
              />
            </div>
          </div>

          {/* Restore Defaults */}
          <button
            onClick={restoreDefaults}
            className={`rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-4 text-left backdrop-blur-xl transition hover:bg-white/10 ${
              isDefault ? "opacity-40" : ""
            }`}
            disabled={isDefault}
          >
            <p className="text-[15px] font-medium text-white">{T.t("restoreDefaults")}</p>
            <p className="mt-1 text-sm text-white/50">{T.t("restoreDefaultsDesc")}</p>
          </button>
        </div>
      </div>
    </div>
  );
}
