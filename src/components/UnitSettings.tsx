import { useMemo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Check, CheckCircle2 } from "lucide-react";
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

  /* Measure before paint (layout effect) so the menu never flashes at
     the top-left corner on its first frame. */
  useLayoutEffect(() => {
    if (!open) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const itemH = 36;
    const menuHeight = options.length * itemH + 8;
    const maxW = Math.min(window.innerWidth - 32, 360);
    const menuWidth = Math.min(Math.max(rect.width * 0.6, 220), maxW);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const shouldFlip = spaceBelow < menuHeight + 20;
    setPos({
      top: shouldFlip ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(16, rect.right - menuWidth),
      width: menuWidth,
    });
  }, [open, options.length]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] hover:bg-detail-control"
      >
        <span className="text-detail-muted">{label}</span>
        <span className="flex items-center gap-1 text-detail-foreground">
          {displayLabel}
          <ChevronDown className={`h-4 w-4 text-detail-muted transition-transform ${open ? "rotate-180" : ""}`} />
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
          className="overflow-hidden rounded-2xl border border-detail-line bg-detail-menu py-1 shadow-2xl backdrop-blur-2xl"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            const optLabel = lang === "zh" ? opt.labelZh : opt.labelEn;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-detail-control ${isSelected ? "text-detail-foreground" : "text-detail-muted"}`}
              >
                <span className="w-4">
                  {isSelected && <Check className="h-4 w-4 text-detail-selected" />}
                </span>
                <span>{optLabel}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

export function UnitSettingsSheet({ onClose }: { onClose: () => void }) {
  const lang = useMemo(() => detectLang(), []);
  const T = useMemo(() => makeT(lang), [lang]);
  const settings = useUnitSettings();
  const [local, setLocal] = useState<UnitSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

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

  /* Render at document.body level: page containers run the .page-enter
     transform animation, and a transformed ancestor becomes the containing
     block for fixed children — which would misplace this overlay. */
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-5">
      <button
        type="button"
        className="detail-fade-enter absolute inset-0 bg-detail-overlay backdrop-blur-sm"
        onClick={onClose}
        aria-label={T.t("close")}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={T.t("unitSettings")}
        className="detail-sheet-enter relative z-10 flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] border border-detail-line bg-detail-panel text-detail-foreground shadow-2xl backdrop-blur-2xl sm:max-h-[86dvh] sm:rounded-[28px]"
      >
        <header className="relative flex h-16 shrink-0 items-center justify-center border-b border-detail-line px-16">
          <div className="flex min-w-0 items-center gap-2 text-lg font-semibold">
            <span className="truncate">{T.t("unitSettings")}</span>
            {saved && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 grid h-10 w-10 place-items-center rounded-full bg-detail-control text-detail-foreground transition hover:bg-detail-control-hover"
            aria-label={T.t("close")}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-9 pt-4 sm:px-6">
          {/* Temperature */}
          <div className="overflow-visible rounded-2xl border border-detail-line bg-detail-surface">
            <div className="px-4 pb-1 pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-detail-muted">
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
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] transition hover:bg-detail-control ${
                    i < TEMP_OPTIONS.length - 1 ? "border-b border-detail-line" : ""
                  }`}
                >
                  <span className={isSelected ? "text-detail-foreground" : "text-detail-muted"}>{label}</span>
                  <span className="w-4">
                    {isSelected && <Check className="h-4 w-4 text-detail-selected" />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Other Units */}
          <div>
            <h2 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wider text-detail-muted">
              {T.t("otherUnits")}
            </h2>
            <div className="overflow-visible rounded-2xl border border-detail-line bg-detail-surface">
              <UnitDropdown
                label={T.t("wind")}
                options={WIND_OPTIONS}
                value={local.wind}
                onChange={(v) => update("wind", v)}
                lang={lang}
              />
              <div className="h-px bg-detail-line" />
              <UnitDropdown
                label={T.t("precip")}
                options={PRECIP_OPTIONS}
                value={local.precipitation}
                onChange={(v) => update("precipitation", v)}
                lang={lang}
              />
              <div className="h-px bg-detail-line" />
              <UnitDropdown
                label={T.t("pressure")}
                options={PRESSURE_OPTIONS}
                value={local.pressure}
                onChange={(v) => update("pressure", v)}
                lang={lang}
              />
              <div className="h-px bg-detail-line" />
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
            className={`mt-5 w-full rounded-2xl border border-detail-line bg-detail-surface px-4 py-4 text-left transition hover:bg-detail-control active:scale-[0.99] ${
              isDefault ? "opacity-70" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-medium text-detail-foreground">{T.t("restoreDefaults")}</p>
              {isDefault && (
                <span className="rounded-full bg-detail-control px-2 py-0.5 text-xs text-detail-muted">
                  {lang === "zh" ? "已是默认" : "Default"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-detail-muted">{T.t("restoreDefaultsDesc")}</p>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}