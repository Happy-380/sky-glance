import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Cloud,
  Droplet,
  Droplets,
  Eye,
  Gauge,
  Navigation,
  Sun,
  Sunrise as SunriseIcon,
  Wind as WindIcon,
  X,
} from "lucide-react";
import type { OMDay, OMHour } from "@/lib/openmeteo";
import type { CurrentWeather } from "@/lib/weather";
import { degToCompass, iconUrl } from "@/lib/weather";
import { formatTimeL, formatHourL, type Lang } from "@/lib/i18n";
import {
  convertWind, windUnitLabel, convertPressure, convertDistance,
  convertPrecip, resolveTemperatureUnit,
  type UnitSettings,
} from "@/lib/locations-store";

type T = ReturnType<typeof import("@/lib/i18n").makeT>;

export type MetricKey =
  | "conditions"
  | "uv"
  | "wind"
  | "precip"
  | "humidity"
  | "visibility"
  | "pressure"
  | "sun"
  | "aqi";

const HOUR = 3600;

/* Map an hour in [0, 24] to the horizontal position inside the chart column.
   0% and 100% line up with the y-axis ticks so the curve, the time labels
   and any icon/value rows above the curve all share the same axis. */
const axleFrac = (hour: number) => (hour / 24) * 100;

function localParts(unix: number, tz: number) {
  const d = new Date((unix + tz) * 1000);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    hour: d.getUTCHours(),
  };
}

function dayKey(unix: number, tz: number) {
  const p = localParts(unix, tz);
  return `${p.y}-${p.m}-${p.day}`;
}

/* Build the icon/value row samples: every ~2 hours, with the first sample
   anchored to the 0-tick (pos=0) and the last to the 24-tick (pos=100) so the
   row visually starts and ends at the chart's edges. The last two samples
   can share a position to avoid clustering near the right edge. */
function sampleHours(hours: OMHour[], tz: number) {
  const step = Math.max(1, Math.ceil(hours.length / 12));
  const picks: number[] = [];
  for (let index = 0; index < hours.length; index += step) picks.push(index);
  if (picks[picks.length - 1] !== hours.length - 1) picks.push(hours.length - 1);
  return picks
    .map((index) => hours[index])
    .filter((hour): hour is OMHour => Boolean(hour))
    .map((hour, i, arr) => {
      const isFirst = i === 0;
      const isLast = i === arr.length - 1;
      return {
        ...hour,
        pos: isFirst ? 0 : isLast ? 100 : axleFrac(localParts(hour.dt, tz).hour),
      };
    });
}

function chartRange(values: number[], pad = 0.1, floor?: number) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const extra = (hi - lo || 1) * pad;
  return {
    min: floor === undefined ? lo - extra : Math.min(floor, lo),
    max: hi + extra,
  };
}

function Chart({
  points,
  color,
  min,
  max,
  format,
  area = true,
  bars = false,
  header,
  nowHour,
  hourLabel,
}: {
  points: { h: number; v: number }[];
  color: string;
  min: number;
  max: number;
  format: (v: number) => string;
  area?: boolean;
  bars?: boolean;
  /** Optional row(s) shown above the curve (e.g. weather icons, values).
      Rendered in the same column as the SVG so they line up exactly with
      the curve, the time labels and the y-axis ticks. */
  header?: React.ReactNode;
  /** 当前本地时刻的小时数（含分钟小数，如 13.5）。设置后（即当天），
      此前的曲线段为虚线（已过去），此后为实线（预报）。 */
  nowHour?: number;
  /** 把 0–24 的小时数格式化为时刻文案，用于触摸查看气泡，如"下午2时"。 */
  hourLabel?: (hour: number) => string;
}) {
  const width = 320;
  const height = 164;
  const span = max - min || 1;
  /* 触摸查看：手指/光标所在的小时；null 表示未激活。 */
  const [scrubH, setScrubH] = useState<number | null>(null);
  const x = (hour: number) => (axleFrac(hour) / 100) * width;
  const y = (value: number) => height - ((value - min) / span) * height;
  const gradientId = useMemo(() => `chart-${Math.random().toString(36).slice(2)}`, []);
  /* The data only covers hours 0–23. Extend the curve to the visual 0 and 24
     edges (mapped to 0% and 100% of the SVG) so the line reaches both axis
     labels instead of leaving a gap at the right edge. */
  const closed = bars
    ? points
    : (() => {
        if (!points.length) return [{ h: 0, v: 0 }];
        const first = points[0];
        const last = points[points.length - 1];
        return [{ h: 0, v: first.v }, ...points, { h: 24, v: last.v }];
      })();
  const toPath = (pts: { h: number; v: number }[]) =>
    pts.map((point, index) => `${index ? "L" : "M"}${x(point.h).toFixed(1)} ${y(point.v).toFixed(1)}`).join(" ");
  const line = toPath(closed);
  const fill = `${line} L${width} ${height} L0 ${height} Z`;
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((fraction) => min + span * fraction);

  /* 在 nowHour 处把曲线切成两段：左边已过去（虚线），右边是预报（实线），
     切点通过线性插值求得，两段在切点处精确衔接。 */
  const { past, future } = (() => {
    if (nowHour === undefined || bars) return { past: [] as { h: number; v: number }[], future: closed };
    const before: { h: number; v: number }[] = [];
    let i = 0;
    while (i < closed.length && closed[i].h < nowHour) { before.push(closed[i]); i++; }
    if (i === 0) return { past: [] as { h: number; v: number }[], future: closed };
    if (i >= closed.length) return { past: closed, future: [] as { h: number; v: number }[] };
    const a = closed[i - 1];
    const b = closed[i];
    const mid = { h: nowHour, v: a.v + ((b.v - a.v) * (nowHour - a.h)) / (b.h - a.h || 1) };
    return { past: [...before, mid], future: [mid, ...closed.slice(i)] };
  })();

  /* 读取值吸附到最近的数据点，避免显示插值出来的假数据。 */
  const scrubPoint =
    scrubH === null || !closed.length
      ? null
      : closed.reduce((best, p) => (Math.abs(p.h - scrubH) < Math.abs(best.h - scrubH) ? p : best));
  const scrubFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setScrubH(fraction * 24);
  };

  return (
    <div className="detail-chart-grid">
      <div className="detail-chart-col min-w-0">
        {header}
        <div
          className="relative cursor-crosshair touch-none select-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubFromEvent(e); }}
          onPointerMove={(e) => { if (e.buttons) scrubFromEvent(e); }}
          onPointerCancel={() => setScrubH(null)}
          onPointerLeave={(e) => { if (e.pointerType === "mouse" && !e.buttons) setScrubH(null); }}
        >
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="detail-chart-enter block h-44 w-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.58" />
                <stop offset="100%" stopColor={color} stopOpacity="0.06" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <line key={fraction} x1="0" y1={height * fraction} x2={width} y2={height * fraction} className="detail-chart-line" />
            ))}
            {[6, 12, 18].map((hour) => (
              <line key={hour} x1={x(hour)} y1="0" x2={x(hour)} y2={height} className="detail-chart-line detail-chart-line-dashed" />
            ))}
            {bars ? (
              points.map((point) => (
                <rect
                  key={`${point.h}-${point.v}`}
                  x={x(point.h) - 5}
                  y={y(point.v)}
                  width="10"
                  height={Math.max(height - y(point.v), 0)}
                  fill={color}
                  opacity="0.82"
                  rx="2"
                />
              ))
            ) : (
              <>
                {area && <path d={fill} fill={`url(#${gradientId})`} />}
                {past.length > 1 && (
                  <path d={toPath(past)} fill="none" stroke={color} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
                {future.length > 1 && (
                  <path d={toPath(future)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
              </>
            )}
          </svg>
          {/* 触摸查看：竖线 + 曲线上的圆点 + 时刻/数值气泡 */}
          {scrubPoint && (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-detail-muted/60"
                style={{ left: `${axleFrac(scrubPoint.h)}%` }}
              />
              <span
                className="pointer-events-none absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-detail-panel shadow-lg"
                style={{ left: `${axleFrac(scrubPoint.h)}%`, top: `${(y(scrubPoint.v) / height) * 100}%`, background: color }}
              />
              <div
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-xl border border-detail-line bg-detail-menu px-2.5 py-1 text-center shadow-xl"
                style={{
                  left: `${Math.min(Math.max(axleFrac(scrubPoint.h), 13), 87)}%`,
                  top: `${(y(scrubPoint.v) / height) * 100}%`,
                  transform: "translate(-50%, calc(-100% - 14px))",
                }}
              >
                <span className="block text-sm font-semibold tabular-nums text-detail-foreground">{format(scrubPoint.v)}</span>
                {hourLabel && <span className="block text-xs text-detail-muted">{hourLabel(scrubPoint.h)}</span>}
              </div>
            </>
          )}
        </div>
        <div className="relative h-4 pt-1 text-xs tabular-nums text-detail-muted">
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${axleFrac(hour)}%` }}>
              {hour}
            </span>
          ))}
        </div>
      </div>
      <div className="flex h-44 flex-col justify-between border-l border-detail-line pl-2 text-right text-xs tabular-nums text-detail-muted">
        {ticks.map((tick) => <span key={tick}>{format(tick)}</span>)}
      </div>
    </div>
  );
}

export function MetricDetail({
  metric,
  onClose,
  hours,
  days,
  tz,
  lang,
  T,
  units,
  unitSettings,
  cur,
  air,
}: {
  metric: MetricKey;
  onClose: () => void;
  hours: OMHour[];
  days: (OMDay & { dt: number })[];
  tz: number;
  lang: Lang;
  T: T;
  units: "metric" | "imperial";
  unitSettings: UnitSettings;
  cur: CurrentWeather;
  air?: { aqi: number; pm2_5: number; pm10: number; o3: number };
}) {
  const [key, setKey] = useState<MetricKey>(metric);
  const [dayIdx, setDayIdx] = useState(0);
  const [tempTab, setTempTab] = useState<"actual" | "feels">("actual");

  useEffect(() => {
    setKey(metric);
    setDayIdx(0);
  }, [metric]);

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

  const tempUnit = resolveTemperatureUnit(unitSettings, units);
  const toDisplayTemp = (celsius: number) => {
    if (tempUnit === "f") return Math.round(celsius * 9 / 5 + 32);
    return Math.round(celsius);
  };
  const tempSuffix = tempUnit === "f" ? "°F" : "°";
  const windUnitStr = windUnitLabel(unitSettings.wind, lang);
  const day = days[dayIdx];
  const dayHours = useMemo(() => {
    if (!day) return [];
    const selectedKey = dayKey(day.dt, tz);
    const selected = hours.filter((hour) => dayKey(hour.dt, tz) === selectedKey);
    return selected.length ? selected : hours.slice(0, 24);
  }, [hours, day, tz]);

  const points = (getValue: (hour: OMHour) => number) =>
    dayHours.map((hour) => ({ h: localParts(hour.dt, tz).hour, v: getValue(hour) }));
  /* 当天：当前本地时刻（含分钟），用于把曲线切成"已过去/未来"两段；
     其余天不传，整条实线。 */
  const nowHourFrac = localParts(cur.dt, tz).hour + (cur.dt % 3600) / 3600;
  const chartNowHour = dayIdx === 0 ? nowHourFrac : undefined;
  /* 由当天首个数据点反推当天 0 点的时间戳，把 0–24 的小时数还原成时刻文案。 */
  const dayStart = dayHours.length ? dayHours[0].dt - localParts(dayHours[0].dt, tz).hour * 3600 : 0;
  const chartHourLabel = (hour: number) => formatHourL(dayStart + Math.round(hour) * 3600, tz, lang);
  const copy = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const dateLabel = day
    ? (() => {
        const parts = localParts(day.dt, tz);
        return lang === "zh"
          ? `${parts.y}年${parts.m}月${parts.day}日 ${T.day(parts.dow)}`
          : `${T.day(parts.dow)}, ${parts.m}/${parts.day}/${parts.y}`;
      })()
    : "";

  const metrics: { k: MetricKey; icon: React.ReactNode; label: string }[] = [
    { k: "conditions", icon: <Cloud />, label: T.t("conditions") },
    { k: "uv", icon: <Sun />, label: T.t("uvIndex") },
    { k: "wind", icon: <WindIcon />, label: T.t("wind") },
    { k: "precip", icon: <Droplet />, label: T.t("modePrecip") },
    { k: "humidity", icon: <Droplets />, label: T.t("humidity") },
    { k: "visibility", icon: <Eye />, label: T.t("visibility") },
    { k: "pressure", icon: <Gauge />, label: T.t("pressure") },
    { k: "sun", icon: <SunriseIcon />, label: T.t("sunrise") },
  ];
  const heading = key === "aqi"
    ? { icon: <span className="text-xs font-bold">AQI</span>, label: T.t("airQuality") }
    : metrics.find((item) => item.k === key) ?? metrics[0];

  const uvLevel = (value: number) => value < 3 ? T.t("uvLow") : value < 6 ? T.t("uvModerate") : value < 8 ? T.t("uvHigh") : value < 11 ? T.t("uvVeryHigh") : T.t("uvExtreme");
  const visibilityLevel = (km: number) => km < 2 ? T.t("visPoor") : km < 8 ? T.t("visFair") : km < 15 ? T.t("visGood") : T.t("visVeryGood");

  function DetailBody() {
    if (key === "aqi" && air) {
      const percentage = ((air.aqi - 1) / 4) * 100;
      return (
        <div className="space-y-7">
          <TopValue big={`${air.aqi}`} unit={T.aqi(air.aqi)} sub={T.t("currentAqi")} />
          <div className="space-y-3">
            <div className="detail-aqi-scale"><span style={{ left: `${percentage}%` }} /></div>
            <div className="grid grid-cols-3 divide-x divide-detail-line rounded-2xl bg-detail-surface px-2 py-4 text-center">
              <Pollutant label="PM2.5" value={air.pm2_5} />
              <Pollutant label="PM10" value={air.pm10} />
              <Pollutant label="O₃" value={air.o3} />
            </div>
          </div>
          <InfoSection title={copy("关于空气质量", "About Air Quality")} text={copy("空气质量指数综合反映当前主要污染物浓度。数值越低，空气质量越好。", "The air quality index summarizes current pollutant levels. Lower values indicate cleaner air.")} />
        </div>
      );
    }

    if (!dayHours.length || !day) return null;

    if (key === "conditions") {
      const getTemp = (hour: OMHour) => tempTab === "actual" ? hour.temp : hour.feels;
      const values = dayHours.map(getTemp);
      const range = chartRange(values);
      return (
        <div className="space-y-3">
          <TopValue
            big={`${toDisplayTemp(dayIdx === 0 ? (tempTab === "actual" ? cur.main.temp : cur.main.feels_like) : values[0])}${tempSuffix}`}
            sub={tempTab === "actual" ? `${T.t("high")} ${toDisplayTemp(day.max)}${tempSuffix}  ${T.t("low")} ${toDisplayTemp(day.min)}${tempSuffix}` : `${T.t("actualTemp")} ${toDisplayTemp(dayIdx === 0 ? cur.main.temp : dayHours[0].temp)}${tempSuffix}`}
            inlineIcon={<img src={iconUrl(dayIdx === 0 ? cur.weather[0].icon : day.icon)} alt="" className="h-12 w-12 sm:h-14 sm:w-14" />}
            rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />}
          />
          <Chart
            points={points(getTemp)}
            color="var(--weather-temperature)"
            min={range.min}
            max={range.max}
            format={(value) => `${toDisplayTemp(value)}${tempSuffix}`}
            nowHour={chartNowHour}
            hourLabel={chartHourLabel}
            header={<IconRow hours={dayHours} tz={tz} />}
          />
          <SegmentedControl value={tempTab} onChange={setTempTab} left={T.t("actualTemp")} right={T.t("apparentTemp")} />
          <p className="text-base text-detail-muted">{tempTab === "actual" ? T.t("actualTempDesc") : T.t("apparentTempDesc")}</p>
        </div>
      );
    }

    if (key === "uv") {
      const values = dayHours.map((hour) => hour.uv);
      const current = dayIdx === 0 ? (dayHours.find((hour) => hour.dt >= cur.dt)?.uv ?? 0) : Math.max(...values);
      return (
        <div className="space-y-3">
          <TopValue big={`${Math.round(current)}`} unit={uvLevel(current)} sub={T.t("whoUvi")} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => hour.uv)}
            color="var(--weather-uv)"
            min={0}
            max={Math.max(11, Math.max(...values) + 1)}
            format={(value) => `${Math.round(value)}`}
            nowHour={chartNowHour}
            hourLabel={chartHourLabel}
            header={<ValueRow hours={dayHours} value={(hour) => `${Math.round(hour.uv)}`} tz={tz} />}
          />
          <InfoSection title={T.t("dailySummary")} text={copy(`今天紫外线最高为 ${Math.round(Math.max(...values))}（${uvLevel(Math.max(...values))}）。`, `Peak UV today is ${Math.round(Math.max(...values))} (${uvLevel(Math.max(...values))}).`)} />
        </div>
      );
    }

    if (key === "wind") {
      const windValues = dayHours.map((hour) => hour.wind);
      const gustValues = dayHours.map((hour) => hour.gust);
      const curWind = convertWind(dayIdx === 0 ? cur.wind.speed : windValues[0], unitSettings.wind);
      const maxGust = convertWind(Math.max(...gustValues), unitSettings.wind);
      const minWind = convertWind(Math.min(...windValues), unitSettings.wind);
      const maxWind = convertWind(Math.max(...windValues), unitSettings.wind);
      return (
        <div className="space-y-3">
          <TopValue big={`${curWind.value.toFixed(0)}`} unit={windUnitStr} sub={`${T.t("gustsLabel")}${maxGust.value.toFixed(0)} ${windUnitStr} · ${T.compass(degToCompass(dayHours[0].windDeg))}`} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => convertWind(hour.wind, unitSettings.wind).value)}
            color="var(--weather-wind)"
            min={0}
            max={Math.max(convertWind(Math.max(...gustValues), unitSettings.wind).value * 1.15, 5)}
            format={(value) => `${value.toFixed(0)}`}
            nowHour={chartNowHour}
            hourLabel={chartHourLabel}
            header={
              <div className="relative h-8 text-detail-muted">
                {sampleHours(dayHours, tz).map((hour) => (
                  <span key={hour.dt} className="absolute -translate-x-1/2" style={{ left: `${hour.pos}%` }}>
                    <Navigation className="h-4 w-4" style={{ transform: `rotate(${hour.windDeg + 180}deg)` }} />
                  </span>
                ))}
              </div>
            }
          />
          <InfoSection title={T.t("dailySummary")} text={copy(`今天风速 ${minWind.value.toFixed(0)}–${maxWind.value.toFixed(0)} ${windUnitStr}，阵风最高 ${maxGust.value.toFixed(0)} ${windUnitStr}。`, `Wind ${minWind.value.toFixed(0)}–${maxWind.value.toFixed(0)} ${windUnitStr} today, gusting to ${maxGust.value.toFixed(0)} ${windUnitStr}.`)} />
        </div>
      );
    }

    if (key === "precip") {
      const total = dayHours.reduce((sum, hour) => sum + hour.precip, 0);
      const maximum = Math.max(...dayHours.map((hour) => hour.precip), 1);
      const totalConverted = convertPrecip(total, unitSettings.precipitation);
      return (
        <div className="space-y-5">
          <TopValue big={`${Math.round((day.pop ?? 0) * 100)}%`} sub={T.t("precipChanceToday")} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart points={points((hour) => hour.pop * 100)} color="var(--weather-rain)" min={0} max={100} format={(value) => `${Math.round(value)}%`} nowHour={chartNowHour} hourLabel={chartHourLabel} />
          <Section title={T.t("precipTotal")}>
            <StatRows rows={[
              [copy("过去 24 小时", "Past 24 hours"), copy("降水", "Precipitation"), `0 ${totalConverted.label}`],
              [copy("未来 24 小时", "Next 24 hours"), T.t("rain"), `${totalConverted.value.toFixed(totalConverted.value >= 10 ? 0 : 1)} ${totalConverted.label}`],
            ]} />
          </Section>
          {total > 0 && <Chart points={points((hour) => convertPrecip(hour.precip, unitSettings.precipitation).value)} color="var(--weather-rain)" min={0} max={convertPrecip(maximum, unitSettings.precipitation).value * 1.2} format={(value) => value.toFixed(1)} nowHour={chartNowHour} hourLabel={chartHourLabel} bars />}
          <InfoSection title={T.t("dailySummary")} text={copy(`今天的降水总量预计为 ${totalConverted.value.toFixed(1)} ${totalConverted.label === "in" ? "英寸" : "毫米"}。`, `Total precipitation today is forecast to be ${totalConverted.value.toFixed(1)} ${totalConverted.label}.`)} />
          <InfoSection title={copy("关于降水强度", "About Precipitation Intensity")} text={copy("降水强度表示每小时降雨或降雪的总量，可用于判断降水体感和持续程度。", "Precipitation intensity is the hourly rain or snow amount and indicates how strongly precipitation may be felt.")} />
        </div>
      );
    }

    if (key === "humidity") {
      const values = dayHours.map((hour) => hour.humidity);
      const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      return (
        <div className="space-y-5">
          <TopValue big={`${dayIdx === 0 ? cur.main.humidity : average}`} unit="%" sub={copy(`今天平均湿度为 ${average}%。`, `Today's average humidity is ${average}%.`)} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => hour.humidity)}
            color="var(--weather-humidity)"
            min={0}
            max={100}
            format={(value) => `${Math.round(value)}%`}
            nowHour={chartNowHour}
            hourLabel={chartHourLabel}
            header={<ValueRow hours={dayHours} value={(hour) => `${Math.round(hour.humidity)}%`} tz={tz} />}
          />
          <Section title={copy("每日比较", "Daily Comparison")}>
            <ComparisonBar label={T.t("today")} value={average} max={100} />
            <ComparisonBar label={copy("日内最高", "Daily high")} value={Math.round(Math.max(...values))} max={100} muted />
          </Section>
          <InfoSection title={copy("关于相对湿度", "About Relative Humidity")} text={copy("相对湿度是空气中水量与空气可容纳水量的比值。湿度接近 100% 时，可能结露或起雾。", "Relative humidity compares moisture in the air with how much the air can hold. Near 100%, dew or fog may form.")} />
        </div>
      );
    }

    if (key === "visibility") {
      const values = dayHours.map((hour) => (hour.visibility || cur.visibility) / 1000);
      const nowKm = dayIdx === 0 ? cur.visibility / 1000 : values[0];
      const nowConverted = convertDistance(nowKm, unitSettings.distance);
      const minVal = convertDistance(Math.min(...values), unitSettings.distance);
      const maxVal = convertDistance(Math.max(...values), unitSettings.distance);
      return (
        <div className="space-y-3">
          <TopValue big={nowConverted.value.toFixed(1)} unit={nowConverted.label} sub={visibilityLevel(nowKm)} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => convertDistance((hour.visibility || cur.visibility) / 1000, unitSettings.distance).value)}
            color="var(--weather-visibility)"
            min={0}
            max={Math.max(convertDistance(Math.max(...values), unitSettings.distance).value * 1.15, 20)}
            format={(value) => `${value.toFixed(0)}`}
            nowHour={chartNowHour}
            hourLabel={chartHourLabel}
            header={<ValueRow hours={dayHours} value={(hour) => `${convertDistance((hour.visibility || cur.visibility) / 1000, unitSettings.distance).value.toFixed(0)}`} tz={tz} />}
          />
          <InfoSection title={T.t("dailySummary")} text={copy(`今天能见度在 ${minVal.value.toFixed(0)} 至 ${maxVal.value.toFixed(0)} ${nowConverted.label}之间。`, `Visibility ranges from ${minVal.value.toFixed(0)} to ${maxVal.value.toFixed(0)} ${nowConverted.label} today.`)} />
          <InfoSection title={copy("关于能见度", "About Visibility")} text={copy("能见度表示在当前天气状况下可以清晰看见物体的最远距离。", "Visibility is the greatest distance at which objects can be clearly seen under current conditions.")} />
        </div>
      );
    }

    if (key === "pressure") {
      const values = dayHours.map((hour) => hour.pressure || cur.main.pressure);
      const range = chartRange(values, 0.3);
      const trend = values.at(-1)! - values[0];
      const trendLabel = trend > 1 ? T.t("trendRising") : trend < -1 ? T.t("trendFalling") : T.t("trendSteady");
      const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      const curPressure = convertPressure(cur.main.pressure, unitSettings.pressure);
      const avgPressure = convertPressure(average, unitSettings.pressure);
      return (
        <div className="space-y-5">
          <TopValue big={Math.round(curPressure.value).toLocaleString()} unit={curPressure.label} sub={trendLabel} trend={trend} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart points={points((hour) => convertPressure(hour.pressure || cur.main.pressure, unitSettings.pressure).value)} color="var(--weather-pressure)" min={convertPressure(range.min, unitSettings.pressure).value} max={convertPressure(range.max, unitSettings.pressure).value} format={(value) => `${Math.round(value)}`} nowHour={chartNowHour} hourLabel={chartHourLabel} />
          <InfoSection title={T.t("dailySummary")} text={copy(`当前气压为 ${Math.round(curPressure.value)} ${curPressure.label}，${trendLabel}。今天平均气压约为 ${Math.round(avgPressure.value)} ${avgPressure.label}。`, `Pressure is ${Math.round(curPressure.value)} ${curPressure.label} and ${trendLabel.toLowerCase()}. Today's average is about ${Math.round(avgPressure.value)} ${avgPressure.label}.`)} />
          <InfoSection title={copy("关于气压", "About Pressure")} text={copy("气压的显著变化可用于预测天气变化。气压降低可能表示雨雪即将来临，气压升高则可能表示天气将转好。", "Significant pressure changes can help predict weather. Falling pressure may signal rain or snow, while rising pressure can indicate improving conditions.")} />
        </div>
      );
    }

    if (key === "sun") {
      const sunrise = day.sunrise || cur.sys.sunrise;
      const sunset = day.sunset || cur.sys.sunset;
      const progress = Math.min(Math.max((cur.dt - sunrise) / (sunset - sunrise || 1), 0), 1);
      const daylightMinutes = Math.max(0, Math.round((sunset - sunrise) / 60));
      return (
        <div className="space-y-5">
          <TopValue big={formatTimeL(dayIdx === 0 && cur.dt < sunset ? sunset : sunrise, tz)} sub={dayIdx === 0 && cur.dt < sunset ? T.t("todaySunset") : T.t("todaySunrise")} rightSlot={<MetricSelector metrics={metrics} key={key} onSelect={setKey} icon={heading.icon} />} />
          <SunPath progress={progress} />
          <div className="divide-y divide-detail-line border-y border-detail-line">
            <DataRow label={T.t("firstLight")} value={formatTimeL(sunrise - 27 * 60, tz)} />
            <DataRow label={T.t("todaySunrise")} value={formatTimeL(sunrise, tz)} />
            <DataRow label={T.t("todaySunset")} value={formatTimeL(sunset, tz)} />
            <DataRow label={T.t("lastLight")} value={formatTimeL(sunset + 25 * 60, tz)} />
            <DataRow label={copy("总日照时间", "Total Daylight")} value={copy(`${Math.floor(daylightMinutes / 60)}小时 ${daylightMinutes % 60}分钟`, `${Math.floor(daylightMinutes / 60)} hr ${daylightMinutes % 60} min`)} />
          </div>
          <Section title={copy("未来日出与日落", "Upcoming Sunrise & Sunset")}>
            <div className="divide-y divide-detail-line">
              {days.slice(0, 5).map((item, index) => (
                <DataRow key={item.dt} label={index === 0 ? T.t("today") : T.day(localParts(item.dt, tz).dow)} value={`${formatTimeL(item.sunrise, tz)}  —  ${formatTimeL(item.sunset, tz)}`} />
              ))}
            </div>
          </Section>
        </div>
      );
    }

    return null;
  }

  /* Render at document.body level: page containers run the .page-enter
     transform animation, and a transformed ancestor becomes the containing
     block for fixed children — which would misplace this overlay. */
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-5">
      <button type="button" className="detail-fade-enter absolute inset-0 bg-detail-overlay backdrop-blur-sm" onClick={onClose} aria-label={T.t("close")} />
      <section role="dialog" aria-modal="true" aria-label={heading.label} className="detail-sheet-enter relative z-10 flex max-h-[94dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[28px] border border-detail-line bg-detail-panel text-detail-foreground shadow-2xl backdrop-blur-2xl sm:max-h-[88dvh] sm:rounded-[28px]">
        <header className="relative flex h-16 shrink-0 items-center justify-center border-b border-detail-line px-16">
          <div className="flex min-w-0 items-center gap-2 text-lg font-semibold [&_svg]:h-5 [&_svg]:w-5">
            {heading.icon}<span className="truncate">{heading.label}</span>
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 grid h-10 w-10 place-items-center rounded-full bg-detail-control text-detail-foreground transition hover:bg-detail-control-hover" aria-label={T.t("close")}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {key !== "aqi" && (
            <div className="detail-rise detail-rise-1 border-b border-detail-line px-4 pb-3 pt-3 sm:px-7">
              <div className="grid grid-cols-10 gap-1">
                {days.slice(0, 10).map((item, index) => {
                  const parts = localParts(item.dt, tz);
                  const selected = index === dayIdx;
                  return (
                    <button type="button" key={item.dt} onClick={() => setDayIdx(index)} className="flex min-w-0 flex-col items-center gap-1.5 py-1">
                      <span className="truncate text-xs text-detail-muted">{T.day(parts.dow)}</span>
                      <span className={`grid h-9 w-9 max-w-full place-items-center rounded-full text-sm tabular-nums ${selected ? "bg-detail-selected font-semibold text-detail-selected-foreground" : "text-detail-foreground"}`}>{parts.day}</span>
                    </button>
                  );
                })}
              </div>
              <p className="pt-2 text-center text-base font-medium text-detail-foreground">{dateLabel}</p>
            </div>
          )}

          <div className="px-5 pb-9 pt-2 sm:px-8">
            <DetailBody />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MetricSelector({ metrics: items, key: current, onSelect, icon }: { metrics: { k: MetricKey; icon: React.ReactNode; label: string }[]; key: MetricKey; onSelect: (k: MetricKey) => void; icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-9 items-center gap-1.5 rounded-full bg-detail-control pl-3 pr-2.5 text-sm transition hover:bg-detail-control-hover [&_svg]:h-4 [&_svg]:w-4" aria-expanded={open}>
        {icon}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-detail-line bg-detail-menu py-1 shadow-2xl backdrop-blur-2xl">
            {items.map((item) => (
              <button type="button" key={item.k} onClick={() => { onSelect(item.k); setOpen(false); }} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-detail-control [&_svg]:h-4 [&_svg]:w-4 ${current === item.k ? "text-detail-selected-foreground" : ""}`}>
                <span className="w-4">{current === item.k ? <Check className="h-4 w-4" /> : null}</span>{item.icon}<span>{item.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopValue({ big, unit, sub, trend, inlineIcon, rightSlot }: { big: string; unit?: string; sub?: string; trend?: number; inlineIcon?: React.ReactNode; rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-x-2">
          {trend !== undefined && <span className="text-2xl" aria-hidden="true">{trend > 1 ? "↑" : trend < -1 ? "↓" : "="}</span>}
          <span className="text-5xl font-light leading-none tabular-nums sm:text-6xl">{big}</span>
          {inlineIcon && <span className="leading-none [&_svg]:h-9 [&_svg]:w-9">{inlineIcon}</span>}
          {unit && <span className="text-lg text-detail-muted">{unit}</span>}
        </div>
        {sub && <p className="mt-2 text-base text-detail-muted">{sub}</p>}
      </div>
      {rightSlot && <div className="shrink-0 pt-1">{rightSlot}</div>}
    </div>
  );
}

function IconRow({ hours, tz }: { hours: OMHour[]; tz: number }) {
  /* Sample roughly one icon every 2 hours and always anchor the first icon at
     the 0-tick and the last at the 24-tick so the row reaches both ends. */
  const sample = sampleHours(hours, tz);
  return (
    <div className="relative h-5 sm:h-6">
      {sample.map((hour) => (
        <img key={hour.dt} src={iconUrl(hour.icon)} alt="" className="absolute top-0 h-5 w-5 -translate-x-1/2 sm:h-6 sm:w-6" style={{ left: `${hour.pos}%` }} />
      ))}
    </div>
  );
}

function ValueRow({ hours, value, tz }: { hours: OMHour[]; value: (hour: OMHour) => string; tz: number }) {
  /* Same sampling strategy as IconRow so the numbers line up with the icons
     and the time labels, including the 0 and 24 ticks. */
  const sample = sampleHours(hours, tz);
  return (
    <div className="relative h-4 text-center text-[10px] tabular-nums text-detail-muted sm:h-5 sm:text-xs">
      {sample.map((hour) => (
        <span key={hour.dt} className="absolute -translate-x-1/2" style={{ left: `${hour.pos}%` }}>
          {value(hour)}
        </span>
      ))}
    </div>
  );
}

function SegmentedControl({ value, onChange, left, right }: { value: "actual" | "feels"; onChange: (value: "actual" | "feels") => void; left: string; right: string }) {
  return (
    <div className="grid grid-cols-2 rounded-full bg-detail-control p-1 text-sm sm:text-base">
      <button type="button" onClick={() => onChange("actual")} className={`rounded-full px-3 py-2.5 transition ${value === "actual" ? "bg-detail-selected-muted font-medium" : "text-detail-muted"}`}>{left}</button>
      <button type="button" onClick={() => onChange("feels")} className={`rounded-full px-3 py-2.5 transition ${value === "feels" ? "bg-detail-selected-muted font-medium" : "text-detail-muted"}`}>{right}</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-3 text-xl font-semibold">{title}</h3><div className="rounded-2xl bg-detail-surface p-4">{children}</div></section>;
}

function InfoSection({ title, text }: { title: string; text: string }) {
  return <Section title={title}><p className="text-[15px] leading-relaxed text-detail-foreground">{text}</p></Section>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3 text-[15px]"><span className="text-detail-foreground">{label}</span><span className="shrink-0 tabular-nums text-detail-muted">{value}</span></div>;
}

function StatRows({ rows }: { rows: [string, string, string][] }) {
  return <div className="divide-y divide-detail-line">{rows.map(([eyebrow, label, value]) => <div key={eyebrow} className="flex items-end justify-between gap-4 py-3 first:pt-0 last:pb-0"><div><p className="text-xs text-detail-muted">{eyebrow}</p><p className="mt-1 font-medium">{label}</p></div><span className="shrink-0 tabular-nums text-detail-muted">{value}</span></div>)}</div>;
}

function ComparisonBar({ label, value, max, muted = false }: { label: string; value: number; max: number; muted?: boolean }) {
  return <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 first:mt-0"><div className="relative h-6 overflow-hidden rounded-sm bg-detail-control"><div className={`absolute inset-y-0 left-0 ${muted ? "bg-detail-bar-muted" : "bg-detail-bar"}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /><span className="relative z-10 px-2 text-sm text-detail-bar-foreground">{label}</span></div><span className="font-semibold tabular-nums">{value}%</span></div>;
}

function Pollutant({ label, value }: { label: string; value: number }) {
  return <div className="px-2"><p className="text-xs text-detail-muted">{label}</p><p className="mt-1 text-lg font-medium tabular-nums">{value.toFixed(0)}</p><p className="text-[10px] text-detail-muted">μg/m³</p></div>;
}

function SunPath({ progress }: { progress: number }) {
  const x = 12 + progress * 296;
  const y = 122 - Math.sin(progress * Math.PI) * 100;
  return (
    <div className="detail-rise detail-rise-2">
      <svg viewBox="0 0 320 140" className="block h-40 w-full overflow-visible">
        <line x1="0" y1="122" x2="320" y2="122" className="detail-chart-line" />
        <path d="M12 122 Q160 -78 308 122" fill="none" className="detail-sun-path" />
        <circle cx={x} cy={y} r="7" className="detail-sun-dot" />
      </svg>
    </div>
  );
}

export { HOUR };