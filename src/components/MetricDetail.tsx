import { useEffect, useMemo, useRef, useState } from "react";
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
import { degToCompass, weatherImage, weatherImageFromIcon } from "@/lib/weather";
import { weatherImageForWmo } from "@/lib/openmeteo";
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

/**
 * Compute 4–5 axis tick values between min and max with NO duplicate labels
 * after the caller's formatter is applied. Especially important for small-span
 * metrics (pressure, wind Beaufort, humidity when range is narrow) where the
 * previous `min + span*[0, 0.25, 0.5, 0.75, 1]` linear split produced
 * identical integers on two or more rows (e.g. "1004 / 1004 / 1005 / 1006").
 *
 * Strategy:
 *   1. Expand min/max so the range starts and ends on the nearest "nice"
 *      integer boundary of a sensible step size ∈ {1, 2, 5, 10, 20, 50, ...}.
 *   2. Walk from max down to min using step; cap length to 5 so the axis
 *      doesn't overflow. Falls back to ≤4 rows if the span is tiny.
 */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1e-9);
  // Raw step if we insisted on exactly 5 splits; then round up to nice 1-2-5
  const rawStep = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const norm = rawStep / mag; // ∈ [1, 10)
  const niceNorm =
    norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const step = niceNorm * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = hi; v >= lo - step / 2; v -= step) out.push(v);
  // Never exceed 5 rows; keep top = aligned max, bottom = aligned min.
  if (out.length > 5) {
    const stride = Math.ceil(out.length / 5);
    const picked: number[] = [];
    for (let i = 0; i < out.length - 1; i += stride) picked.push(out[i]);
    if (picked[picked.length - 1] !== out[out.length - 1]) picked.push(out[out.length - 1]);
    return picked.slice(0, 5);
  }
  return out.slice(0, 5);
}

/* ── 温度曲线按值取色：参考用户给的月度气温条配色 ──
 * 低于参考范围 (< -10°C) 用更深蓝；高于参考范围 (> 40°C) 用更深红。
 * 中间按：深蓝 → 蓝 → 天蓝 → 青 → 薄荷绿 → 黄绿 → 黄 → 橙 → 红 → 深红 过渡 */
const TEMP_RAMP: { t: number; c: string }[] = [
  { t: -20, c: "#172554" }, // 极寒：深蓝(比参考表更低 → 更深)
  { t: -10, c: "#1E3A8A" }, // 深 蓝
  { t: -5,  c: "#1D4ED8" },
  { t: 0,   c: "#2563EB" }, // 蓝
  { t: 5,   c: "#38BDF8" }, // 天蓝 (匹配 12月/1月 条)
  { t: 10,  c: "#2DD4BF" }, // 青 (匹配 3月 条)
  { t: 15,  c: "#6EE7B7" }, // 薄荷绿 (匹配 11月 条)
  { t: 20,  c: "#BEF264" }, // 黄绿
  { t: 25,  c: "#FACC15" }, // 金黄 (匹配 5月 条)
  { t: 30,  c: "#F97316" }, // 橙 (匹配 6月/9月 条)
  { t: 35,  c: "#EF4444" }, // 红 (匹配 7月/8月 条)
  { t: 40,  c: "#B91C1C" }, // 深红 (比参考表更高 → 更深)
  { t: 50,  c: "#7F1D1D" }, // 极热
];

export function temperatureStrokeColor(celsius: number): string {
  const ramp = TEMP_RAMP;
  if (celsius <= ramp[0].t) return ramp[0].c;
  if (celsius >= ramp[ramp.length - 1].t) return ramp[ramp.length - 1].c;
  for (let i = 0; i < ramp.length - 1; i++) {
    const a = ramp[i];
    const b = ramp[i + 1];
    if (celsius >= a.t && celsius <= b.t) {
      const f = (celsius - a.t) / (b.t - a.t);
      // hex → rgb 线性插值
      const ah = parseInt(a.c.slice(1), 16);
      const bh = parseInt(b.c.slice(1), 16);
      const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
      const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
      const r = Math.round(ar + (br - ar) * f);
      const g = Math.round(ag + (bg - ag) * f);
      const bl = Math.round(ab + (bb - ab) * f);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }
  return ramp[ramp.length - 1].c;
}

/** 构建 SVG 垂直渐变 stops：把 ramp 中每个温度阈值映射到对应的 y 像素位置，
 *  并生成「明色 (给实线 future)」和「暗色 (给虚线 past)」两组 stops。*/
function buildValueGradientStops(
  y: (v: number) => number,
  height: number,
  valueToColor: (v: number) => string,
  minVal: number,
  maxVal: number,
): { offset: number; color: string }[] {
  /* 在 [minVal, maxVal] 范围里均匀采样若干温度点，
     保证渐变覆盖图表的全部 y 范围，不会出现色带断层。 */
  const N = 40;
  const out: { offset: number; color: string }[] = [];
  for (let i = 0; i <= N; i++) {
    const v = minVal + (i / N) * (maxVal - minVal);
    const yPx = y(v);
    // clamp to chart height so out-of-range values also contribute cap colors
    const clamped = Math.min(Math.max(yPx, 0), height);
    out.push({ offset: clamped / height, color: valueToColor(v) });
  }
  return out;
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
  maxMin,
  dayHours,
  formatHour,
  tz,
  scrubShowWeather,
  valueToStrokeColor,
}: {
  points: { h: number; v: number }[];
  color: string;
  min: number;
  max: number;
  format: (v: number) => string;
  area?: boolean;
  bars?: boolean;
  header?: React.ReactNode;
  nowHour?: number;
  maxMin?: { high: string; low: string };
  /** 小时数据：scrub 时用来匹配图标和显示时刻 */
  dayHours?: OMHour[];
  /** 把「小时数」(0–23，chartHourLabel 内部会基于当天 0 点还原成"X时")格式化的函数 */
  formatHour?: (hour: number) => string;
  tz?: number;
  /** scrub 时是否在浮动框里显示天气图标（仅气温图需要） */
  scrubShowWeather?: boolean;
  /** 若提供，则曲线描边不再用单一 color，而是按值取色的垂直渐变
   *  (用于气温曲线：冷=蓝、暖=橙、热=红，超范围用更深色) */
  valueToStrokeColor?: (v: number) => string;
}) {
  // ─── Fix A: SVG viewBox 与渲染尺寸 h-44 (176px) 完全对应 ───
  // 之前 viewBox 164 vs render 176 导致 y 方向拉伸 7%，覆盖层 top% 就对不上。
  const width = 320;
  const height = 176;
  /* ─── Fix duplicated axis labels (如 1004 1004)：
   * 1) 用 niceTicks 求 "规整" 步长 + 整刻度；
   * 2) 把 min/max 扩展到刻度边界（y 比例尺据此重算）；
   * 3) 网格线直接画在每个 tick 对应的 y 高度，不再是 0.25/0.5 等分数，
   *    保证"网格线 → 右侧数值标签"一一对应，不会再出现相邻两行格式化后相同。 */
  const rawTicks = niceTicks(min, max);
  const tickMin = Math.min(...rawTicks);
  const tickMax = Math.max(...rawTicks);
  // 如果只有 3~4 行（span < step*4），也接受，不用强行拉满 5 行
  const ticks = rawTicks;
  const effectiveMin = tickMin;
  const effectiveMax = tickMax;
  const span = effectiveMax - effectiveMin || 1;

  /* 触摸查看：仅组件内部持有 state，不回调父组件 setState → Fix C: 拖动不再级联重渲染 */
  const [scrubH, setScrubH] = useState<number | null>(null);
  const isPointerDown = useRef(false);

  const x = (hour: number) => (axleFrac(hour) / 100) * width;
  const y = (value: number) => height - ((value - effectiveMin) / span) * height;
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);

  // ─── 所有曲线路径 / 填充 / 渐变 只取决于数据 props，不依赖 scrubH 状态 ───
  // 这样 setScrubH 引起的重渲染不会再跑一遍 smoothLine
  const staticBits = useMemo(() => {
    /* 两端补齐到 0 和 24（不影响极值计算） */
    const closed = bars
      ? points
      : (() => {
          if (!points.length) return [{ h: 0, v: 0 }];
          const first = points[0];
          const last = points[points.length - 1];
          return [{ h: 0, v: first.v }, ...points, { h: 24, v: last.v }];
        })();
    const smoothLine = (pts: { h: number; v: number }[]) => {
      const n = pts.length;
      if (n === 0) return "";
      if (n === 1) return `M${x(pts[0].h).toFixed(1)} ${y(pts[0].v).toFixed(1)}`;
      const px = pts.map((p) => x(p.h));
      const py = pts.map((p) => y(p.v));
      const dx: number[] = [];
      const slope: number[] = [];
      for (let i = 0; i < n - 1; i++) {
        dx.push(px[i + 1] - px[i] || 1);
        slope.push((py[i + 1] - py[i]) / (px[i + 1] - px[i] || 1));
      }
      const m: number[] = [slope[0]];
      for (let i = 1; i < n - 1; i++) {
        m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
      }
      m.push(slope[n - 2]);
      for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
        const a = m[i] / slope[i];
        const b = m[i + 1] / slope[i];
        const s = a * a + b * b;
        if (s > 9) {
          const t = 3 / Math.sqrt(s);
          m[i] = t * a * slope[i];
          m[i + 1] = t * b * slope[i];
        }
      }
      let d = `M${px[0].toFixed(1)} ${py[0].toFixed(1)} `;
      for (let i = 0; i < n - 1; i++) {
        const third = dx[i] / 3;
        d += `C${(px[i] + third).toFixed(1)} ${(py[i] + m[i] * third).toFixed(1)} ${(px[i + 1] - third).toFixed(1)} ${(py[i + 1] - m[i + 1] * third).toFixed(1)} ${px[i + 1].toFixed(1)} ${py[i + 1].toFixed(1)} `;
      }
      return d.trim();
    };
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
    const pastD = past.length ? smoothLine(past) : "";
    const futureD = future.length ? smoothLine(future) : "";
    const splitX = past.length ? x(past[past.length - 1].h) : 0;
    const pastFill = pastD ? `${pastD} L${splitX.toFixed(1)} ${height} L0 ${height} Z` : "";
    const futureFill = futureD ? `${futureD} L${width} ${height} L${(future.length ? x(future[0].h) : 0).toFixed(1)} ${height} Z` : "";
    const pastColor = `color-mix(in oklab, ${color} 72%, black)`;
    return { pastD, futureD, pastFill, futureFill, pastColor };
  }, [bars, points, color, effectiveMax, effectiveMin, nowHour]);

  /* 极值：基于原始 points （不含 0/24 合成端点） */
  const extremes = useMemo(() => {
    if (!maxMin || points.length < 2) return null;
    let hi = points[0];
    let lo = points[0];
    for (const p of points) {
      if (p.v > hi.v) hi = p;
      if (p.v < lo.v) lo = p;
    }
    return hi === lo ? { hi, lo: null as typeof lo | null } : { hi, lo };
  }, [maxMin, points]);

  /* 吸附到最近的真实小时点 */
  const snap = (h: number) =>
    points.length ? points.reduce((best, p) => (Math.abs(p.h - h) < Math.abs(best.h - h) ? p : best)) : null;
  const scrubPoint = scrubH === null ? null : snap(scrubH);

  const scrubFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    /* h-44 容器右侧有 pr-8（给温度轴留空），
       计算分数时必须用「内容区宽度」(不含 padding-right)，
       这样手触摸的 x% 才和 SVG 内部的 0–24 小时水平坐标严格一一对应。 */
    const style = window.getComputedStyle(e.currentTarget);
    const pr = parseFloat(style.paddingRight || "0");
    const contentWidth = Math.max(rect.width - pr, 1);
    const fraction = Math.min(Math.max((e.clientX - rect.left) / contentWidth, 0), 1);
    setScrubH(fraction * 24);
  };
  const clearScrub = () => {
    isPointerDown.current = false;
    setScrubH(null);
  };

  // 浮动气泡：匹配 hour，拼装成 DOM。scrub 过程只有这里的 style/内容更新，SVG 不动。
  const scrubMatchedHour = scrubPoint && dayHours && tz !== undefined
    ? dayHours.find((h) => localParts(h.dt, tz).hour === Math.round(scrubPoint.h))
    : undefined;

  /* ── 核心：放弃 pr-8 + absolute 轴的混合基准，改用 flex 两列布局 ──
   *  之前的问题：
   *   - SVG 宽度 = 容器width - padding-right；
   *   - 但 absolute 覆盖层元素 (最高点/竖线/气泡) 的 left% 是相对于「容器 width (含 pr-8)」
   *   - 两者基准差了一截 padding，导致：
   *     1) 最高最低点都整体偏右
   *     2) scrub 竖线显示位置和手指位置不符
   *     3) 再加上手算 padding-right 减法，越调越乱
   *
   *  修复：三行 (header / 曲线区+轴列 / 时间轴) 都使用完全相同的 flex 两列结构：
   *    左列 = flex-1 (内容区，宽度精确一致)，右列 = w-7 / sm:w-8 (轴列占位，宽度也精确一致)
   *  这样所有 left% 都以「左列宽度」为唯一基准，SVG 宽 = 覆盖层容器宽 → 完美对齐。 */
  const axisCol = "w-7 sm:w-8 shrink-0";

  const scrubFromEventFixed = (e: React.PointerEvent<HTMLDivElement>) => {
    /* pointer 现在绑在 flex-1 左列上；该列宽 = rect.width，
       没有任何 padding-right，所以直接 (x - left) / width 就是正确 0~1 分数。 */
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      Math.max((e.clientX - rect.left) / Math.max(rect.width, 1), 0),
      1,
    );
    setScrubH(fraction * 24);
  };

  return (
    <div className="min-w-0">
      {/* 第一行：顶部图标/数值条 — 左列内容 + 右列空占位，列宽和下面两行完全一致 */}
      {header && (
        <div className="flex">
          <div className="flex-1 min-w-0">{header}</div>
          <div className={axisCol} aria-hidden="true" />
        </div>
      )}

      {/* 第二行：曲线区 (左列 flex-1) + 温度轴 (右列 w-7/w-8)。
           pointer 事件只绑在左列，所以手不会误触到轴列区域。 */}
      <div className="flex">
        <div
          className="relative flex-1 min-w-0 h-44 cursor-crosshair touch-none select-none"
          onPointerDown={(e) => {
            isPointerDown.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scrubFromEventFixed(e);
          }}
          onPointerMove={(e) => {
            if (isPointerDown.current) scrubFromEventFixed(e);
          }}
          onPointerCancel={clearScrub}
          onPointerUp={clearScrub}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse" && !isPointerDown.current) clearScrub();
          }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="detail-chart-enter block h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id={`${gid}-f`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.75" />
                <stop offset="100%" stopColor={color} stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id={`${gid}-p`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.4" />
                <stop offset="100%" stopColor={color} stopOpacity="0.15" />
              </linearGradient>
              {/* 按值取色的垂直渐变 (仅当 valueToStrokeColor 提供时启用)：
                   颜色按 y 位置(即温度值) 从冷到暖过渡，
                   实线版本给未来曲线，虚线版本给过去曲线 (每色加深 ~30% 黑) */}
              {valueToStrokeColor &&
                (() => {
                  const stops = buildValueGradientStops(
                    y,
                    height,
                    valueToStrokeColor,
                    effectiveMin,
                    effectiveMax,
                  );
                  // Darken helper: mix 72% original + 28% black (same ratio as original pastColor)
                  const darken = (c: string) => {
                    if (c.startsWith("#")) {
                      const h = parseInt(c.slice(1), 16);
                      const r = Math.round(((h >> 16) & 255) * 0.72);
                      const g = Math.round(((h >> 8) & 255) * 0.72);
                      const b = Math.round((h & 255) * 0.72);
                      return `rgb(${r}, ${g}, ${b})`;
                    }
                    if (c.startsWith("rgb(")) {
                      const nums = c
                        .slice(4, -1)
                        .split(",")
                        .map((s) => Math.round(parseFloat(s.trim()) * 0.72));
                      return `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
                    }
                    return c;
                  };
                  return (
                    <>
                      <linearGradient
                        id={`${gid}-vstroke`}
                        x1="0"
                        y1="1"
                        x2="0"
                        y2="0"
                        gradientUnits="userSpaceOnUse"
                      >
                        {stops.map((s, i) => (
                          <stop
                            key={`f-${i}`}
                            offset={`${(s.offset * 100).toFixed(2)}%`}
                            stopColor={s.color}
                          />
                        ))}
                      </linearGradient>
                      <linearGradient
                        id={`${gid}-vstroke-past`}
                        x1="0"
                        y1="1"
                        x2="0"
                        y2="0"
                        gradientUnits="userSpaceOnUse"
                      >
                        {stops.map((s, i) => (
                          <stop
                            key={`p-${i}`}
                            offset={`${(s.offset * 100).toFixed(2)}%`}
                            stopColor={darken(s.color)}
                          />
                        ))}
                      </linearGradient>
                    </>
                  );
                })()}
            </defs>
            {ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                y1={y(tick)}
                x2={width}
                y2={y(tick)}
                className="detail-chart-line"
              />
            ))}
            {[6, 12, 18].map((hour) => (
              <line
                key={hour}
                x1={x(hour)}
                y1="0"
                x2={x(hour)}
                y2={height}
                className="detail-chart-line detail-chart-line-dashed"
              />
            ))}
            {nowHour !== undefined && (
              <line
                x1={x(nowHour)}
                y1="0"
                x2={x(nowHour)}
                y2={height}
                className="detail-chart-line-now"
              />
            )}
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
                {area && staticBits.pastFill && (
                  <path d={staticBits.pastFill} fill={`url(#${gid}-p)`} />
                )}
                {area && staticBits.futureFill && (
                  <path d={staticBits.futureFill} fill={`url(#${gid}-f)`} />
                )}
                {staticBits.pastD && (
                  <path
                    d={staticBits.pastD}
                    fill="none"
                    stroke={
                      valueToStrokeColor
                        ? `url(#${gid}-vstroke-past)`
                        : staticBits.pastColor
                    }
                    strokeWidth="3"
                    strokeDasharray="3 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {staticBits.futureD && (
                  <path
                    d={staticBits.futureD}
                    fill="none"
                    stroke={
                      valueToStrokeColor ? `url(#${gid}-vstroke)` : color
                    }
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </>
            )}
          </svg>

          {/* 最高/最低标记 — left% 与 SVG 宽度同基准 (左列宽)，圆点精确落在曲线上 */}
          {extremes && (
            <>
              {/* 最高 */}
              {(() => {
                const hiFrac = y(extremes.hi.v) / height;
                const flipDown = hiFrac < 0.22;
                return (
                  <>
                    <span
                      className="pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] shadow"
                      style={{
                        left: `${axleFrac(extremes.hi.h)}%`,
                        top: `${hiFrac * 100}%`,
                        borderColor: color,
                        background: "var(--detail-panel)",
                      }}
                    />
                    <span
                      className="pointer-events-none absolute z-10 text-xs font-medium text-detail-muted"
                      style={{
                        left: `${Math.min(Math.max(axleFrac(extremes.hi.h), 10), 90)}%`,
                        top: `${hiFrac * 100}%`,
                        transform: flipDown
                          ? "translate(-50%, calc(100% + 8px))"
                          : "translate(-50%, calc(-100% - 8px))",
                      }}
                    >
                      {maxMin!.high}
                    </span>
                  </>
                );
              })()}
              {/* 最低 */}
              {extremes.lo &&
                (() => {
                  const loFrac = y(extremes.lo.v) / height;
                  const flipUp = loFrac > 0.78;
                  return (
                    <>
                      <span
                        className="pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] shadow"
                        style={{
                          left: `${axleFrac(extremes.lo.h)}%`,
                          top: `${loFrac * 100}%`,
                          borderColor: color,
                          background: "var(--detail-panel)",
                        }}
                      />
                      <span
                        className="pointer-events-none absolute z-10 text-xs font-medium text-detail-muted"
                        style={{
                          left: `${Math.min(Math.max(axleFrac(extremes.lo.h), 10), 90)}%`,
                          top: `${loFrac * 100}%`,
                          transform: flipUp
                            ? "translate(-50%, calc(-100% - 8px))"
                            : "translate(-50%, calc(100% + 8px))",
                        }}
                      >
                        {maxMin!.low}
                      </span>
                    </>
                  );
                })()}
            </>
          )}

          {/* Scrub 覆盖层 — 所有元素的 left% 都以左列 (SVG 容器) 为唯一基准 */}
          {scrubPoint && (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-detail-foreground/90"
                style={{ left: `${axleFrac(scrubPoint.h)}%` }}
              />
              <span
                className="pointer-events-none absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-detail-foreground bg-detail-foreground shadow-lg"
                style={{
                  left: `${axleFrac(scrubPoint.h)}%`,
                  top: `${(y(scrubPoint.v) / height) * 100}%`,
                }}
              />
              <span
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${Math.min(Math.max(axleFrac(scrubPoint.h), 22), 78)}%`,
                  top: `${(y(scrubPoint.v) / height) * 100}%`,
                  transform: "translate(-50%, calc(-100% - 14px))",
                }}
              >
                <div className="rounded-xl bg-detail-menu/95 px-3 py-2 text-center shadow-xl ring-1 ring-detail-line backdrop-blur-md whitespace-nowrap">
                  <div className="text-xs tabular-nums text-detail-muted">
                    {formatHour
                      ? formatHour(Math.round(scrubPoint.h))
                      : `${Math.round(scrubPoint.h)}:00`}
                  </div>
                  <div className="mt-0.5 flex items-center justify-center gap-1.5">
                    {scrubShowWeather && scrubMatchedHour && (
                      <img
                        src={weatherImageForWmo(
                          scrubMatchedHour.code,
                          !scrubMatchedHour.isDay,
                        )}
                        alt=""
                        className="h-5 w-5 object-contain"
                      />
                    )}
                    <span className="text-lg font-semibold tabular-nums">
                      {format(scrubPoint.v)}
                    </span>
                  </div>
                </div>
              </span>
            </>
          )}
        </div>

        {/* 右列：温度/数值轴 — flex 兄弟节点，高 = 左列高 (h-44)，
           左边 border 就是 SVG 右边界，不再有 absolute 的包含块疑问。 */}
        <div
          className={`pointer-events-none ${axisCol} flex flex-col justify-between border-l border-detail-line pl-1 text-right text-[11px] leading-none tabular-nums text-detail-muted sm:text-xs`}
        >
          {ticks.map((tick) => (
            <span key={tick}>{format(tick)}</span>
          ))}
        </div>
      </div>

      {/* 第三行：底部小时标签 (0, 6, 12, 18, 24) — 同样的两列结构，
           左列 flex-1 放小时标签，24 时正好在 SVG 右端；右列空占位 */}
      <div className="flex">
        <div className="relative flex-1 min-w-0 h-4 pt-1 text-xs tabular-nums text-detail-muted">
          {[0, 6, 12, 18, 24].map((hour) => (
            <span
              key={hour}
              className="absolute -translate-x-1/2"
              style={{ left: `${axleFrac(hour)}%` }}
            >
              {hour}
            </span>
          ))}
        </div>
        <div className={axisCol} aria-hidden="true" />
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
            inlineIcon={
              <img
                src={
                  dayIdx === 0
                    ? weatherImage(cur.weather[0].id, cur.weather[0].icon)
                    : typeof (day as any).code === "number"
                      ? weatherImageForWmo((day as any).code, false)
                      : weatherImageFromIcon(day.icon)
                }
                alt=""
                className="h-12 w-12 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] sm:h-14 sm:w-14"
              />
            }
            rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />}
          />
          <Chart
            points={points(getTemp)}
            color="var(--weather-temperature)"
            min={range.min}
            max={range.max}
            format={(value) => `${toDisplayTemp(value)}${tempSuffix}`}
            nowHour={chartNowHour}
            maxMin={{ high: T.t("chartHigh"), low: T.t("chartLow") }}
            header={<IconRow hours={dayHours} tz={tz} />}
            dayHours={dayHours}
            formatHour={chartHourLabel}
            tz={tz}
            scrubShowWeather
            valueToStrokeColor={temperatureStrokeColor}
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
          <TopValue big={`${Math.round(current)}`} unit={uvLevel(current)} sub={T.t("whoUvi")} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => hour.uv)}
            color="var(--weather-uv)"
            min={0}
            max={Math.max(11, Math.max(...values) + 1)}
            format={(value) => `${Math.round(value)}`}
            nowHour={chartNowHour}
            header={<ValueRow hours={dayHours} value={(hour) => `${Math.round(hour.uv)}`} tz={tz} />}
            dayHours={dayHours}
            formatHour={chartHourLabel}
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
          <TopValue big={`${curWind.value.toFixed(0)}`} unit={windUnitStr} sub={`${T.t("gustsLabel")}${maxGust.value.toFixed(0)} ${windUnitStr} · ${T.compass(degToCompass(dayHours[0].windDeg))}`} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => convertWind(hour.wind, unitSettings.wind).value)}
            color="var(--weather-wind)"
            min={0}
            max={Math.max(convertWind(Math.max(...gustValues), unitSettings.wind).value * 1.15, 5)}
            format={(value) => `${value.toFixed(0)}`}
            nowHour={chartNowHour}
            header={
              <div className="relative h-8 text-detail-muted">
                {sampleHours(dayHours, tz).map((hour) => (
                  <span key={hour.dt} className="absolute -translate-x-1/2" style={{ left: `${hour.pos}%` }}>
                    <Navigation className="h-4 w-4" style={{ transform: `rotate(${hour.windDeg + 180}deg)` }} />
                  </span>
                ))}
              </div>
            }
            dayHours={dayHours}
            formatHour={chartHourLabel}
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
          <TopValue big={`${Math.round((day.pop ?? 0) * 100)}%`} sub={T.t("precipChanceToday")} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart points={points((hour) => hour.pop * 100)} color="var(--weather-rain)" min={0} max={100} format={(value) => `${Math.round(value)}%`} nowHour={chartNowHour} dayHours={dayHours} formatHour={chartHourLabel} />
          <Section title={T.t("precipTotal")}>
            <StatRows rows={[
              [copy("过去 24 小时", "Past 24 hours"), copy("降水", "Precipitation"), `0 ${totalConverted.label}`],
              [copy("未来 24 小时", "Next 24 hours"), T.t("rain"), `${totalConverted.value.toFixed(totalConverted.value >= 10 ? 0 : 1)} ${totalConverted.label}`],
            ]} />
          </Section>
          {total > 0 && <Chart points={points((hour) => convertPrecip(hour.precip, unitSettings.precipitation).value)} color="var(--weather-rain)" min={0} max={convertPrecip(maximum, unitSettings.precipitation).value * 1.2} format={(value) => value.toFixed(1)} nowHour={chartNowHour} bars dayHours={dayHours} formatHour={chartHourLabel} />}
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
          <TopValue big={`${dayIdx === 0 ? cur.main.humidity : average}`} unit="%" sub={copy(`今天平均湿度为 ${average}%。`, `Today's average humidity is ${average}%.`)} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => hour.humidity)}
            color="var(--weather-humidity)"
            min={0}
            max={100}
            format={(value) => `${Math.round(value)}%`}
            nowHour={chartNowHour}
            header={<ValueRow hours={dayHours} value={(hour) => `${Math.round(hour.humidity)}%`} tz={tz} />}
            dayHours={dayHours}
            formatHour={chartHourLabel}
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
          <TopValue big={nowConverted.value.toFixed(1)} unit={nowConverted.label} sub={visibilityLevel(nowKm)} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart
            points={points((hour) => convertDistance((hour.visibility || cur.visibility) / 1000, unitSettings.distance).value)}
            color="var(--weather-visibility)"
            min={0}
            max={Math.max(convertDistance(Math.max(...values), unitSettings.distance).value * 1.15, 20)}
            format={(value) => `${value.toFixed(0)}`}
            nowHour={chartNowHour}
            header={<ValueRow hours={dayHours} value={(hour) => `${convertDistance((hour.visibility || cur.visibility) / 1000, unitSettings.distance).value.toFixed(0)}`} tz={tz} />}
            dayHours={dayHours}
            formatHour={chartHourLabel}
          />
          <InfoSection title={T.t("dailySummary")} text={copy(`今天能见度在 ${minVal.value.toFixed(0)} 至 ${maxVal.value.toFixed(0)} ${nowConverted.label}之间。`, `Visibility ranges from ${minVal.value.toFixed(0)} to ${maxVal.value.toFixed(0)} ${nowConverted.label} today.`)} />
          <InfoSection title={copy("关于能见度", "About Visibility")} text={copy("能见度表示在当前天气状况下可以清晰看见物体的最远距离。", "Visibility is the greatest distance at which objects can be clearly seen under current conditions.")} />
        </div>
      );
    }

    if (key === "pressure") {
      const values = dayHours.map((hour) => hour.pressure || cur.main.pressure);
      /* Fix: chartRange 只覆盖了 Open-Meteo FORECAST 小时气压，
         但 TopValue 展示的是 OpenWeather 当前实时气压 cur.main.pressure。
         若实时气压超出预报区间（很常见），会导致图表右侧曲线被截断，
         看起来像是 1009 vs 1006 不一致。把 curPressure 塞进 range 计算，
         并把 dayHours 中对应「当前小时」那点替换成实时值。 */
      const curP = cur.main.pressure;
      const curHourIdx = (() => {
        const nowH = tz !== undefined ? localParts(cur.dt, tz).hour : 12;
        let best = 0, bestDiff = Infinity;
        for (let i = 0; i < dayHours.length; i++) {
          const diff = Math.abs(localParts(dayHours[i].dt, tz).hour - nowH);
          if (diff < bestDiff) { bestDiff = diff; best = i; }
        }
        return best;
      })();
      const valuesWithCur = values.slice();
      if (curHourIdx >= 0 && curHourIdx < valuesWithCur.length) valuesWithCur[curHourIdx] = curP;
      const allForRange = [...valuesWithCur, curP];
      const range = chartRange(allForRange, 0.3);
      const trend = values.at(-1)! - values[0];
      const trendLabel = trend > 1 ? T.t("trendRising") : trend < -1 ? T.t("trendFalling") : T.t("trendSteady");
      const average = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
      const curPressure = convertPressure(cur.main.pressure, unitSettings.pressure);
      const avgPressure = convertPressure(average, unitSettings.pressure);
      const pts = dayHours.map((hour, i) => ({
        h: localParts(hour.dt, tz).hour,
        v: convertPressure(
          i === curHourIdx ? curP : (hour.pressure || cur.main.pressure),
          unitSettings.pressure,
        ).value,
      }));
      return (
        <div className="space-y-5">
          <TopValue big={Math.round(curPressure.value).toLocaleString()} unit={curPressure.label} sub={trendLabel} trend={trend} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
          <Chart points={pts} color="var(--weather-pressure)" min={convertPressure(range.min, unitSettings.pressure).value} max={convertPressure(range.max, unitSettings.pressure).value} format={(value) => `${Math.round(value)}`} nowHour={chartNowHour} dayHours={dayHours} formatHour={chartHourLabel} />
          <InfoSection title={T.t("dailySummary")} text={copy(`当前气压为 ${Math.round(curPressure.value)} ${curPressure.label}，${trendLabel}。今天平均气压约为 ${Math.round(avgPressure.value)} ${avgPressure.label}。`, `Pressure is ${Math.round(curPressure.value)} ${curPressure.label} and ${trendLabel.toLowerCase()}. Today's average is about ${Math.round(avgPressure.value)} ${avgPressure.label}.`)} />
          <InfoSection title={copy("关于气压", "About Pressure")} text={copy("气压的显著变化可用于预测天气变化。气压降低可能表示雨雪即将来临，气压升高则可能表示天气转好。", "Significant pressure changes can help predict weather. Falling pressure may signal rain or snow, while rising pressure can indicate improving conditions.")} />
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
          <TopValue big={formatTimeL(dayIdx === 0 && cur.dt < sunset ? sunset : sunrise, tz)} sub={dayIdx === 0 && cur.dt < sunset ? T.t("todaySunset") : T.t("todaySunrise")} rightSlot={<MetricSelector metrics={metrics} active={key} onSelect={setKey} icon={heading.icon} />} />
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
            <div className="detail-rise detail-rise-1 border-b border-detail-line px-4 pb-2 pt-3 sm:px-7">
              <div className="grid grid-cols-10 gap-1">
                {days.slice(0, 10).map((item, index) => {
                  const parts = localParts(item.dt, tz);
                  const selected = index === dayIdx;
                  return (
                    <button type="button" key={item.dt} onClick={() => setDayIdx(index)} className="flex min-w-0 flex-col items-center gap-1 py-1">
                      <span className="truncate text-xs text-detail-muted">{T.day(parts.dow)}</span>
                      <span className={`grid h-9 w-9 max-w-full place-items-center rounded-full text-sm tabular-nums ${selected ? "bg-detail-selected font-semibold text-detail-selected-foreground" : "text-detail-foreground"}`}>{parts.day}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-5 pb-9 pt-2 sm:px-8">
            {DetailBody()}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MetricSelector({ metrics: items, active, onSelect, icon }: { metrics: { k: MetricKey; icon: React.ReactNode; label: string }[]; active: MetricKey; onSelect: (k: MetricKey) => void; icon: React.ReactNode }) {
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
              <button
                type="button"
                key={item.k}
                onClick={() => { onSelect(item.k); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition hover:bg-detail-control [&_svg]:h-4 [&_svg]:w-4 ${active === item.k ? "bg-detail-selected text-detail-selected-foreground hover:bg-detail-selected" : ""}`}
              >
                <span className="w-4">{active === item.k ? <Check className="h-4 w-4" /> : null}</span>{item.icon}<span>{item.label}</span>
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
        <img
          key={hour.dt}
          src={weatherImageForWmo(hour.code, !hour.isDay)}
          alt=""
          className="absolute top-0 h-5 w-5 -translate-x-1/2 object-contain sm:h-6 sm:w-6"
          style={{ left: `${hour.pos}%` }}
        />
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