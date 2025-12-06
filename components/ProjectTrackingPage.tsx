// components/ProjectTrackingPage.tsx
// Prototype du tableau de suivi type Trello (sans dépendances externes)

"use client";

type Checklist = {
  done: number;
  total: number;
};

type BoardTask = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  dueDate: string | null;
  checklist: Checklist;
  comments: number;
};

type BoardColumn = {
  id: string;
  title: string;
  color: string;
  tasks: BoardTask[];
};

const boards: BoardColumn[] = [
  {
    id: "todo",
    title: "À faire",
    color: "border-slate-300",
    tasks: [
      {
        id: "task-1",
        title: "Créer le lead magnet PDF",
        priority: "high",
        dueDate: "Dans 2 jours",
        checklist: { done: 2, total: 5 },
        comments: 3,
      },
      {
        id: "task-2",
        title: "Configurer la séquence email",
        priority: "medium",
        dueDate: "Cette semaine",
        checklist: { done: 0, total: 3 },
        comments: 1,
      },
    ],
  },
  {
    id: "in-progress",
    title: "En cours",
    color: "border-blue-400",
    tasks: [
      {
        id: "task-3",
        title: "Rédiger 10 posts LinkedIn",
        priority: "high",
        dueDate: "Aujourd'hui",
        checklist: { done: 6, total: 10 },
        comments: 2,
      },
      {
        id: "task-4",
        title: "Optimiser le tunnel de vente",
        priority: "medium",
        dueDate: "Dans 5 jours",
        checklist: { done: 2, total: 8 },
        comments: 2,
      },
    ],
  },
  {
    id: "done",
    title: "Terminé",
    color: "border-emerald-400",
    tasks: [
      {
        id: "task-5",
        title: "Analyser la concurrence",
        priority: "low",
        dueDate: null,
        checklist: { done: 5, total: 5 },
        comments: 2,
      },
      {
        id: "task-6",
        title: "Définir le persona cible",
        priority: "high",
        dueDate: null,
        checklist: { done: 7, total: 7 },
        comments: 2,
      },
    ],
  },
];

function priorityLabel(priority: BoardTask["priority"]) {
  if (priority === "high") return "Haute";
  if (priority === "medium") return "Moyenne";
  return "Basse";
}

export default function ProjectTrackingPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">
            Suivi Projet
          </h1>
          <p className="text-sm text-slate-500">
            Suis l&apos;avancement de tes actions étape par étape.
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {boards.map((board) => (
          <section
            key={board.id}
            className={`rounded-xl border ${board.color} bg-white p-3 md:p-4 shadow-sm flex flex-col`}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">
                {board.title}
              </h2>
              <span className="text-xs text-slate-400">
                {board.tasks.length} tâches
              </span>
            </div>

            <div className="space-y-3">
              {board.tasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{task.title}</p>
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                        task.priority === "high" &&
                          "bg-red-50 text-red-600 border border-red-200",
                        task.priority === "medium" &&
                          "bg-amber-50 text-amber-600 border border-amber-200",
                        task.priority === "low" &&
                          "bg-emerald-50 text-emerald-600 border border-emerald-200",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {priorityLabel(task.priority)}
                    </span>
                  </div>

                  {task.dueDate && (
                    <p className="text-xs text-slate-500">
                      Échéance&nbsp;: {task.dueDate}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <p>
                      Checklist&nbsp;: {task.checklist.done}/
                      {task.checklist.total}
                    </p>
                    <p>{task.comments} commentaire(s)</p>
                  </div>
                </article>
              ))}

              {board.tasks.length === 0 && (
                <p className="text-xs text-slate-400 italic">
                  Aucune tâche pour le moment.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
