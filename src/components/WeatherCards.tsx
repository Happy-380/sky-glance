import {
  Thermometer, Wind, Droplets, Eye, Gauge, Sunset as SunsetIcon,
  TrendingUp, CloudRain, Cloud,
} from "lucide-react";
import type { CurrentWeather, DailySummary } from "@/lib/weather";
import { degToCompass } from "@/lib/weather";
import { formatTimeL } from "@/lib/i18n";

type T = ReturnType<typeof import("@/lib/i18n").makeT>;

function Card({
  title, icon, span = 1, children,
}: { title: string; icon: React.ReactNode; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <div
      className={`flex min-h-[150px] min-w-0 flex-col rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl ${
        span === 2 ? "col-span-2" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-white/70">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="truncate font-light leading-none"
      style={{ fontSize: "clamp(22px, 6.5vw, 32px)" }}
    >
      {children}
    </div>
  );
}


function WindDial({ deg, value }: { deg: number; value: string }) {
  return (
    <div className="relative h-[92px] w-[92px] shrink-0 sm:h-[110px] sm:w-[110px]">
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
      <div className="absolute inset-0 flex items-center justify-center text-xl font-medium">
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
    <svg viewBox="0 0 100 44" className="mt-2 h-12 w-full sm:h-14">
      <path d="M4 30 Q50 -10 96 30" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1="0" y1="34" x2="100" y2="34" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <circle cx={x} cy={y} r="3.5" fill="white" />
    </svg>
  );
}

export function WeatherCards({
  cur, daily, T, lang, tz, units, air, pop,
}: {
  cur: CurrentWeather;
  daily: DailySummary[];
  T: T;
  lang: "zh" | "en";
  tz: number;
  units: "metric" | "imperial";
  air?: { aqi: number; pm2_5: number; pm10: number; o3: number };
  pop: number;
}) {
  const windUnit = units === "metric" ? (lang === "zh" ? "米/秒" : "m/s") : "mph";
  const avgHigh = daily.length
    ? daily.reduce((s, d) => s + d.max, 0) / daily.length
    : cur.main.temp_max;
  const diff = Math.round(cur.main.temp_max - avgHigh);
  const feelsDiff = cur.main.feels_like - cur.main.temp;
  const now = cur.dt;
  const sunProgress = (now - cur.sys.sunrise) / (cur.sys.sunset - cur.sys.sunrise || 1);
  const aqiPct = air ? ((air.aqi - 1) / 4) * 100 : 0;

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* 平均 */}
      <Card title={T.t("average")} icon={<TrendingUp className="h-4 w-4" />}>
        <Big>{diff >= 0 ? "+" : ""}{diff}°</Big>
        <p className="mt-2 text-sm text-white/85">
          {diff >= 0 ? T.t("aboveAvgHigh") : T.t("belowAvgHigh")}
        </p>
        <div className="mt-auto space-y-1 pt-4 text-sm text-white/70">
          <div className="flex justify-between gap-2">
            <span>{T.t("todayLabel")}</span>
            <span className="font-medium text-white">
              {T.t("maxShort")} {Math.round(cur.main.temp_max)}°
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>{T.t("avgLabel")}</span>
            <span className="font-medium text-white">
              {T.t("maxShort")} {Math.round(avgHigh)}°
            </span>
          </div>
        </div>
      </Card>

      {/* 体感温度 */}
      <Card title={T.t("feelsLike")} icon={<Thermometer className="h-4 w-4" />}>
        <Big>{Math.round(cur.main.feels_like)}°</Big>
        <p className="mt-auto pt-3 text-sm text-white/85">
          {Math.abs(feelsDiff) < 1
            ? T.t("feelsSame")
            : feelsDiff > 0
              ? T.t("feelsWarmer")
              : T.t("feelsCooler")}
        </p>
      </Card>

      {/* 风 */}
      <Card title={T.t("wind")} icon={<Wind className="h-4 w-4" />} span={2}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 text-sm">
            <Row label={T.t("windSpeed")} value={`${cur.wind.speed.toFixed(1)} ${windUnit}`} />
            <Row label={T.t("gusts")} value={`${Math.round(cur.wind.speed * 1.4)} ${windUnit}`} />
            <Row
              label={T.t("direction")}
              value={`${T.compass(degToCompass(cur.wind.deg))} ${Math.round(cur.wind.deg)}°`}
              last
            />
          </div>
          <WindDial deg={cur.wind.deg} value={cur.wind.speed.toFixed(0)} />
        </div>
      </Card>

      {/* 空气质量 */}
      {air && (
        <Card title={T.t("airQuality")} icon={<span className="text-[10px] font-bold">AQI</span>} span={2}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <Big>{air.aqi}</Big>
              <p className="mt-1 text-sm text-white/85">{T.aqi(air.aqi)}</p>
            </div>
            <p className="text-xs text-white/70">
              PM2.5 {air.pm2_5.toFixed(0)} · PM10 {air.pm10.toFixed(0)} · O₃ {air.o3.toFixed(0)}
            </p>
          </div>
          <div
            className="relative mt-3 h-1.5 rounded-full"
            style={{ background: "linear-gradient(to right,#22c55e,#eab308,#f97316,#ef4444,#a855f7)" }}
          >
            <div
              className="absolute top-1/2 h-3 w-3 rounded-full bg-white shadow"
              style={{ left: `${aqiPct}%`, transform: "translate(-50%,-50%)" }}
            />
          </div>
        </Card>
      )}

      {/* 日落 */}
      <Card title={T.t("sunset")} icon={<SunsetIcon className="h-4 w-4" />}>
        <Big>{formatTimeL(cur.sys.sunset, tz)}</Big>
        <SunArc progress={sunProgress} />
        <p className="mt-auto pt-2 text-sm text-white/80">
          {T.t("sunriseAt")}{formatTimeL(cur.sys.sunrise, tz)}
        </p>
      </Card>

      {/* 降水概率 */}
      <Card title={T.t("precip")} icon={<CloudRain className="h-4 w-4" />}>
        <Big>{Math.round(pop * 100)}%</Big>
        <div className="mt-3 h-1.5 rounded-full bg-white/20">
          <div className="h-full rounded-full bg-sky-300" style={{ width: `${Math.round(pop * 100)}%` }} />
        </div>
        <p className="mt-auto pt-4 text-sm text-white/80">{T.t("humidity")} {cur.main.humidity}%</p>
      </Card>

      {/* 能见度 */}
      <Card title={T.t("visibility")} icon={<Eye className="h-4 w-4" />}>
        <Big>{(cur.visibility / 1000).toFixed(1)} {lang === "zh" ? "公里" : "km"}</Big>
        <p className="mt-auto pt-3 text-sm text-white/80">{T.t("cloudiness")} {cur.clouds.all}%</p>
      </Card>

      {/* 湿度 */}
      <Card title={T.t("humidity")} icon={<Droplets className="h-4 w-4" />}>
        <Big>{cur.main.humidity}%</Big>
        <p className="mt-auto pt-3 text-sm text-white/80">
          {T.t("feelsLike")} {Math.round(cur.main.feels_like)}°
        </p>
      </Card>

      {/* 气压 */}
      <Card title={T.t("pressure")} icon={<Gauge className="h-4 w-4" />}>
        <Big>{cur.main.pressure}</Big>
        <p className="mt-auto pt-3 text-sm text-white/80">hPa</p>
      </Card>

      {/* 云量 */}
      <Card title={T.t("cloudiness")} icon={<Cloud className="h-4 w-4" />}>
        <Big>{cur.clouds.all}%</Big>
        <div className="mt-3 h-1.5 rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/70" style={{ width: `${cur.clouds.all}%` }} />
        </div>
        <p className="mt-auto pt-4 text-sm capitalize text-white/80">{cur.weather[0].description}</p>
      </Card>
    </section>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 py-2 ${
        last ? "" : "border-b border-white/15"
      }`}
    >
      <span className="text-white/75">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
