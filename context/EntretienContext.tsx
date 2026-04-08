import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { userGetItem, userSetItem } from '../services/userStorage';

const STORAGE_KEY = '@cestmavoiture_entretien_tasks_v1';

export type MaintenanceCategory = 'À faire' | 'Terminé' | string;

export type MaintenanceTask = {
  id: string;
  title: string;
  category: MaintenanceCategory;
  createdAt: string;
  source?: string;
};

type EntretienContextValue = {
  tasks: MaintenanceTask[];
  addMaintenanceTask: (payload: {
    title: string;
    category?: MaintenanceCategory;
    source?: string;
  }) => Promise<void>;
  updateTaskCategory: (id: string, category: MaintenanceCategory) => Promise<void>;
};

const EntretienContext = createContext<EntretienContextValue | null>(null);

export const EntretienProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUserId } = useAuth();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await userGetItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as MaintenanceTask[];
          const normalized = parsed.map((t) => ({
            ...t,
            category:
              t.category === 'Terminé' || t.category === 'À faire' ? t.category : 'À faire',
          }));
          setTasks(normalized);
        }
      } catch {
        setTasks([]);
      }
    };
    load();
  }, [currentUserId]);

  const addMaintenanceTask = useCallback(
    async (payload: { title: string; category?: MaintenanceCategory; source?: string }) => {
      const trimmed = payload.title?.trim();
      if (!trimmed) return;
      const task: MaintenanceTask = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: trimmed,
        category: payload.category ?? 'À faire',
        createdAt: new Date().toISOString(),
        source: payload.source,
      };
      setTasks((prev) => {
        const next = [...prev, task];
        userSetItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const updateTaskCategory = useCallback(async (id: string, category: MaintenanceCategory) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, category } : t));
      userSetItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ tasks, addMaintenanceTask, updateTaskCategory }),
    [tasks, addMaintenanceTask, updateTaskCategory]
  );

  return <EntretienContext.Provider value={value}>{children}</EntretienContext.Provider>;
};

export const useEntretien = () => useContext(EntretienContext);
