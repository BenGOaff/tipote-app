// Badge Tipote injecté sur la page LinkedIn /feed/update/<urn>/.
//
// Deux modes :
//   - "task" : le post correspond à une tâche d'engagement assignée
//     dans le pod Tipote. Suggestions IA pré-générées au fan-out
//     (lues depuis chrome.storage.local["tipote.tasks.pending"]).
//     Auto-like + bump karma à la publication du commentaire.
//   - "quick" : le post est hors-pod (Béné, 19 mai 2026 : "permettre
//     de commenter rapidement les posts d'autres users aussi"). On
//     demande à /api/pod/ai-suggest de générer les 4 suggestions à la
//     volée à partir du contenu scrapé sur la page. Pas d'auto-like
//     (l'user peut liker manuellement avec le bouton LinkedIn natif),
//     pas de karma — c'est juste un outil de productivité de
//     commentaire IA-assisté.
//
// Le badge s'inject toujours en shadow DOM bottom-right pour zéro
// interférence avec le CSS LinkedIn (qui change régulièrement).

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

// Fallback statique si l'IA est down + qu'aucune suggestion n'est
// dispo via la task. Identique côté serveur dans podAiSuggest.ts.
const FALLBACK_SUGGESTIONS: Record<Tone, string> = {
  agree: "Très juste, c'est exactement ce qu'on observe sur le terrain.",
  disagree: "Intéressant, mais je vois les choses différemment — le contexte joue beaucoup ici.",
  add_value: "À compléter : ça fonctionne particulièrement bien quand on l'applique en amont.",
  ask_question: "Question : comment tu adaptes ça quand l'équipe n'est pas encore alignée ?",
};

const BADGE_HOST_ID = "tipote-boost-badge-host";
let mountedForUrn: string | null = null;

type Mode = { kind: "task"; task: Task } | { kind: "quick"; activityUrn: string };

export async function mountBadge(activityUrn: string): Promise<void> {
  if (mountedForUrn === activityUrn) return;
  removeBadge();

  // 1. Match avec une task ?
  const data = await chrome.storage.local.get(["tipote.tasks.pending"]);
  const tasks = (data["tipote.tasks.pending"] as Task[] | undefined) ?? [];
  const task = tasks.find((t) => t.pod_posts?.linkedin_post_urn === activityUrn);

  let mode: Mode;
  if (task && (task.status === "pending" || task.status === "liked")) {
    mode = { kind: "task", task };
  } else {
    mode = { kind: "quick", activityUrn };
  }

  console.log("[tipote/badge] mounting", mode.kind, "for", activityUrn);

  const host = document.createElement("div");
  host.id = BADGE_HOST_ID;
  host.attachShadow({ mode: "open" });
  document.body.appendChild(host);
  renderBadge(host.shadowRoot!, mode, activityUrn);
  mountedForUrn = activityUrn;
}

function removeBadge() {
  document.getElementById(BADGE_HOST_ID)?.remove();
  mountedForUrn = null;
}

/** Scrape le contenu du post depuis la page (mode quick). LinkedIn
 *  permalink page = un seul post visible, donc on peut prendre le
 *  premier <article> ou le titre. Heuristique simple, OK pour v1. */
function scrapePostContent(): string | null {
  // <article> est l'élément stable utilisé par LinkedIn pour le post
  // principal sur les pages /feed/update/. Classes obfusquées mais
  // le rôle ARIA reste.
  const article = document.querySelector('article, [role="article"]');
  if (article) {
    const text = (article.textContent ?? "").trim();
    if (text.length > 50) return text.slice(0, 1500);
  }
  // Fallback sur le <title> (LinkedIn y met l'auteur + un excerpt).
  const title = document.title;
  if (title && !/^LinkedIn$/i.test(title)) return title.slice(0, 500);
  return null;
}

function detectLanguageFromCookie(): string {
  const m = document.cookie.match(/li_lang=([^;]+)/);
  if (m) return decodeURIComponent(m[1]).slice(0, 2).toLowerCase();
  return (navigator.language || "fr").slice(0, 2).toLowerCase();
}

function renderBadge(root: ShadowRoot, mode: Mode, activityUrn: string) {
  const isTask = mode.kind === "task";
  const liked = isTask && mode.task.status === "liked";
  const excerpt = isTask ? mode.task.pod_posts.content_excerpt?.slice(0, 140) ?? "" : "";

  // Charge les suggestions selon le mode. En mode task, on les a déjà
  // (pré-générées au fan-out). En mode quick, on demande au backend.
  const initialSuggestions =
    isTask ? mode.task.ai_comment_suggestions : null;

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
    .mode-badge { font-size: 10px; padding: 2px 6px; border-radius: 999px; background: #eef2ff; color: #4338ca; text-transform: uppercase; letter-spacing: 0.5px; }
    .mode-badge.quick { background: #f0f9ff; color: #0369a1; }
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
    .status.loading { background: #f3f4f6; color: #4b5563; }
    .loader { display: inline-block; width: 12px; height: 12px; border: 2px solid #c7d2fe; border-top-color: #5d6cdb; border-radius: 50%; animation: spin 0.8s linear infinite; margin-right: 6px; vertical-align: -2px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;

  root.innerHTML = `
    <style>${style}</style>
    <div class="panel" role="dialog" aria-label="Tipote Boost">
      <div class="header">
        <div class="logo">T</div>
        <div class="title">${isTask ? "Boost pod" : "Quick comment"}</div>
        <span class="mode-badge ${isTask ? "" : "quick"}">${isTask ? "Pod" : "IA"}</span>
        <button class="close" aria-label="Fermer">×</button>
      </div>
      <div class="lead" id="lead">
        ${
          isTask
            ? `${liked ? "✓ Like envoyé. " : ""}Choisis un ton — tu pourras éditer avant publication.`
            : "L'IA suggère 4 angles dans 4 tons différents pour commenter rapidement ce post."
        }
        ${excerpt ? `<div style="margin-top:6px;font-style:italic;color:#6b7280;">"${escapeHtml(excerpt)}…"</div>` : ""}
      </div>
      <div class="tones" id="tones-container">
        ${(Object.keys(TONE_LABELS) as Tone[]).map((tone) => `
          <button class="tone-btn" data-tone="${tone}" disabled>
            <span class="tone-emoji">${TONE_LABELS[tone].emoji}</span>
            <span>${TONE_LABELS[tone].label}</span>
          </button>
        `).join("")}
      </div>
      <div class="editor" id="editor">
        <textarea id="editor-text" placeholder="Édite le commentaire avant publication…"></textarea>
        <div class="editor-actions">
          <button class="btn btn-ghost" id="cancel">Retour</button>
          <button class="btn btn-primary" id="publish">Publier sur LinkedIn</button>
        </div>
      </div>
      <div id="status"></div>
      ${isTask ? `<button class="decline" id="decline">Pas pertinent pour moi</button>` : ""}
    </div>
  `;

  const editor = root.getElementById("editor") as HTMLDivElement;
  const editorText = root.getElementById("editor-text") as HTMLTextAreaElement;
  const tonesContainer = root.getElementById("tones-container") as HTMLDivElement;
  const statusEl = root.getElementById("status") as HTMLDivElement;
  const toneButtons = root.querySelectorAll<HTMLButtonElement>(".tone-btn");
  let selectedTone: Tone | null = null;
  let suggestions: Record<Tone, string> | null =
    initialSuggestions as Record<Tone, string> | null;

  root.querySelector(".close")?.addEventListener("click", removeBadge);

  // Active les boutons une fois les suggestions chargées.
  const enableTones = () => {
    toneButtons.forEach((b) => (b.disabled = false));
  };

  if (suggestions) {
    enableTones();
  } else {
    // Mode quick : on charge les suggestions à la volée.
    showStatus(statusEl, "loading", "<span class='loader'></span>Génération des suggestions IA…");
    const content = scrapePostContent();
    const language = detectLanguageFromCookie();
    chrome.runtime.sendMessage(
      {
        type: "ai/suggest",
        payload: {
          activity_urn: activityUrn,
          content_excerpt: content,
          language,
        },
      },
      (resp: unknown) => {
        const r = resp as { ok?: boolean; suggestions?: Record<string, string> } | undefined;
        if (r?.ok && r.suggestions) {
          suggestions = r.suggestions as Record<Tone, string>;
          showStatus(statusEl, "ok", "Choisis un ton ci-dessus.");
          setTimeout(() => (statusEl.textContent = ""), 1500);
        } else {
          // Fallback statique côté badge si l'API a échoué côté SW.
          suggestions = FALLBACK_SUGGESTIONS;
          showStatus(statusEl, "err", "IA indisponible — suggestions génériques.");
        }
        enableTones();
      },
    );
  }

  toneButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tone = btn.dataset.tone as Tone;
      selectedTone = tone;
      const text = suggestions?.[tone] ?? FALLBACK_SUGGESTIONS[tone];
      editorText.value = text;
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
    showStatus(statusEl, "loading", "<span class='loader'></span>Envoi en cours…");

    try {
      // Auto-like uniquement en mode task. Mode quick : l'user like
      // manuellement s'il veut, l'extension ne touche pas au like.
      if (isTask && !liked) {
        const likeResult = await voyagerLike(activityUrn);
        if (likeResult.ok) {
          await new Promise<void>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "task/like", payload: { taskId: mode.task.id } },
              () => resolve(),
            );
          });
        } else {
          // On continue avec le commentaire même si le like a foiré
          // (idempotent côté backend de toute façon).
          console.warn("[tipote/badge] like failed but continuing", likeResult);
        }
      }

      const commentResult = await voyagerComment(activityUrn, text);
      if (!commentResult.ok) {
        showStatus(statusEl, "err", `Commentaire échec (${commentResult.status}). Réessaye plus tard.`);
        btn.disabled = false;
        return;
      }

      // Notif backend seulement en mode task — quick comment ne touche
      // pas au karma (post hors-pod, c'est juste de la productivité).
      if (isTask) {
        await new Promise<void>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "task/comment",
              payload: {
                taskId: mode.task.id,
                selectedTone,
                postedCommentText: text,
              },
            },
            () => resolve(),
          );
        });
      }
      showStatus(statusEl, "ok", "✓ Commentaire publié.");
      setTimeout(removeBadge, 1800);
    } catch (err) {
      console.warn("[tipote/badge] publish error", err);
      showStatus(statusEl, "err", "Erreur réseau. Réessaye dans un instant.");
      btn.disabled = false;
    }
  });

  if (isTask) {
    root.getElementById("decline")?.addEventListener("click", async () => {
      showStatus(statusEl, "ok", "Tâche déclinée. Merci pour le signal.");
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "task/decline",
            payload: { taskId: mode.task.id, reason: "user_clicked_not_relevant" },
          },
          () => resolve(),
        );
      });
      setTimeout(removeBadge, 1200);
    });
  }
}

function showStatus(el: HTMLDivElement, kind: "ok" | "err" | "loading", html: string) {
  el.className = `status ${kind}`;
  el.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
