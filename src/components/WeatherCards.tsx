import {
  Thermometer, Wind, Droplets, Eye, Gauge, Sunset as SunsetIcon,
  TrendingUp, CloudRain, Cloud,
} from "lucide-react";
import type { CurrentWeather, DailySummary } from "@/lib/weather";
import { degToCompass } from "@/lib/weather";
import { formatTimeL } from "@/lib/i18n";
import type { MetricKey } from "@/components/MetricDetail";
import {
  convertWind, windUnitLabel, convertPressure, convertDistance,
  formatWind, resolveTemperatureUnit,
  type UnitSettings,
} from "@/lib/locations-store";

type T = ReturnType<typeof import("@/lib/i18n").makeT>;

/* Container-query sizes are expressed in cqh so 1×1 and 2×1 tiles scale
   identically (a 2×1 tile is half as tall as it is wide). */
const FS = {
  label: "clamp(10px, 6cqh, 15px)",
  big: "clamp(18px, 17cqh, 40px)",
  body: "clamp(9px, 5.5cqh, 14px)",
  tiny: "clamp(8px, 5cqh, 12px)",
};

function Card({
  title, icon, span = 1, onClick, children,
}: { title: string; icon: React.ReactNode; span?: 1 | 2; onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ containerType: "size" }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`min-h-0 min-w-0 self-start overflow-hidden rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl ${
        onClick ? "cursor-pointer transition hover:bg-white/15 active:scale-[0.98]" : ""
      } ${span === 2 ? "col-span-2 aspect-[2/1]" : "aspect-square"}`}
    >
      <div className="flex h-full w-full min-h-0 min-w-0 flex-col p-[5cqh]">
        <div
          className="mb-[3cqh] flex items-center gap-1.5 font-medium text-white/70"
          style={{ fontSize: FS.label }}
        >
          <span className="flex shrink-0 items-center [&>span>svg]:h-[1.15em] [&>span>svg]:w-[1.15em]">
            {icon}
          </span>
          <span className="truncate">{title}</span>
        </div>
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${span === 2 ? "justify-center gap-[3cqh]" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}


function Big({ children }: { children: React.ReactNode }) {
  return (
    <div className="truncate font-light leading-none" style={{ fontSize: FS.big }}>
      {children}
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center">{children}</span>;
}

function WindDial({ deg, value }: { deg: number; value: string }) {
  return (
    <div className="relative aspect-square h-[68cqh] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {Array.from({ length: 60 }).map((_, i) => (
          <line
            key={i}
            x1="50" y1="6" x2="50" y2={i % 15 === 0 ? "13" : "10"}
            stroke="rgba(255,255,255,0.35)" strokeWidth="1"
            transform={`rotate(${i * 6} 50 50)`}
          />
        ))}
        <circle cx="50" cy="50" r="26" fill="rgba(255,255,255,0.10)" />
        <g transform={`rotate(${deg} 50 50)`}>
          <path d="M50 16 L45 27 L50 24 L55 27 Z" fill="white" />
          <circle cx="50" cy="84" r="3.5" fill="white" />
        </g>
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-medium"
        style={{ fontSize: "clamp(12px, 14cqh, 26px)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SunArc({ progress }: { progress: number }) {
  const p = Math.min(Math.max(progress, 0), 1);
  const x = 4 + p * 92;
  const y = 30 - Math.sin(p * Math.PI) * 22;
  return (
    <svg viewBox="0 0 100 44" className="mt-[3cqh] h-[22cqh] w-full">
      <path d="M4 30 Q50 -10 96 30" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1="0" y1="34" x2="100" y2="34" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <circle cx={x} cy={y} r="3.5" fill="white" />
    </svg>
  );
}

export function WeatherCards({
  cur, daily, T, lang, tz, units, unitSettings, air, pop, todayHi, pressureTrend = 0, onOpen,
}: {
  onOpen?: (m: MetricKey) => void;
  cur: CurrentWeather;
  daily: DailySummary[];
  T: T;
  lang: "zh" | "en";
  tz: number;
  units: "metric" | "imperial";
  unitSettings: UnitSettings;
  air?: { aqi: number; pm2_5: number; pm10: number; o3: number };
  pop: number;
  todayHi: number;
  pressureTrend?: number;
}) {
  const tempUnit = resolveTemperatureUnit(unitSettings, units);
  const toDisplayTemp = (celsius: number) => {
    if (tempUnit === "f") return Math.round(celsius * 9 / 5 + 32);
    return Math.round(celsius);
  };
  const tempSuffix = tempUnit === "f" ? "°F" : "°";
  const windUnitStr = windUnitLabel(unitSettings.wind, lang);
  const avgHigh = daily.length
    ? daily.reduce((s, d) => s + d.max, 0) / daily.length
    : cur.main.temp_max;
  const diff = Math.round(todayHi - avgHigh);
  const feelsDiff = cur.main.feels_like - cur.main.temp;
  const now = cur.dt;
  const sunProgress = (now - cur.sys.sunrise) / (cur.sys.sunset - cur.sys.sunrise || 1);
  const aqiPct = air ? ((air.aqi - 1) / 4) * 100 : 0;

  return (
    <section className="app-fade-up mx-auto grid w-full max-w-[836px] grid-cols-2 items-start gap-2.5 md:grid-cols-4">
      {/* 平均 */}
      <Card onClick={() => onOpen?.("conditions")} title={T.t("average")} icon={<Icon><TrendingUp /></Icon>}>
        <Big>{diff >= 0 ? "+" : ""}{toDisplayTemp(diff)}{tempSuffix}</Big>
        <p className="mt-[3cqh] text-white/85" style={{ fontSize: FS.body }}>
          {diff >= 0 ? T.t("aboveAvgHigh") : T.t("belowAvgHigh")}
        </p>
        <div className="mt-auto space-y-[2cqh] pt-[4cqh] text-white/70" style={{ fontSize: FS.body }}>
          <div className="flex justify-between gap-2">
            <span>{T.t("todayLabel")}</span>
            <span className="font-medium text-white">{T.t("maxShort")} {toDisplayTemp(todayHi)}{tempSuffix}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span>{T.t("avgLabel")}</span>
            <span className="font-medium text-white">{T.t("maxShort")} {toDisplayTemp(avgHigh)}{tempSuffix}</span>
          </div>
        </div>
      </Card>

      {/* 体感温度 */}
      <Card onClick={() => onOpen?.("conditions")} title={T.t("feelsLike")} icon={<Icon><Thermometer /></Icon>}>
        <Big>{toDisplayTemp(cur.main.feels_like)}{tempSuffix}</Big>
        <p className="mt-auto pt-[4cqh] text-white/85" style={{ fontSize: FS.body }}>
          {Math.abs(feelsDiff) < 1
            ? T.t("feelsSame")
            : feelsDiff > 0
              ? T.t("feelsWarmer")
              : T.t("feelsCooler")}
        </p>
      </Card>

      {/* 风 */}
      <Card onClick={() => onOpen?.("wind")} title={T.t("wind")} icon={<Icon><Wind /></Icon>} span={2}>
        <div className="flex items-center gap-[4cqh]">
          <div className="min-w-0 flex-1" style={{ fontSize: FS.body }}>
            <Row label={T.t("windSpeed")} value={formatWind(cur.wind.speed, unitSettings.wind, lang)} />
            <Row label={T.t("gusts")} value={formatWind(cur.wind.speed * 1.4, unitSettings.wind, lang)} />
            <Row
              label={T.t("direction")}
              value={`${T.compass(degToCompass(cur.wind.deg))} ${Math.round(cur.wind.deg)}°`}
              last
            />
          </div>
          <WindDial deg={cur.wind.deg} value={convertWind(cur.wind.speed, unitSettings.wind).value.toFixed(0)} />
        </div>
      </Card>

      {/* 空气质量 */}
      {air && (
        <Card onClick={() => onOpen?.("aqi")} title={T.t("airQuality")} icon={<span className="font-bold" style={{ fontSize: "0.75em" }}>AQI</span>} span={2}>
          <div className="flex h-full min-h-0 flex-col justify-center gap-[6cqh] px-[2cqh]">
            <div className="flex min-w-0 items-baseline gap-[3cqh]">
              <Big>{air.aqi}</Big>
              <span className="truncate text-white/85" style={{ fontSize: FS.body }}>{T.aqi(air.aqi)}</span>
            </div>
            <div
              className="relative mx-[1cqh] h-[4cqh] min-h-[6px] rounded-full"
              style={{ background: "linear-gradient(to right,#22c55e,#eab308,#f97316,#ef4444,#a855f7)" }}
            >
              <div
                className="absolute top-1/2 aspect-square h-[9cqh] min-h-[10px] rounded-full bg-white shadow"
                style={{ left: `${aqiPct}%`, transform: "translate(-50%,-50%)" }}
              />
            </div>
            <p className="truncate text-white/70" style={{ fontSize: FS.tiny }}>
              PM2.5 {air.pm2_5.toFixed(0)} · PM10 {air.pm10.toFixed(0)} · O₃ {air.o3.toFixed(0)}
            </p>
          </div>
        </Card>
      )}

      {/* 日落 */}
      <Card onClick={() => onOpen?.("sun")} title={T.t("sunset")} icon={<Icon><SunsetIcon /></Icon>}>
        <Big>{formatTimeL(cur.sys.sunset, tz)}</Big>
        <SunArc progress={sunProgress} />
        <p className="mt-auto pt-[3cqh] text-white/80" style={{ fontSize: FS.body }}>
          {T.t("sunriseAt")}{formatTimeL(cur.sys.sunrise, tz)}
        </p>
      </Card>

      {/* 降水概率 */}
      <Card onClick={() => onOpen?.("precip")} title={T.t("precip")} icon={<Icon><CloudRain /></Icon>}>
        <Big>{Math.round(pop * 100)}%</Big>
        <div className="mt-[4cqh] h-[3cqh] min-h-[5px] rounded-full bg-white/20">
          <div className="h-full rounded-full bg-sky-300" style={{ width: `${Math.round(pop * 100)}%` }} />
        </div>
        <p className="mt-auto pt-[3cqh] text-white/80" style={{ fontSize: FS.body }}>
          {T.t("humidity")} {cur.main.humidity}%
        </p>
      </Card>

      {/* 能见度 */}
      <Card onClick={() => onOpen?.("visibility")} title={T.t("visibility")} icon={<Icon><Eye /></Icon>}>
        <Big>{convertDistance(cur.visibility / 1000, unitSettings.distance).value.toFixed(1)}</Big>
        <div className="mt-[1cqh] text-white/70" style={{ fontSize: FS.tiny }}>
          {convertDistance(cur.visibility / 1000, unitSettings.distance).label}
        </div>
        <p className="mt-auto pt-[3cqh] text-white/80" style={{ fontSize: FS.body }}>
          {T.t("cloudiness")} {cur.clouds.all}%
        </p>
      </Card>


      {/* 湿度 */}
      <Card onClick={() => onOpen?.("humidity")} title={T.t("humidity")} icon={<Icon><Droplets /></Icon>}>
        <Big>{cur.main.humidity}%</Big>
        <p className="mt-auto pt-[3cqh] text-white/80" style={{ fontSize: FS.body }}>
          {T.t("feelsLike")} {toDisplayTemp(cur.main.feels_like)}{tempSuffix}
        </p>
      </Card>

      {/* 气压 */}
      <Card onClick={() => onOpen?.("pressure")} title={T.t("pressure")} icon={<Icon><Gauge /></Icon>}>
        <PressureGauge
          value={cur.main.pressure}
          trend={pressureTrend}
          displayValue={convertPressure(cur.main.pressure, unitSettings.pressure).value.toFixed(0)}
          unit={convertPressure(cur.main.pressure, unitSettings.pressure).label}
          lowLabel={T.t("pressLow")}
          highLabel={T.t("pressHigh")}
        />
      </Card>

      {/* 云量 */}
      <Card onClick={() => onOpen?.("conditions")} title={T.t("cloudiness")} icon={<Icon><Cloud /></Icon>}>
        <Big>{cur.clouds.all}%</Big>
        <div className="mt-[4cqh] h-[3cqh] min-h-[5px] rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${cur.clouds.all}%` }} />
        </div>
        <p className="mt-auto pt-[3cqh] capitalize text-white/80" style={{ fontSize: FS.body }}>
          {cur.weather[0].description}
        </p>
      </Card>
    </section>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-[3cqh] ${
        last ? "" : "border-b border-white/15"
      }`}
    >
      <span className="text-white/75">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function PressureGauge({
  value, trend, displayValue, unit, lowLabel, highLabel,
}: { value: number; trend: number; displayValue?: string; unit: string; lowLabel: string; highLabel: string }) {
  const MIN = 960;
  const MAX = 1060;
  const p = Math.min(Math.max((value - MIN) / (MAX - MIN), 0), 1);
  const START = -120; // degrees from top; arc opens at the bottom
  const SWEEP = 240;
  const ticks = 41;
  const activeIdx = Math.round(p * (ticks - 1));
  const dir = trend > 0.4 ? "up" : trend < -0.4 ? "down" : "flat";

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {Array.from({ length: ticks }).map((_, i) => {
          const on = i === activeIdx;
          return (
            <line
              key={i}
              x1="50" y1="8" x2="50" y2={on ? "20" : "16"}
              stroke={on ? "white" : "rgba(255,255,255,0.35)"}
              strokeWidth={on ? "4" : "2"}
              strokeLinecap="round"
              transform={`rotate(${START + (i / (ticks - 1)) * SWEEP} 50 50)`}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-[13cqh] w-[13cqh]" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {dir === "flat" ? (
            <><path d="M4 9h16" /><path d="M4 15h16" /></>
          ) : dir === "up" ? (
            <><path d="M12 20V4" /><path d="M5 11l7-7 7 7" /></>
          ) : (
            <><path d="M12 4v16" /><path d="M5 13l7 7 7-7" /></>
          )}
        </svg>
        <div className="font-medium leading-none" style={{ fontSize: "clamp(12px, 12cqh, 24px)" }}>
          {displayValue ?? value.toLocaleString()}
        </div>
        <div className="text-white/85" style={{ fontSize: FS.tiny }}>{unit}</div>
      </div>
      <div
        className="absolute inset-x-[16%] bottom-[2cqh] flex justify-between text-white/80"
        style={{ fontSize: FS.body }}
      >
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}
