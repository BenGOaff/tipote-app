// Badge Tipote injecté sur la page LinkedIn /feed/update/<urn>/ quand
// un post correspond à une tâche d'engagement assignée à l'utilisateur.
// Le badge est en position fixed bottom-right (n'interfère pas avec le
// DOM LinkedIn obfusqué) et propose les 4 tons de commentaire pré-générés
// par l'IA + un bouton "pas pertinent".
//
// Architecture : on lit les tâches depuis chrome.storage.local (rempli
// par le service worker qui polle /api/pod/tasks/pending). Match par
// activity URN.
//
// Preact rendu dans un host element créé dynamiquement — on n'importe
// PAS preact ici parce que le content script doit rester en IIFE petit.
// On utilise le DOM natif + un peu de templating string. Phase 2.5
// initial, on peut basculer en Preact plus tard si la complexité monte.

import { voyagerLike, voyagerComment } from "./voyager";

type Task = {
  id: string;
  status: "pending" | "liked" | "commented" | "completed" | "expired" | "declined" | "failed";
  ai_comment_suggestions: Record<string, string> | null;
  pod_posts: {
    id: string;
    linkedin_post_urn: string;
    post_url: string | null;
    content_excerpt: string | null;
    language: string | null;
    eligible_until: string;
    author_user_id: string;
  };
};

type Tone = "agree" | "disagree" | "add_value" | "ask_question";

const TONE_LABELS: Record<Tone, { label: string; emoji: string }> = {
  agree: { label: "Je suis d'accord", emoji: "✅" },
  disagree: { label: "Je ne suis pas d'accord", emoji: "🤔" },
  add_value: { label: "Ajouter de la valeur", emoji: "💡" },
  ask_question: { label: "Poser une question", emoji: "❓" },
};

// Suggestions de fallback si l'IA n'a pas encore généré (Phase 3
// remplacera par les vraies suggestions personnalisées au style du
// commenteur).
const FALLBACK_SUGGESTIONS: Record<Tone, string> = {
  agree: "Totalement d'accord avec ce point — c'est exactement ce qu'on observe sur le terrain.",
  disagree: "Intéressant, mais je vois les choses différemment. Le contexte joue beaucoup ici.",
  add_value: "À compléter : ça fonctionne particulièrement bien quand on l'applique en amont.",
  ask_question: "Question : comment tu adaptes ça quand l'équipe n'est pas encore alignée ?",
};

const BADGE_HOST_ID = "tipote-boost-badge-host";
let mountedForUrn: string | null = null;

export async function mountBadge(activityUrn: string): Promise<void> {
  if (mountedForUrn === activityUrn) return; // déjà monté pour ce post
  removeBadge();

  // Cherche la tâche correspondante dans chrome.storage.local.
  const data = await chrome.storage.local.get(["tipote.tasks.pending"]);
  const tasks = (data["tipote.tasks.pending"] as Task[] | undefined) ?? [];
  const task = tasks.find((t) => t.pod_posts?.linkedin_post_urn === activityUrn);

  if (!task) {
    console.log("[tipote/badge] no task for", activityUrn, "— not mounting");
    return;
  }
  if (task.status !== "pending" && task.status !== "liked") {
    console.log("[tipote/badge] task wrong status:", task.status);
    return;
  }

  console.log("[tipote/badge] mounting for task", task.id);

  const host = document.createElement("div");
  host.id = BADGE_HOST_ID;
  host.attachShadow({ mode: "open" });
  document.body.appendChild(host);

  renderBadge(host.shadowRoot!, task, activityUrn);
  mountedForUrn = activityUrn;
}

function removeBadge() {
  document.getElementById(BADGE_HOST_ID)?.remove();
  mountedForUrn = null;
}

function renderBadge(root: ShadowRoot, task: Task, activityUrn: string) {
  // Tout est inline (style + markup) pour rester self-contained dans le
  // shadow DOM — LinkedIn ne peut ni inspecter ni overrider notre CSS.
  const style = `
    :host { all: initial; }
    .panel {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 360px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.18);
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111;
      font-size: 13px;
      line-height: 1.5;
      z-index: 2147483647;
    }
    .header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .logo { width: 22px; height: 22px; border-radius: 6px; background: #5d6cdb; color: white; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; }
    .title { font-weight: 600; font-size: 13px; flex: 1; }
    .close { background: transparent; border: 0; cursor: pointer; color: #888; font-size: 18px; padding: 0 4px; }
    .lead { color: #6b7280; font-size: 12px; margin-bottom: 10px; }
    .tones { display: flex; flex-direction: column; gap: 6px; }
    .tone-btn { display: flex; align-items: center; gap: 8px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; cursor: pointer; text-align: left; font-size: 13px; color: #111; transition: background 0.1s; }
    .tone-btn:hover { background: #eef2ff; border-color: #c7d2fe; }
    .tone-btn:disabled { opacity: 0.5; cursor: wait; }
    .tone-emoji { font-size: 16px; }
    .editor { display: none; flex-direction: column; gap: 6px; margin-top: 8px; }
    .editor.show { display: flex; }
    textarea { width: 100%; min-height: 70px; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font: inherit; font-size: 13px; resize: vertical; box-sizing: border-box; }
    .editor-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .btn { padding: 6px 12px; border-radius: 999px; font-size: 12px; cursor: pointer; border: 0; font-weight: 500; }
    .btn-primary { background: #5d6cdb; color: white; }
    .btn-primary:disabled { opacity: 0.5; cursor: wait; }
    .btn-ghost { background: transparent; color: #6b7280; }
    .decline { font-size: 11px; color: #9ca3af; text-decoration: underline; cursor: pointer; background: transparent; border: 0; padding: 0; margin-top: 8px; }
    .status { font-size: 11px; padding: 6px 8px; border-radius: 6px; margin-top: 6px; }
    .status.ok { background: #ecfdf5; color: #047857; }
    .status.err { background: #fee2e2; color: #b91c1c; }
  `;

  const excerpt = task.pod_posts.content_excerpt?.slice(0, 140) ?? "";
  const liked = task.status === "liked";

  root.innerHTML = `
    <style>${style}</style>
    <div class="panel" role="dialog" aria-label="Tipote Boost">
      <div class="header">
        <div class="logo">T</div>
        <div class="title">Tipote suggère un commentaire</div>
        <button class="close" aria-label="Fermer">×</button>
      </div>
      <div class="lead">
        ${liked ? "✓ Like envoyé. " : ""}Choisis un ton — tu pourras éditer avant de publier.
        ${excerpt ? `<div style="margin-top:6px;font-style:italic;color:#6b7280;">"${escapeHtml(excerpt)}…"</div>` : ""}
      </div>
      <div class="tones">
        ${(Object.keys(TONE_LABELS) as Tone[]).map((tone) => `
          <button class="tone-btn" data-tone="${tone}">
            <span class="tone-emoji">${TONE_LABELS[tone].emoji}</span>
            <span>${TONE_LABELS[tone].label}</span>
          </button>
        `).join("")}
      </div>
      <div class="editor" id="editor">
        <textarea id="editor-text" placeholder="Édite le commentaire avant publication…"></textarea>
        <div class="editor-actions">
          <button class="btn btn-ghost" id="cancel">Retour</button>
          <button class="btn btn-primary" id="publish">Publier</button>
        </div>
      </div>
      <div id="status"></div>
      <button class="decline" id="decline">Pas pertinent pour moi</button>
    </div>
  `;

  // Wire events
  root.querySelector(".close")?.addEventListener("click", removeBadge);

  const editor = root.getElementById("editor") as HTMLDivElement;
  const editorText = root.getElementById("editor-text") as HTMLTextAreaElement;
  const tonesContainer = root.querySelector(".tones") as HTMLDivElement;
  const statusEl = root.getElementById("status") as HTMLDivElement;
  let selectedTone: Tone | null = null;

  root.querySelectorAll<HTMLButtonElement>(".tone-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tone = btn.dataset.tone as Tone;
      selectedTone = tone;
      const suggestion = task.ai_comment_suggestions?.[tone] ?? FALLBACK_SUGGESTIONS[tone];
      editorText.value = suggestion;
      tonesContainer.style.display = "none";
      editor.classList.add("show");
      editorText.focus();
    });
  });

  root.getElementById("cancel")?.addEventListener("click", () => {
    selectedTone = null;
    tonesContainer.style.display = "flex";
    editor.classList.remove("show");
  });

  root.getElementById("publish")?.addEventListener("click", async () => {
    const btn = root.getElementById("publish") as HTMLButtonElement;
    if (!selectedTone) return;
    const text = editorText.value.trim();
    if (!text) {
      showStatus(statusEl, "err", "Texte vide.");
      return;
    }
    btn.disabled = true;
    showStatus(statusEl, "ok", "Envoi en cours…");

    try {
      // 1. Like si pas encore fait
      if (!liked) {
        const likeResult = await voyagerLike(activityUrn);
        if (likeResult.ok) {
          await new Promise<void>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "task/like", payload: { taskId: task.id } },
              () => resolve(),
            );
          });
        } else {
          showStatus(statusEl, "err", `Like échec (${likeResult.status}). On continue avec le commentaire.`);
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      // 2. Commentaire
      const commentResult = await voyagerComment(activityUrn, text);
      if (!commentResult.ok) {
        showStatus(statusEl, "err", `Commentaire échec (${commentResult.status}). Réessaye plus tard.`);
        btn.disabled = false;
        return;
      }
      // 3. Notif backend
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          { type: "task/comment", payload: { taskId: task.id, selectedTone, postedCommentText: text } },
          () => resolve(),
        );
      });
      showStatus(statusEl, "ok", "✓ Boost envoyé. Merci !");
      setTimeout(removeBadge, 1800);
    } catch (err) {
      console.warn("[tipote/badge] publish error", err);
      showStatus(statusEl, "err", "Erreur réseau. Réessaye dans un instant.");
      btn.disabled = false;
    }
  });

  root.getElementById("decline")?.addEventListener("click", async () => {
    showStatus(statusEl, "ok", "Tâche déclinée. Merci pour le signal.");
    await new Promise<void>((resolve) => {
      chrome.runtime.sendMessage(
        { type: "task/decline", payload: { taskId: task.id, reason: "user_clicked_not_relevant" } },
        () => resolve(),
      );
    });
    setTimeout(removeBadge, 1200);
  });
}

function showStatus(el: HTMLDivElement, kind: "ok" | "err", msg: string) {
  el.className = `status ${kind}`;
  el.textContent = msg;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
