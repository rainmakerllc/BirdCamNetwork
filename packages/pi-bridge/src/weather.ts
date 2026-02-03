/**
 * Weather Module
 * 
 * Fetches weather data to correlate with bird activity.
 * Uses Open-Meteo API (free, no API key required).
 */

import https from 'https';
import { config } from './config.js';

export interface WeatherData {
  timestamp: string;
  temperature: number;        // Celsius
  feelsLike: number;
  humidity: number;           // Percentage
  precipitation: number;      // mm
  cloudCover: number;         // Percentage
  windSpeed: number;          // km/h
  windDirection: number;      // Degrees
  conditions: string;         // e.g., "Partly Cloudy"
  isDay: boolean;
  sunrise: string;
  sunset: string;
}

export interface DailyForecast {
  date: string;
  high: number;
  low: number;
  precipitation: number;
  conditions: string;
  sunrise: string;
  sunset: string;
}

// Weather code to condition string
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing Rime Fog',
  51: 'Light Drizzle',
  53: 'Moderate Drizzle',
  55: 'Dense Drizzle',
  61: 'Slight Rain',
  63: 'Moderate Rain',
  65: 'Heavy Rain',
  66: 'Light Freezing Rain',
  67: 'Heavy Freezing Rain',
  71: 'Slight Snow',
  73: 'Moderate Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Slight Rain Showers',
  81: 'Moderate Rain Showers',
  82: 'Violent Rain Showers',
  85: 'Slight Snow Showers',
  86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with Slight Hail',
  99: 'Thunderstorm with Heavy Hail',
};

// Cache weather data to avoid excessive API calls
let weatherCache: {
  data: WeatherData | null;
  forecast: DailyForecast[] | null;
  fetchedAt: number;
} = {
  data: null,
  forecast: null,
  fetchedAt: 0,
};

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch current weather from Open-Meteo API
 */
export async function getCurrentWeather(): Promise<WeatherData | null> {
  const lat = config.detection.latitude;
  const lon = config.detection.longitude;

  if (!lat || !lon) {
    console.log('[Weather] No location configured');
    return null;
  }

  // Check cache
  if (weatherCache.data && Date.now() - weatherCache.fetchedAt < CACHE_DURATION) {
    return weatherCache.data;
  }

  return new Promise((resolve) => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code,is_day',
      daily: 'sunrise,sunset',
      timezone: 'auto',
      forecast_days: '1',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const current = json.current;
          const daily = json.daily;

          const weather: WeatherData = {
            timestamp: current.time,
            temperature: current.temperature_2m,
            feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            cloudCover: current.cloud_cover,
            windSpeed: current.wind_speed_10m,
            windDirection: current.wind_direction_10m,
            conditions: WEATHER_CODES[current.weather_code] || 'Unknown',
            isDay: current.is_day === 1,
            sunrise: daily.sunrise[0],
            sunset: daily.sunset[0],
          };

          weatherCache.data = weather;
          weatherCache.fetchedAt = Date.now();

          console.log(`[Weather] ${weather.conditions}, ${weather.temperature}°C`);
          resolve(weather);
        } catch (err) {
          console.error('[Weather] Parse error:', (err as Error).message);
          resolve(null);
        }
      });
    }).on('error', (err) => {
      console.error('[Weather] Fetch error:', err.message);
      resolve(null);
    });
  });
}

/**
 * Fetch weather forecast
 */
export async function getForecast(days: number = 7): Promise<DailyForecast[]> {
  const lat = config.detection.latitude;
  const lon = config.detection.longitude;

  if (!lat || !lon) {
    return [];
  }

  // Check cache
  if (weatherCache.forecast && Date.now() - weatherCache.fetchedAt < CACHE_DURATION) {
    return weatherCache.forecast.slice(0, days);
  }

  return new Promise((resolve) => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,sunrise,sunset',
      timezone: 'auto',
      forecast_days: String(Math.min(days, 14)),
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const daily = json.daily;

          const forecast: DailyForecast[] = daily.time.map((date: string, i: number) => ({
            date,
            high: daily.temperature_2m_max[i],
            low: daily.temperature_2m_min[i],
            precipitation: daily.precipitation_sum[i],
            conditions: WEATHER_CODES[daily.weather_code[i]] || 'Unknown',
            sunrise: daily.sunrise[i],
            sunset: daily.sunset[i],
          }));

          weatherCache.forecast = forecast;
          weatherCache.fetchedAt = Date.now();

          resolve(forecast.slice(0, days));
        } catch (err) {
          console.error('[Weather] Forecast parse error:', (err as Error).message);
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.error('[Weather] Forecast fetch error:', err.message);
      resolve([]);
    });
  });
}

/**
 * Get bird activity conditions rating
 * Returns a score from 0-100 based on weather conditions
 */
export function getBirdActivityRating(weather: WeatherData): {
  score: number;
  factors: string[];
} {
  const factors: string[] = [];
  let score = 50; // Start at neutral

  // Temperature (birds prefer mild temps)
  if (weather.temperature >= 10 && weather.temperature <= 25) {
    score += 15;
    factors.push('Ideal temperature');
  } else if (weather.temperature < 0 || weather.temperature > 35) {
    score -= 20;
    factors.push('Extreme temperature');
  }

  // Precipitation (birds avoid rain)
  if (weather.precipitation > 5) {
    score -= 30;
    factors.push('Heavy precipitation');
  } else if (weather.precipitation > 1) {
    score -= 15;
    factors.push('Light precipitation');
  } else {
    score += 10;
    factors.push('No precipitation');
  }

  // Wind (high wind reduces activity)
  if (weather.windSpeed > 30) {
    score -= 20;
    factors.push('High wind');
  } else if (weather.windSpeed < 15) {
    score += 10;
    factors.push('Calm conditions');
  }

  // Cloud cover (partly cloudy is often best)
  if (weather.cloudCover >= 20 && weather.cloudCover <= 60) {
    score += 10;
    factors.push('Good visibility');
  }

  // Time of day
  if (weather.isDay) {
    score += 10;
    factors.push('Daylight hours');
  } else {
    score -= 20;
    factors.push('Night time');
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  return { score, factors };
}

/**
 * Check if current time is during dawn chorus (peak bird activity)
 */
export function isDawnChorus(weather: WeatherData): boolean {
  const now = new Date();
  const sunrise = new Date(weather.sunrise);
  
  // Dawn chorus is typically 30 min before to 2 hours after sunrise
  const start = new Date(sunrise.getTime() - 30 * 60 * 1000);
  const end = new Date(sunrise.getTime() + 2 * 60 * 60 * 1000);
  
  return now >= start && now <= end;
}

/**
 * Get weather summary for display
 */
export function getWeatherSummary(weather: WeatherData): string {
  const temp = Math.round(weather.temperature);
  const feels = Math.round(weather.feelsLike);
  
  let summary = `${weather.conditions}, ${temp}°C`;
  
  if (Math.abs(temp - feels) > 3) {
    summary += ` (feels like ${feels}°C)`;
  }
  
  if (weather.precipitation > 0) {
    summary += `, ${weather.precipitation}mm precip`;
  }
  
  if (weather.windSpeed > 20) {
    summary += `, wind ${Math.round(weather.windSpeed)}km/h`;
  }
  
  return summary;
}
