import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronDown, Check, CheckCircle2 } from "lucide-react";
import {
  useUnitSettings, setUnitSettings,
  DEFAULT_UNITS,
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
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);
  const displayLabel = lang === "zh" ? current?.labelZh : current?.labelEn;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target) && menuRef.current && !menuRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = options.length * 44 + 16;
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const shouldFlip = spaceBelow < menuHeight + 20;
    setPos({
      top: shouldFlip ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, [open, options.length]);

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
      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
          className="overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1e] shadow-2xl backdrop-blur-xl"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}

export function UnitSettingsPage() {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const navigate = useNavigate();
  const settings = useUnitSettings();
  const [local, setLocal] = useState<UnitSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  function update<K extends keyof UnitSettings>(key: K, value: UnitSettings[K]) {
    const next = { ...local, [key]: value };
    setLocal(next);
    setUnitSettings(next);
  }

  function restoreDefaults() {
    setLocal(DEFAULT_UNITS);
    setUnitSettings(DEFAULT_UNITS);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const isDefault =
    local.temperature === DEFAULT_UNITS.temperature &&
    local.wind === DEFAULT_UNITS.wind &&
    local.precipitation === DEFAULT_UNITS.precipitation &&
    local.pressure === DEFAULT_UNITS.pressure &&
    local.distance === DEFAULT_UNITS.distance;

  return (
    <div
      className="min-h-screen w-full overflow-x-hidden text-white"
      style={{ background: "linear-gradient(160deg, #14324f 0%, #0a1b2e 100%)" }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-2xl min-w-0 flex-col px-4 pb-20 pt-4 md:px-6">
        <header className="mb-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="shrink-0 rounded-full border border-white/15 bg-white/10 p-2.5 backdrop-blur-xl"
            aria-label={T.t("back")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h1 className="truncate text-center text-2xl font-bold tracking-tight">
            {T.t("unitSettings")}
          </h1>
          <div className="flex h-10 w-10 items-center justify-center">
            {saved && <CheckCircle2 className="h-5 w-5 text-green-400" />}
          </div>
        </header>

        <div className="flex flex-col gap-4">
          {/* Temperature */}
          <div className="overflow-visible rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-xl">
            <div className="px-4 pt-3 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
                {lang === "zh" ? "气温" : "Temperature"}
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
            <div className="overflow-visible rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-xl">
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
            className={`group rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-4 text-left backdrop-blur-xl transition hover:bg-white/10 active:scale-[0.99] ${
              isDefault ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium text-white">{T.t("restoreDefaults")}</p>
              {isDefault && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {lang === "zh" ? "已是默认" : "Default"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/50">{T.t("restoreDefaultsDesc")}</p>
          </button>
        </div>
      </div>
    </div>
  );
}
