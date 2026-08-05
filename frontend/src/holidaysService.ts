export interface Holiday {
  date: string; // "YYYY-MM-DD"
  name: string; // English clean title
  hebrew: string; // Hebrew clean title
  category: string;
  subcat?: string;
  isYomTov?: boolean;
}

// In-memory cache for instant 0ms access during the user session
const inMemoryCache = new Map<number, Holiday[]>();
const pendingRequests = new Map<number, Promise<Holiday[]>>();

const LOCAL_STORAGE_PREFIX = "dental_holidays_v1_";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Explicit list of minor observances to exclude
const EXCLUDED_KEYWORDS = [
  "hebrew language day",
  "יום השפה העברית",
  "family day",
  "יום המשפחה",
  "yom haaliyah",
  "yom ha'aliyah",
  "יום העליה",
  "יום העלייה",
  "school observance",
  "שמירת בית הספר",
  "herzl day",
  "יום הרצל",
  "jabotinsky day",
  "יום ז׳בוטינסקי",
  "יום ז'בוטינסקי",
  "ben-gurion day",
  "יום בן־גוריון",
  "יום בן-גוריון",
  "leil selichot",
  "סליחות",
  "pesach sheni",
  "פסח שני",
  "ta'anit bechorot",
  "תענית בכורות",
];

// Clean up and format holiday names
function formatHolidayNames(rawTitle: string, rawHebrew: string): { name: string; hebrew: string } {
  let name = rawTitle || "";
  let hebrew = rawHebrew || "";

  // Strip trailing 4-digit Hebrew year from Rosh Hashana (e.g. "Rosh Hashana 5787" -> "Rosh Hashana")
  name = name.replace(/\s+\d{4}$/, "").trim();
  hebrew = hebrew.replace(/\s+\d{4}$/, "").trim();

  // Clean up Chanukah candles (e.g. "Chanukah: 1 Candle" -> "Chanukah (Night 1)", "חנוכה: א׳ נר" -> "חנוכה (נר 1)")
  const chanukahMatch = name.match(/Chanukah:\s*(\d+)\s*Candle/i);
  if (chanukahMatch) {
    const candleNum = chanukahMatch[1];
    name = `Chanukah (Night ${candleNum})`;
    hebrew = `חנוכה (נר ${candleNum})`;
  } else if (name.toLowerCase().includes("chanukah: 8th day")) {
    name = "Chanukah (Day 8)";
    hebrew = "חנוכה (יום ח׳)";
  }

  // Shmini Atzeret / Simchat Torah in Israel
  if (name.toLowerCase().includes("shmini atzeret")) {
    name = "Simchat Torah / Shmini Atzeret";
    hebrew = "שמחת תורה / שמיני עצרת";
  }

  // Yom HaZikaron spelling
  if (hebrew === "יום הזכרון") {
    hebrew = "יום הזיכרון";
  }

  // Rabin Memorial Day
  if (name.toLowerCase().includes("yitzhak rabin memorial day")) {
    name = "Rabin Memorial Day";
    hebrew = "יום הזיכרון ליצחק רבין";
  }

  return { name, hebrew };
}

// Determines whether a holiday from Hebcal should be included as a major Israeli / Jewish holiday
function isMajorHoliday(item: any): boolean {
  if (!item || !item.title) return false;

  const titleLower = (item.title || "").toLowerCase();
  const hebrewLower = (item.hebrew || "").toLowerCase();

  // Exclude minor observances
  for (const excluded of EXCLUDED_KEYWORDS) {
    if (titleLower.includes(excluded) || hebrewLower.includes(excluded)) {
      return false;
    }
  }

  const subcat = (item.subcat || "").toLowerCase();
  const category = (item.category || "").toLowerCase();

  // Exclude non-holiday categories
  if (category === "roshchodesh" || category === "parashat" || category === "zmanim") {
    return false;
  }

  // Include major Jewish holidays
  if (subcat === "major") {
    return true;
  }

  // Include major Israeli national days & recognized minor Jewish holidays
  const majorIncludedKeywords = [
    "yom hashoah",
    "yom hazikaron",
    "yom haatzma",
    "yom ha'atzma",
    "yom yerushalayim",
    "tu bishvat",
    "tu bi'shvat",
    "lag baomer",
    "lag b'omer",
    "shushan purim",
    "ta'anit esther",
    "taanit esther",
    "sigd",
    "rabin",
    "יום השואה",
    "יום הזיכרון",
    "יום הזכרון",
    "יום העצמאות",
    "יום ירושלים",
    "ט״ו בשבט",
    "טו בשבט",
    "ל״ג בעומר",
    "לג בעומר",
    "שושן פורים",
    "תענית אסתר",
    "חג הסיגד",
    "סיגד",
  ];

  for (const keyword of majorIncludedKeywords) {
    if (titleLower.includes(keyword) || hebrewLower.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Fetches and filters holidays for a given year using the Hebcal API.
 * Uses in-memory caching and localStorage persistence with 7-day TTL.
 */
export async function fetchHolidaysForYear(year: number): Promise<Holiday[]> {
  // 1. Check in-memory cache
  if (inMemoryCache.has(year)) {
    return inMemoryCache.get(year)!;
  }

  // 2. Check pending promises to avoid duplicate requests
  if (pendingRequests.has(year)) {
    return pendingRequests.get(year)!;
  }

  // 3. Check localStorage cache
  const storageKey = `${LOCAL_STORAGE_PREFIX}${year}`;
  try {
    const rawStorage = localStorage.getItem(storageKey);
    if (rawStorage) {
      const parsed = JSON.parse(rawStorage);
      if (parsed && Array.isArray(parsed.data) && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        inMemoryCache.set(year, parsed.data);
        return parsed.data;
      }
    }
  } catch (err) {
    console.warn("Failed reading holiday cache from localStorage", err);
  }

  // 4. Fetch from Hebcal API
  const fetchPromise = (async () => {
    try {
      const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=off&ss=off&mf=off&c=off&geo=none&i=on&year=${year}&month=x`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Hebcal API responded with status ${response.status}`);
      }

      const data = await response.json();
      const rawItems = data.items || [];

      const holidaysMap = new Map<string, Holiday>();

      for (const item of rawItems) {
        if (!item.date || !isMajorHoliday(item)) continue;

        const date = item.date;
        const { name, hebrew } = formatHolidayNames(item.title, item.hebrew);

        // If a date already has a holiday, prioritize major Yom Tov over minor
        if (holidaysMap.has(date)) {
          const existing = holidaysMap.get(date)!;
          if (item.yomtov && !existing.isYomTov) {
            holidaysMap.set(date, {
              date,
              name,
              hebrew,
              category: item.category || "holiday",
              subcat: item.subcat,
              isYomTov: !!item.yomtov,
            });
          }
        } else {
          holidaysMap.set(date, {
            date,
            name,
            hebrew,
            category: item.category || "holiday",
            subcat: item.subcat,
            isYomTov: !!item.yomtov,
          });
        }
      }

      const holidaysList = Array.from(holidaysMap.values());

      // Save to memory cache
      inMemoryCache.set(year, holidaysList);

      // Save to localStorage
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            timestamp: Date.now(),
            data: holidaysList,
          })
        );
      } catch (err) {
        console.warn("Failed saving holiday cache to localStorage", err);
      }

      return holidaysList;
    } catch (error) {
      console.error(`Failed to fetch Israeli holidays for year ${year}:`, error);

      // Fallback to expired localStorage cache if available
      try {
        const rawStorage = localStorage.getItem(storageKey);
        if (rawStorage) {
          const parsed = JSON.parse(rawStorage);
          if (parsed && Array.isArray(parsed.data)) {
            inMemoryCache.set(year, parsed.data);
            return parsed.data;
          }
        }
      } catch {
        // Ignore fallback errors
      }

      return [];
    } finally {
      pendingRequests.delete(year);
    }
  })();

  pendingRequests.set(year, fetchPromise);
  return fetchPromise;
}

/**
 * Returns a dictionary of dateStr ("YYYY-MM-DD") -> Holiday for the provided list of dates.
 */
export async function getHolidaysForDates(dates: string[]): Promise<Record<string, Holiday>> {
  if (!dates || dates.length === 0) return {};

  // Extract unique years from the dates
  const years = Array.from(
    new Set(
      dates
        .map((d) => {
          const year = parseInt(d.split("-")[0], 10);
          return isNaN(year) ? null : year;
        })
        .filter((y): y is number => y !== null)
    )
  );

  // Fetch holidays for each year concurrently
  const yearResults = await Promise.all(years.map((y) => fetchHolidaysForYear(y)));

  const holidayDict: Record<string, Holiday> = {};
  const dateSet = new Set(dates);

  for (const yearHolidays of yearResults) {
    for (const h of yearHolidays) {
      if (dateSet.has(h.date)) {
        holidayDict[h.date] = h;
      }
    }
  }

  return holidayDict;
}
