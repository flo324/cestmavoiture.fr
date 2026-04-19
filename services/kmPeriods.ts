import type { KmPersistedState } from './kmTypes';

function getDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function getWeekKey(d = new Date()): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKey(d = new Date()): string {
  return String(d.getFullYear());
}

export function buildFreshState(totalKm: number): KmPersistedState {
  return {
    totalKm,
    day: { key: getDayKey(), startTotalKm: totalKm },
    week: { key: getWeekKey(), startTotalKm: totalKm },
    month: { key: getMonthKey(), startTotalKm: totalKm },
    year: { key: getYearKey(), startTotalKm: totalKm },
  };
}

export function rotatePeriodsIfNeeded(state: KmPersistedState): KmPersistedState {
  const next = { ...state };
  const dayKey = getDayKey();
  const weekKey = getWeekKey();
  const monthKey = getMonthKey();
  const yearKey = getYearKey();

  if (next.day.key !== dayKey) next.day = { key: dayKey, startTotalKm: next.totalKm };
  if (next.week.key !== weekKey) next.week = { key: weekKey, startTotalKm: next.totalKm };
  if (next.month.key !== monthKey) next.month = { key: monthKey, startTotalKm: next.totalKm };
  if (next.year.key !== yearKey) next.year = { key: yearKey, startTotalKm: next.totalKm };

  return next;
}
