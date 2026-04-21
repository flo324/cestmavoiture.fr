import { Platform } from 'react-native';
import { userGetItem, userSetItem } from './userStorage';

const STORAGE_CT_NOTIFICATION_IDS = '@otto_ct_notification_ids_v1';
const CT_CHANNEL_ID = 'otto-ct-reminders';

type NotificationsModule = {
  AndroidImportance: { HIGH: number };
  AndroidNotificationVisibility: { PUBLIC: number };
  IosAuthorizationStatus: { PROVISIONAL: number };
  SchedulableTriggerInputTypes: { DATE: 'date' };
  setNotificationChannelAsync: (...args: unknown[]) => Promise<unknown>;
  getPermissionsAsync: () => Promise<{ granted: boolean; ios?: { status?: number } }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean; ios?: { status?: number } }>;
  scheduleNotificationAsync: (input: unknown) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
};

function getNotificationsModule(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

function parseFrDate(dateFr: string): Date | null {
  const m = String(dateFr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const dt = new Date(year, month, day, 10, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

async function cancelExistingCtReminders(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    await userSetItem(STORAGE_CT_NOTIFICATION_IDS, JSON.stringify([]));
    return;
  }
  try {
    const raw = await userGetItem(STORAGE_CT_NOTIFICATION_IDS);
    if (!raw) return;
    const ids = JSON.parse(raw) as string[];
    if (Array.isArray(ids) && ids.length > 0) {
      await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    }
  } catch (error) {
    console.log('[ctReminders] cancel failed', error);
  } finally {
    await userSetItem(STORAGE_CT_NOTIFICATION_IDS, JSON.stringify([]));
  }
}

async function ensureNotificationReady(): Promise<boolean> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CT_CHANNEL_ID, {
        name: 'Rappels contrôle technique',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 180, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const current = await Notifications.getPermissionsAsync();
    if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }
    const req = await Notifications.requestPermissionsAsync();
    return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch (error) {
    console.log('[ctReminders] permission failed', error);
    return false;
  }
}

async function scheduleAt(date: Date, title: string, body: string): Promise<string | null> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  if (date.getTime() <= Date.now()) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: Platform.OS === 'android' ? CT_CHANNEL_ID : undefined,
      },
    });
    return id;
  } catch (error) {
    console.log('[ctReminders] schedule failed', error);
    return null;
  }
}

export async function scheduleCtReminders(nextCtDateFr: string | null): Promise<void> {
  await cancelExistingCtReminders();
  if (!nextCtDateFr) return;

  const dueDate = parseFrDate(nextCtDateFr);
  if (!dueDate) return;

  const granted = await ensureNotificationReady();
  if (!granted) return;

  const scheduledIds: string[] = [];
  const labelDate = nextCtDateFr;

  const twoMonthsBefore = addMonths(dueDate, -2);
  const oneMonthBefore = addMonths(dueDate, -1);
  const twoMonthsId = await scheduleAt(
    twoMonthsBefore,
    'OTTO - Contrôle technique',
    `Rappel: votre contrôle technique arrive dans 2 mois (${labelDate}).`
  );
  if (twoMonthsId) scheduledIds.push(twoMonthsId);

  const oneMonthId = await scheduleAt(
    oneMonthBefore,
    'OTTO - Contrôle technique',
    `Rappel: votre contrôle technique arrive dans 1 mois (${labelDate}).`
  );
  if (oneMonthId) scheduledIds.push(oneMonthId);

  for (let i = 1; i <= 26; i += 1) {
    const weeklyDate = addDays(dueDate, i * 7);
    const weeklyId = await scheduleAt(
      weeklyDate,
      'OTTO - Contrôle technique en retard',
      `Alerte: votre contrôle technique est dépassé depuis ${i} semaine(s).`
    );
    if (weeklyId) scheduledIds.push(weeklyId);
  }

  await userSetItem(STORAGE_CT_NOTIFICATION_IDS, JSON.stringify(scheduledIds));
}
