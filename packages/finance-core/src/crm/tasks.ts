import type { FinanceData, Task } from '../types';
import { addDays, daysBetween, todayISO } from './day';

const createId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export type AddTaskInput = {
  prospectId: string;
  opportunityId?: string | null;
  label: string;
  dueDate: string;
  priority?: Task['priority'];
  createdAt?: string;
};

export const addTask = (data: FinanceData, input: AddTaskInput): FinanceData => {
  const task: Task = {
    id: createId('task'),
    prospectId: input.prospectId,
    opportunityId: input.opportunityId ?? null,
    label: input.label.trim() || 'Tâche sans libellé',
    dueDate: input.dueDate,
    priority: input.priority ?? 'normal',
    status: 'open',
    completedAt: null,
    createdAt: input.createdAt ?? todayISO(),
  };

  return { ...data, tasks: [task, ...data.tasks] };
};

export const updateTask = (
  data: FinanceData,
  taskId: string,
  input: Partial<Pick<Task, 'dueDate' | 'label' | 'priority'>>,
): FinanceData => ({
  ...data,
  tasks: data.tasks.map((task) => {
    if (task.id !== taskId) return task;
    return { ...task, ...input, label: input.label?.trim() || task.label };
  }),
});

export const completeTask = (data: FinanceData, taskId: string, completedAt: string = todayISO()): FinanceData => ({
  ...data,
  tasks: data.tasks.map((task) => (task.id === taskId ? { ...task, status: 'done', completedAt } : task)),
});

export const cancelTask = (data: FinanceData, taskId: string): FinanceData => ({
  ...data,
  tasks: data.tasks.map((task) => (task.id === taskId ? { ...task, status: 'cancelled', completedAt: null } : task)),
});

/** Rouvre une tâche faite ou annulée par erreur. */
export const reopenTask = (data: FinanceData, taskId: string): FinanceData => ({
  ...data,
  tasks: data.tasks.map((task) => (task.id === taskId ? { ...task, status: 'open', completedAt: null } : task)),
});

export const deleteTask = (data: FinanceData, taskId: string): FinanceData => ({
  ...data,
  tasks: data.tasks.filter((task) => task.id !== taskId),
});

export const openTasksForOpportunity = (data: FinanceData, opportunityId: string): Task[] =>
  data.tasks
    .filter((task) => task.opportunityId === opportunityId && task.status === 'open')
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

export const openTasksForProspect = (data: FinanceData, prospectId: string): Task[] =>
  data.tasks
    .filter((task) => task.prospectId === prospectId && task.status === 'open')
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

/** Tâches ouvertes à traiter aujourd'hui : en retard ou dues du jour, priorité haute d'abord. */
export const dueTasks = (data: FinanceData, today: string = todayISO()): Task[] => {
  const priorityWeight: Record<Task['priority'], number> = { high: 0, normal: 1, low: 2 };

  return data.tasks
    .filter((task) => task.status === 'open' && task.dueDate <= today)
    .sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) || priorityWeight[left.priority] - priorityWeight[right.priority],
    );
};

/**
 * R5 — cadence de rappel après un contact : J+2, J+7, J+21, J+45, puis
 * trimestriel. Le rang se déduit du nombre d'interactions déjà enregistrées.
 *
 * `Interaction` reste volontairement sans lien vers `Opportunity` (aucun
 * changement au modèle existant, voir la décision d'architecture) : le rang
 * se calcule donc sur les interactions du **prospect**, seul niveau où
 * l'historique de contact existe réellement.
 */
const CADENCE_DELAYS_DAYS = [2, 7, 21, 45] as const;
const QUARTERLY_DELAY_DAYS = 90;

const cadenceDelayDays = (interactionCount: number): number => {
  const index = interactionCount - 1;
  if (index < 0) return CADENCE_DELAYS_DAYS[0];
  if (index < CADENCE_DELAYS_DAYS.length) return CADENCE_DELAYS_DAYS[index];
  return QUARTERLY_DELAY_DAYS;
};

/**
 * Libellés orientés valeur, jamais « relancer » : une proposition à ajuster
 * ou valider en un geste, pas un texte imposé.
 */
const CADENCE_LABELS = [
  'Envoyer un complément utile suite à l’échange',
  'Partager un cas client ou une référence pertinente',
  'Proposer un point d’avancement concret',
  'Reprendre contact avec une actualité ou une offre adaptée',
];
const QUARTERLY_LABEL = 'Prendre des nouvelles et partager une actualité';

const suggestedLabelForRank = (interactionCount: number): string => {
  const index = interactionCount - 1;
  if (index >= 0 && index < CADENCE_LABELS.length) return CADENCE_LABELS[index];
  return QUARTERLY_LABEL;
};

export type TaskSuggestion = { label: string; dueDate: string; priority: Task['priority'] };

export const suggestNextTask = (input: {
  /** Nombre d'interactions du prospect une fois celle qu'on vient de journaliser incluse. */
  interactionCount: number;
  fromDate: string;
}): TaskSuggestion => ({
  label: suggestedLabelForRank(input.interactionCount),
  dueDate: addDays(input.fromDate, cadenceDelayDays(input.interactionCount)),
  priority: 'normal',
});

/** Jours écoulés depuis l'échéance d'une tâche en retard, 0 si elle n'est pas en retard. */
export const daysOverdue = (task: Task, today: string = todayISO()): number => Math.max(0, daysBetween(task.dueDate, today));
