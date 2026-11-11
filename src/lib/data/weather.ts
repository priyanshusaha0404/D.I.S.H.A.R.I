/** Live weather and sea level from Open-Meteo, called directly from the browser (no key, CORS enabled).
 *  The last successful answer per location is kept in local storage so it can still be shown offline. */

export interface Weather {
  fetched: string;
  current: { time: string; temp: number; humidity: number; rain: number; code: number; wind: number; dir: number; gust: number };
  hours: { time: string; temp: number; rain: number; prob: number; wind: number; gust: number; code: number }[];
  days: { date: string; code: number; tmax: number; tmin: number; rain: number; wind: number; gust: number; sunrise: string; sunset: string }[];
}
export interface SeaLevel { fetched: string; distance_km: number | null; series: { time: string; h: number }[]; extremes: { time: string; type: "high" | "low"; h: number }[] }

const KEY = (k: string, lat: number, lon: number) => `dishari.${k}.${lat.toFixed(2)},${lon.toFixed(2)}`;
function remember<T>(k: string, v: T) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
function recall<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }

export async function getWeather(lat: number, lon: number): Promise<{ data: Weather | null; cached: boolean }> {
  const k = KEY("wx", lat, lon);
  try {
    const u = new URL("https://api.open-meteo.com/v1/forecast");
    u.search = new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: "Asia/Kolkata", forecast_days: "3", wind_speed_unit: "kmh",
      current: "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      hourly: "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset",
    }).toString();
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json();
    const c = d.current, h = d.hourly, dy = d.daily;
    const nowIdx = Math.max(0, (h.time as string[]).findIndex((t) => t >= c.time));
    const w: Weather = {
      fetched: new Date().toISOString(),
      current: { time: c.time, temp: c.temperature_2m, humidity: c.relative_humidity_2m, rain: c.precipitation, code: c.weather_code,
        wind: c.wind_speed_10m, dir: c.wind_direction_10m, gust: c.wind_gusts_10m },
      hours: (h.time as string[]).slice(nowIdx, nowIdx + 48).map((t, j) => {
        const i = nowIdx + j;
        return { time: t, temp: h.temperature_2m[i], rain: h.precipitation[i], prob: h.precipitation_probability[i], wind: h.wind_speed_10m[i],
          gust: h.wind_gusts_10m[i], code: h.weather_code[i] };
      }),
      days: (dy.time as string[]).map((t, i) => ({ date: t, code: dy.weather_code[i], tmax: dy.temperature_2m_max[i], tmin: dy.temperature_2m_min[i],
        rain: dy.precipitation_sum[i], wind: dy.wind_speed_10m_max[i], gust: dy.wind_gusts_10m_max[i], sunrise: dy.sunrise[i], sunset: dy.sunset[i] })),
    };
    remember(k, w);
    return { data: w, cached: false };
  } catch {
    return { data: recall<Weather>(k), cached: true };
  }
}

export async function getSeaLevel(lat: number, lon: number): Promise<{ data: SeaLevel | null; cached: boolean }> {
  const k = KEY("sea", lat, lon);
  // the marine model has no values on land: try the point, then nearby offshore points
  const tries: [number, number][] = [[lat, lon], [lat - 0.15, lon], [lat - 0.3, lon], [lat - 0.3, lon + 0.2], [lat - 0.5, lon]];
  for (const [la, lo] of tries) {
    try {
      const u = new URL("https://marine-api.open-meteo.com/v1/marine");
      u.search = new URLSearchParams({ latitude: la.toFixed(3), longitude: lo.toFixed(3), timezone: "Asia/Kolkata", forecast_days: "3",
        hourly: "sea_level_height_msl" }).toString();
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      const times: string[] = d.hourly?.time || [];
      const vals: (number | null)[] = d.hourly?.sea_level_height_msl || [];
      if (!vals.some((v) => v !== null)) continue;
      const now = new Date().toISOString().slice(0, 13);
      const i0 = Math.max(0, times.findIndex((t) => t.slice(0, 13) >= now));
      const series = times.slice(i0, i0 + 48).map((t, j) => ({ time: t, h: vals[i0 + j] as number })).filter((p) => p.h !== null);
      const extremes: SeaLevel["extremes"] = [];
      for (let i = 1; i < series.length - 1; i++) {
        const a = series[i - 1].h, b = series[i].h, c = series[i + 1].h;
        if (b > a && b >= c) extremes.push({ time: series[i].time, type: "high", h: b });
        else if (b < a && b <= c) extremes.push({ time: series[i].time, type: "low", h: b });
      }
      const dist = Math.hypot((lo - lon) * Math.cos((lat * Math.PI) / 180), la - lat) * 111.2;
      const s: SeaLevel = { fetched: new Date().toISOString(), distance_km: Math.round(dist), series, extremes };
      remember(k, s);
      return { data: s, cached: false };
    } catch {
      break;
    }
  }
  return { data: recall<SeaLevel>(k), cached: true };
}

/** WMO weather codes → short descriptions. */
export const WMO: Record<number, [string, string]> = {
  0: ["Clear sky", "পরিষ্কার আকাশ"], 1: ["Mainly clear", "প্রধানত পরিষ্কার"], 2: ["Partly cloudy", "আংশিক মেঘলা"], 3: ["Overcast", "মেঘাচ্ছন্ন"],
  45: ["Fog", "কুয়াশা"], 48: ["Rime fog", "ঘন কুয়াশা"], 51: ["Light drizzle", "হালকা গুঁড়ি বৃষ্টি"], 53: ["Drizzle", "গুঁড়ি বৃষ্টি"],
  55: ["Dense drizzle", "ঘন গুঁড়ি বৃষ্টি"], 61: ["Light rain", "হালকা বৃষ্টি"], 63: ["Rain", "বৃষ্টি"], 65: ["Heavy rain", "ভারী বৃষ্টি"],
  80: ["Rain showers", "বৃষ্টির ঝাপটা"], 81: ["Rain showers", "বৃষ্টির ঝাপটা"], 82: ["Violent showers", "প্রবল বৃষ্টির ঝাপটা"],
  95: ["Thunderstorm", "বজ্রঝড়"], 96: ["Thunderstorm with hail", "শিলাবৃষ্টি সহ বজ্রঝড়"], 99: ["Thunderstorm with hail", "শিলাবৃষ্টি সহ বজ্রঝড়"],
};
export const wmo = (code: number, lang: "en" | "bn") => (WMO[code] || ["—", "—"])[lang === "bn" ? 1 : 0];
