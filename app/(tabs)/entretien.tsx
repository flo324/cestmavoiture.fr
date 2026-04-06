import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import type { MaintenanceTask } from '../../context/EntretienContext';
import { useEntretien } from '../../context/EntretienContext';

export default function EntretienScreen() {
  const ctx = useEntretien();
  const tasks = ctx?.tasks ?? [];
  const updateTaskCategory = ctx?.updateTaskCategory;

  const { aFaire, termines } = useMemo(() => {
    const todo: MaintenanceTask[] = [];
    const done: MaintenanceTask[] = [];
    for (const t of tasks) {
      if (t.category === 'Terminé') done.push(t);
      else todo.push(t);
    }
    return { aFaire: todo, termines: done };
  }, [tasks]);

  const toggle = (task: MaintenanceTask) => {
    if (!updateTaskCategory) return;
    const next = task.category === 'Terminé' ? 'À faire' : 'Terminé';
    updateTaskCategory(task.id, next);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="wrench" size={28} color="#3498db" />
        <Text style={styles.title}>Entretien</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeading}>À faire</Text>
        {aFaire.length === 0 ? (
          <Text style={styles.empty}>Aucune tâche en attente.</Text>
        ) : (
          aFaire.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={() => toggle(task)} />
          ))
        )}

        <Text style={[styles.sectionHeading, styles.sectionSpacing]}>Terminé</Text>
        {termines.length === 0 ? (
          <Text style={styles.empty}>Aucune tâche terminée.</Text>
        ) : (
          termines.map((task) => (
            <TaskRow key={task.id} task={task} done onToggle={() => toggle(task)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({
  task,
  done,
  onToggle,
}: {
  task: MaintenanceTask;
  done?: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.taskCard, done && styles.taskCardDone]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={styles.taskIconWrap}>
        <MaterialCommunityIcons
          name={done ? 'check-circle' : 'checkbox-blank-circle-outline'}
          size={22}
          color={done ? '#27ae60' : '#f39c12'}
        />
      </View>
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>{task.title}</Text>
        {task.source ? (
          <Text style={styles.taskMeta}>Source : {task.source}</Text>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color="#bdc3c7" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f5f8',
    paddingTop: Platform.OS === 'web' ? 16 : 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  title: { fontSize: 20, fontWeight: '900', color: '#2c3e50' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#7f8c8d',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionSpacing: { marginTop: 24 },
  empty: { fontSize: 14, color: '#95a5a6', fontStyle: 'italic', marginBottom: 8 },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  taskCardDone: { opacity: 0.85 },
  taskIconWrap: { marginRight: 12 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#2c3e50' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#7f8c8d' },
  taskMeta: { fontSize: 11, color: '#95a5a6', marginTop: 4 },
});
