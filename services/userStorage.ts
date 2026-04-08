import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const SESSION_KEY = '@garage_connect_session_v2';
const USER_PREFIX = '@user';
const MIGRATION_PREFIX = '@migration:user_scoped_v1';

type SessionData = { userId?: string; login?: string };

export function toUserId(login: string): string {
  return String(login)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .slice(0, 64);
}

function scopedKey(userId: string, baseKey: string): string {
  return `${USER_PREFIX}:${userId}:${baseKey}`;
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (typeof uid === 'string' && uid.length > 0) return uid;
  } catch {
    /* fallback on legacy local session */
  }

  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionData;
    if (typeof parsed.userId === 'string' && parsed.userId.length > 0) return parsed.userId;
    if (typeof parsed.login === 'string' && parsed.login.length > 0) return toUserId(parsed.login);
    return null;
  } catch {
    return null;
  }
}

export async function userGetItem(baseKey: string): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) return AsyncStorage.getItem(baseKey);
  const scoped = await AsyncStorage.getItem(scopedKey(userId, baseKey));
  if (scoped != null) return scoped;

  // Fallback/migration path: if data was written before user scope was available,
  // promote legacy value to scoped key so each account keeps its own state.
  const legacy = await AsyncStorage.getItem(baseKey);
  if (legacy != null) {
    await AsyncStorage.setItem(scopedKey(userId, baseKey), legacy);
    return legacy;
  }
  return null;
}

export async function userSetItem(baseKey: string, value: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    await AsyncStorage.setItem(baseKey, value);
    return;
  }
  await AsyncStorage.setItem(scopedKey(userId, baseKey), value);
}

export async function userRemoveItem(baseKey: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) {
    await AsyncStorage.removeItem(baseKey);
    return;
  }
  await AsyncStorage.removeItem(scopedKey(userId, baseKey));
}

export async function migrateLegacyKeysForUser(userId: string, baseKeys: string[]): Promise<void> {
  const flagKey = `${MIGRATION_PREFIX}:${userId}`;
  const done = await AsyncStorage.getItem(flagKey);
  if (done === '1') return;

  for (const baseKey of baseKeys) {
    const oldVal = await AsyncStorage.getItem(baseKey);
    if (oldVal == null) continue;
    const target = scopedKey(userId, baseKey);
    const existing = await AsyncStorage.getItem(target);
    if (existing == null) {
      await AsyncStorage.setItem(target, oldVal);
    }
  }
  await AsyncStorage.setItem(flagKey, '1');
}

export async function clearCurrentUserLocalData(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const allKeys = await AsyncStorage.getAllKeys();
  const scopedPrefix = `${USER_PREFIX}:${userId}:`;
  const migrationFlag = `${MIGRATION_PREFIX}:${userId}`;
  const keysToRemove = allKeys.filter((k) => k.startsWith(scopedPrefix) || k === migrationFlag);
  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }
}

