export type Lang = "zh" | "en";

export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const l = (navigator.language || "en").toLowerCase();
  return l.startsWith("zh") ? "zh" : "en";
}

type Dict = Record<string, { zh: string; en: string }>;

const D: Dict = {
  searchPlaceholder: { zh: "搜索城市…", en: "Search for a city…" },
  searching: { zh: "搜索中…", en: "Searching…" },
  noResults: { zh: "未找到城市。", en: "No cities found." },
  savedLocations: { zh: "我的位置", en: "Saved Locations" },
  savedHint: { zh: "在上方搜索城市并点击添加。", en: "Search a city above and tap it to save." },
  myLocation: { zh: "我的位置", en: "My Location" },
  high: { zh: "最高", en: "H" },
  low: { zh: "最低", en: "L" },
  feels: { zh: "体感", en: "Feels" },
  next24: { zh: "未来 24 小时", en: "Next 24 Hours" },
  now: { zh: "现在", en: "Now" },
  sunset: { zh: "日落", en: "Sunset" },
  sunrise: { zh: "日出", en: "Sunrise" },
  dayForecast: { zh: "天气预报", en: "Forecast" },
  today: { zh: "今天", en: "Today" },
  feelsLike: { zh: "体感温度", en: "Feels Like" },
  wind: { zh: "风", en: "Wind" },
  humidity: { zh: "湿度", en: "Humidity" },
  pressure: { zh: "气压", en: "Pressure" },
  visibility: { zh: "能见度", en: "Visibility" },
  airQuality: { zh: "空气质量", en: "Air Quality" },
  aqi: { zh: "AQI", en: "AQI" },
  updated: { zh: "更新于", en: "Updated" },
  errorLoad: { zh: "加载失败，请检查网络或 API Key。", en: "Failed to load weather. Check your API key or try again." },
  dataFrom: { zh: "数据来源 OpenWeather", en: "Data from OpenWeather" },
  add: { zh: "添加", en: "Add" },
  weatherTitle: { zh: "天气", en: "Weather" },
  editList: { zh: "编辑列表", en: "Edit List" },
  done: { zh: "完成", en: "Done" },
  celsius: { zh: "摄氏度", en: "Celsius" },
  fahrenheit: { zh: "华氏度", en: "Fahrenheit" },
  units: { zh: "单位", en: "Units" },
  cityList: { zh: "城市列表", en: "City List" },
  back: { zh: "返回", en: "Back" },
  average: { zh: "平均", en: "Average" },
  aboveAvgHigh: { zh: "高于日均最高温", en: "above the daily high" },
  belowAvgHigh: { zh: "低于日均最高温", en: "below the daily high" },
  todayLabel: { zh: "今天", en: "Today" },
  avgLabel: { zh: "平均值", en: "Average" },
  maxShort: { zh: "最高", en: "H" },
  feelsSame: { zh: "与实际温度相似。", en: "Similar to the actual temperature." },
  feelsWarmer: { zh: "感觉比实际温度更热。", en: "Feels warmer than the actual temperature." },
  feelsCooler: { zh: "感觉比实际温度更凉。", en: "Feels cooler than the actual temperature." },
  windSpeed: { zh: "风力", en: "Speed" },
  gusts: { zh: "阵风", en: "Gusts" },
  direction: { zh: "方向", en: "Direction" },
  precip: { zh: "降水概率", en: "Precipitation" },
  cloudiness: { zh: "云量", en: "Cloud Cover" },
  sunriseAt: { zh: "日出：", en: "Sunrise: " },
  sunsetAt: { zh: "日落：", en: "Sunset: " },
  noSaved: { zh: "还没有城市，搜索并添加。", en: "No cities yet — search to add one." },
  highlights: { zh: "重点", en: "Highlights" },
  modeWeather: { zh: "天气", en: "Weather" },
  modePrecip: { zh: "降水", en: "Precipitation" },
  modeWind: { zh: "风", en: "Wind" },
  conditions: { zh: "天气状况", en: "Conditions" },
  pressLow: { zh: "低", en: "Low" },
  pressHigh: { zh: "高", en: "High" },
  uvIndex: { zh: "紫外线指数", en: "UV Index" },
  whoUvi: { zh: "世界卫生组织 UVI", en: "WHO UVI" },
  dailySummary: { zh: "每日摘要", en: "Daily Summary" },
  actualTemp: { zh: "实际气温", en: "Actual" },
  apparentTemp: { zh: "体感温度", en: "Feels Like" },
  actualTempDesc: { zh: "实际温度。", en: "The measured air temperature." },
  apparentTempDesc: { zh: "湿度、光照或风作用下的体感温度。", en: "How it feels with humidity, sun and wind." },
  precipTotal: { zh: "降水总量", en: "Precipitation Amount" },
  precipChanceToday: { zh: "今日概率：", en: "Chance today: " },
  fullDayTotal: { zh: "全天降水总量", en: "Total for the day" },
  next24: { zh: "未来 24 小时", en: "Next 24 hours" },
  rain: { zh: "降雨", en: "Rain" },
  mm: { zh: "毫米", en: "mm" },
  km: { zh: "公里", en: "km" },
  hPa: { zh: "百帕", en: "hPa" },
  trendSteady: { zh: "趋于稳定", en: "Steady" },
  trendRising: { zh: "正在上升", en: "Rising" },
  trendFalling: { zh: "正在下降", en: "Falling" },
  visPoor: { zh: "较差", en: "Poor" },
  visFair: { zh: "一般", en: "Fair" },
  visGood: { zh: "良好", en: "Good" },
  visVeryGood: { zh: "非常好", en: "Very Good" },
  uvLow: { zh: "低", en: "Low" },
  uvModerate: { zh: "中等", en: "Moderate" },
  uvHigh: { zh: "高", en: "High" },
  uvVeryHigh: { zh: "非常高", en: "Very High" },
  uvExtreme: { zh: "极高", en: "Extreme" },
  firstLight: { zh: "第一束光", en: "First Light" },
  lastLight: { zh: "最后一束光", en: "Last Light" },
  todaySunrise: { zh: "今天日出", en: "Sunrise Today" },
  todaySunset: { zh: "今天日落", en: "Sunset Today" },
  close: { zh: "关闭", en: "Close" },
  gustsLabel: { zh: "阵风：", en: "Gusts: " },
  currentAqi: { zh: "当前 AQI 等级", en: "Current AQI level" },
};


const AQI: Record<number, { zh: string; en: string }> = {
  1: { zh: "优", en: "Good" },
  2: { zh: "良", en: "Fair" },
  3: { zh: "中等", en: "Moderate" },
  4: { zh: "差", en: "Poor" },
  5: { zh: "极差", en: "Very Poor" },
};

const COMPASS: Record<string, { zh: string; en: string }> = {
  N: { zh: "北", en: "N" }, NNE: { zh: "北东北", en: "NNE" }, NE: { zh: "东北", en: "NE" },
  ENE: { zh: "东东北", en: "ENE" }, E: { zh: "东", en: "E" }, ESE: { zh: "东东南", en: "ESE" },
  SE: { zh: "东南", en: "SE" }, SSE: { zh: "南东南", en: "SSE" }, S: { zh: "南", en: "S" },
  SSW: { zh: "南西南", en: "SSW" }, SW: { zh: "西南", en: "SW" }, WSW: { zh: "西西南", en: "WSW" },
  W: { zh: "西", en: "W" }, WNW: { zh: "西西北", en: "WNW" }, NW: { zh: "西北", en: "NW" },
  NNW: { zh: "北西北", en: "NNW" },
};

const DAYS: Record<Lang, string[]> = {
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function makeT(lang: Lang) {
  return {
    t: (k: keyof typeof D) => D[k][lang],
    aqi: (n: number) => AQI[n]?.[lang] ?? "—",
    compass: (dir: string) => COMPASS[dir]?.[lang] ?? dir,
    day: (i: number) => DAYS[lang][i],
    lang,
  };
}

export function formatHourL(unix: number, tzOffset: number, lang: Lang) {
  const d = new Date((unix + tzOffset) * 1000);
  const h = d.getUTCHours();
  if (lang === "zh") return `${h}时`;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr} ${ampm}`;
}

export function formatDayL(unix: number, tzOffset: number, lang: Lang, isFirst = false) {
  if (isFirst) return lang === "zh" ? "今天" : "Today";
  const d = new Date((unix + tzOffset) * 1000);
  return DAYS[lang][d.getUTCDay()];
}

export function formatTimeL(unix: number, tzOffset: number) {
  const d = new Date((unix + tzOffset) * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** True if location's current local time is night. */
export function isNightAt(nowUnix: number, sunrise: number, sunset: number) {
  return nowUnix < sunrise || nowUnix > sunset;
}
