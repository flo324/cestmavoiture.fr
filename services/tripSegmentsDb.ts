import { Platform } from 'react-native';

import { getCurrentUserId, userGetItem, userSetItem } from './userStorage';

/** Repli si le module natif n’est pas dans le binaire (rebuild : npx expo run:android). */
const PENDING_TRIP_SEGMENTS_FALLBACK_KEY = '@km_pending_trip_segments_v1';

type PendingSegmentFallback = { distanceKm: number };

let sqliteLoadAttempted = false;
let sqliteAvailable = false;
type SQLiteDatabase = import('expo-sqlite').SQLiteDatabase;
let openDatabaseAsync: ((name: string) => Promise<SQLiteDatabase>) | null = null;

const dbCache = new Map<string, Promise<SQLiteDatabase>>();

function tryLoadExpoSqlite(): boolean {
  if (sqliteLoadAttempted) return sqliteAvailable;
  sqliteLoadAttempted = true;
  if (Platform.OS === 'web') return false;
  try {
    const mod = require('expo-sqlite') as typeof import('expo-sqlite');
    openDatabaseAsync = mod.openDatabaseAsync.bind(mod);
    sqliteAvailable = true;
    return true;
  } catch (e) {
    console.warn(
      '[OTTO] expo-sqlite indisponible — segments en mémoire locale (AsyncStorage). Rebuild : npx expo run:android',
      e
    );
    sqliteAvailable = false;
    return false;
  }
}

export function isExpoSqliteNativeAvailable(): boolean {
  return tryLoadExpoSqlite();
}

function sanitizeUserId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'anon';
}

async function getDb(): Promise<SQLiteDatabase | null> {
  if (!tryLoadExpoSqlite() || !openDatabaseAsync) return null;
  const uid = await getCurrentUserId();
  const key = sanitizeUserId(uid ?? 'anon');
  let p = dbCache.get(key);
  if (!p) {
    p = (async () => {
      const db = await openDatabaseAsync!(`otto_trip_segments_${key}.db`);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS trip_segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          start_lat REAL NOT NULL,
          start_lon REAL NOT NULL,
          end_lat REAL NOT NULL,
          end_lon REAL NOT NULL,
          distance_km REAL NOT NULL,
          applied INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trip_segments_applied ON trip_segments(applied);
      `);
      return db;
    })();
    dbCache.set(key, p);
  }
  return p;
}

/** À appeler après déconnexion / changement de compte pour éviter de réutiliser une connexion obsolète. */
export function resetTripSegmentsDbCache(): void {
  dbCache.clear();
}

async function readFallbackPending(): Promise<PendingSegmentFallback[]> {
  const raw = await userGetItem(PENDING_TRIP_SEGMENTS_FALLBACK_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is PendingSegmentFallback => x != null && typeof x.distanceKm === 'number');
  } catch {
    return [];
  }
}

async function writeFallbackPending(rows: PendingSegmentFallback[]): Promise<void> {
  await userSetItem(PENDING_TRIP_SEGMENTS_FALLBACK_KEY, JSON.stringify(rows));
}

export async function insertTripSegment(params: {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  distanceKm: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    const rows = await readFallbackPending();
    rows.push({ distanceKm: params.distanceKm });
    await writeFallbackPending(rows);
    return;
  }
  const createdAt = Date.now();
  await db.runAsync(
    `INSERT INTO trip_segments (start_lat, start_lon, end_lat, end_lon, distance_km, applied, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [params.startLat, params.startLon, params.endLat, params.endLon, params.distanceKm, createdAt]
  );
}

export async function sumPendingTripSegmentsKm(): Promise<number> {
  const db = await getDb();
  if (!db) {
    const rows = await readFallbackPending();
    return rows.reduce((s, r) => s + Math.max(0, r.distanceKm), 0);
  }
  const row = await db.getFirstAsync<{ s: number }>(
    `SELECT COALESCE(SUM(distance_km), 0) AS s FROM trip_segments WHERE applied = 0`
  );
  return typeof row?.s === 'number' && Number.isFinite(row.s) ? Math.max(0, row.s) : 0;
}

export async function markAllTripSegmentsApplied(): Promise<void> {
  const db = await getDb();
  if (!db) {
    await writeFallbackPending([]);
    return;
  }
  await db.runAsync(`UPDATE trip_segments SET applied = 1 WHERE applied = 0`);
}
