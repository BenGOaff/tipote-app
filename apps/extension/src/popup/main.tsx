// Popup affiché quand l'user clique sur l'icône de l'extension.
// 3 vues selon l'état du user dans chrome.storage.local :
//   - Pas connecté à Tipote → 2 CTAs (existant / découverte)
//   - Connecté mais 0 tâche en attente → message "Tu es à jour"
//   - Connecté + tâches en attente → liste cliquable, chaque tâche ouvre
//     son permalink LinkedIn (où le content script monte le badge).
//
// Lien privacy en bas, requis CWS.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { STORAGE_KEYS, TIPOTE_API_BASE } from "../config";
import { t } from "../i18n";

const TIPOTE_LANDING_URL = "https://www.tipote.fr/";
const TIPOTE_PRIVACY_URL = `${TIPOTE_API_BASE}/legal/extension`;

// Firefox : les host permissions MV3 sont OPT-IN (contrairement à Chrome
// où elles sont accordées à l'installation). Tant que l'user ne les a pas
// accordées, AUCUN content script ne s'injecte et le background ne peut
// pas fetch le backend → l'extension est inerte. On détecte le cas et on
// affiche une carte d'onboarding avec un bouton permissions.request()
// (autorisé ici : un clic dans le popup compte comme user gesture).
const IS_FIREFOX = chrome.runtime.getURL("").startsWith("moz-extension:");

function manifestOrigins(): string[] {
  return (chrome.runtime.getManifest().host_permissions ?? []) as string[];
}

function PermissionsCard({ onGranted }: { onGranted: () => void }) {
  const [requesting, setRequesting] = useState(false);
  return (
    <div
      style={{
        background: "#fffbeb",
        border: "1px solid #fcd34d",
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
        color: "#78350f",
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ {t("popup.permTitle")}</div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>{t("popup.permDesc")}</p>
      <button
        disabled={requesting}
        onClick={() => {
          setRequesting(true);
          chrome.permissions.request({ origins: manifestOrigins() }, (granted) => {
            setRequesting(false);
            if (granted) onGranted();
          });
        }}
        style={{
          ...styles.primaryBtn,
          border: "none",
          cursor: "pointer",
          width: "100%",
          opacity: requesting ? 0.6 : 1,
        }}
      >
        {t("popup.permCta")}
      </button>
      <p style={{ margin: "6px 0 0", fontSize: 10, color: "#92400e" }}>{t("popup.permHint")}</p>
    </div>
  );
}

type LinkedInProfile = {
  linkedin_urn: string;
  full_name: string | null;
  headline: string | null;
} | null;

type StoredUser = {
  linkedin_profile: LinkedInProfile;
  memberships: Array<{ pod_id: string; pods: { name: string } }>;
  karma?: { boosts_given: number; boosts_received: number } | null;
} | null;

type PendingTask = {
  id: string;
  status: string;
  pod_posts: {
    linkedin_post_urn: string;
    post_url: string | null;
    content_excerpt: string | null;
    eligible_until: string;
  };
};

const styles = {
  card: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: "#065f46",
  },
  primaryBtn: {
    display: "inline-block",
    background: "#5d6cdb",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    textAlign: "center" as const,
  },
  secondaryBtn: {
    display: "inline-block",
    background: "#fff",
    color: "#5d6cdb",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    textAlign: "center" as const,
    border: "1px solid #5d6cdb",
  },
  taskItem: {
    display: "block",
    padding: "10px 12px",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 12,
    color: "#111",
    textDecoration: "none",
    cursor: "pointer" as const,
  },
};

// ─── Vue Réglages (Béné 12 juin 2026) ────────────────────────────────
// Réglages du commentateur IA éditables directement depuis le popup :
// ton, langue de réponse (langue du post vs langue de l'user),
// tutoiement/vouvoiement, domaine d'expertise. Source de vérité =
// backend (/api/automation/settings via le background), donc synchro
// automatique avec l'onglet Réglages de la page /boost de Tipote.

type SettingsState = {
  hasAccess: boolean;
  styleTon: string;
  availableStyles: string[];
  // "post" (langue du post) | "user" (ma langue de contenu) | code ISO
  // 2 lettres pour forcer une langue précise (fr, en, es...).
  replyLanguageMode: string;
  addressForm: "auto" | "tu" | "vous";
  domain: string;
};

const fieldStyles = {
  label: { display: "block", fontSize: 11, fontWeight: 600 as const, margin: "10px 0 3px", color: "#374151" },
  control: {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "6px 8px",
    fontSize: 12,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    background: "#fff",
    color: "#111",
  },
};

function SettingsView({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SettingsState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error" | "unauthorized">("loading");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "settings/get" }, (resp) => {
      if (!resp?.ok || !resp.settings) {
        setStatus("unauthorized");
        return;
      }
      const langage = (resp.settings.auto_comment_langage ?? {}) as Record<string, unknown>;
      setState({
        hasAccess: resp.hasAccess !== false,
        styleTon: String(resp.settings.auto_comment_style_ton ?? "professionnel"),
        availableStyles: Array.isArray(resp.available_styles)
          ? (resp.available_styles as string[])
          : ["amical", "professionnel"],
        replyLanguageMode:
          typeof langage.reply_language_mode === "string" &&
          (langage.reply_language_mode === "user" ||
            /^[a-z]{2}$/.test(langage.reply_language_mode))
            ? langage.reply_language_mode
            : "post",
        addressForm:
          langage.address_form === "tu" || langage.address_form === "vous"
            ? (langage.address_form as "tu" | "vous")
            : "auto",
        domain: typeof langage.domain === "string" ? langage.domain : "",
      });
      setStatus("ready");
    });
  }, []);

  const save = () => {
    if (!state) return;
    setStatus("saving");
    chrome.runtime.sendMessage(
      {
        type: "settings/save",
        payload: {
          auto_comment_style_ton: state.styleTon,
          auto_comment_langage: {
            reply_language_mode: state.replyLanguageMode,
            address_form: state.addressForm,
            domain: state.domain.trim(),
          },
        },
      },
      (resp) => {
        setStatus(resp?.ok ? "saved" : "error");
        if (resp?.ok) setTimeout(() => setStatus("ready"), 1800);
      },
    );
  };

  return (
    <div>
      <button
        onClick={onBack}
        style={{ background: "none", border: "none", color: "#5d6cdb", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 8 }}
      >
        ← {t("settings.back")}
      </button>
      <h2 style={{ fontSize: 14, margin: "0 0 4px", fontWeight: 600 }}>{t("settings.title")}</h2>

      {status === "loading" ? (
        <p style={{ fontSize: 12, color: "#666" }}>{t("popup.loading")}</p>
      ) : status === "unauthorized" || !state ? (
        <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{t("settings.needLogin")}</p>
      ) : !state.hasAccess ? (
        <p style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>{t("settings.needPlan")}</p>
      ) : (
        <>
          <label style={fieldStyles.label}>{t("settings.tone")}</label>
          <select
            style={fieldStyles.control}
            value={state.styleTon}
            onChange={(e) => setState({ ...state, styleTon: (e.target as HTMLSelectElement).value })}
          >
            {state.availableStyles.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label style={fieldStyles.label}>{t("settings.replyLang")}</label>
          <select
            style={fieldStyles.control}
            value={state.replyLanguageMode}
            onChange={(e) =>
              setState({ ...state, replyLanguageMode: (e.target as HTMLSelectElement).value })
            }
          >
            <option value="post">{t("settings.replyLangPost")}</option>
            <option value="user">{t("settings.replyLangUser")}</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="it">Italiano</option>
            <option value="pt">Português</option>
            <option value="de">Deutsch</option>
            <option value="nl">Nederlands</option>
          </select>

          <label style={fieldStyles.label}>{t("settings.addressForm")}</label>
          <select
            style={fieldStyles.control}
            value={state.addressForm}
            onChange={(e) =>
              setState({ ...state, addressForm: (e.target as HTMLSelectElement).value as "auto" | "tu" | "vous" })
            }
          >
            <option value="auto">{t("settings.addressAuto")}</option>
            <option value="tu">{t("settings.addressTu")}</option>
            <option value="vous">{t("settings.addressVous")}</option>
          </select>

          <label style={fieldStyles.label}>{t("settings.domain")}</label>
          <input
            style={fieldStyles.control}
            value={state.domain}
            placeholder={t("settings.domainPlaceholder")}
            onInput={(e) => setState({ ...state, domain: (e.target as HTMLInputElement).value })}
          />
          <p style={{ fontSize: 10, color: "#888", margin: "3px 0 0", lineHeight: 1.4 }}>
            {t("settings.domainHint")}
          </p>

          <button
            onClick={save}
            disabled={status === "saving"}
            style={{ ...styles.primaryBtn, border: "none", cursor: "pointer", width: "100%", marginTop: 14, opacity: status === "saving" ? 0.6 : 1 }}
          >
            {status === "saving" ? "…" : status === "saved" ? `✓ ${t("settings.saved")}` : t("settings.save")}
          </button>
          {status === "error" && (
            <p style={{ fontSize: 11, color: "#b91c1c", marginTop: 6 }}>{t("settings.error")}</p>
          )}

          <a
            href={`${TIPOTE_API_BASE}/boost?tab=settings`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", fontSize: 11, color: "#5d6cdb", marginTop: 10, textDecoration: "underline" }}
          >
            {t("settings.moreLink")}
          </a>
        </>
      )}
    </div>
  );
}

function Popup() {
  const [stored, setStored] = useState<StoredUser>(null);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home" | "settings">("home");
  const [missingPerms, setMissingPerms] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.CONNECTED_USER, STORAGE_KEYS.PENDING_TASKS],
      (data) => {
        setStored(data[STORAGE_KEYS.CONNECTED_USER] ?? null);
        setTasks((data[STORAGE_KEYS.PENDING_TASKS] as PendingTask[] | undefined) ?? []);
        setLoading(false);
      },
    );
    // Firefox : vérifie que les host permissions du manifest sont toutes
    // accordées. Sur Chrome elles le sont d'office → check skippé.
    if (IS_FIREFOX && chrome.permissions?.contains) {
      chrome.permissions.contains({ origins: manifestOrigins() }, (granted) => {
        setMissingPerms(!granted);
      });
    }
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: "#666" }}>{t("popup.loading")}</p>;
  }

  const profile = stored?.linkedin_profile ?? null;
  const isConnected = !!profile;
  const tasksLabel = tasks.length === 0
    ? t("popup.noTasksTitle")
    : `${tasks.length} ${tasks.length > 1 ? t("popup.taskCountPlural") : t("popup.taskCountSingular")}`;

  if (view === "settings") {
    return <SettingsView onBack={() => setView("home")} />;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>Tipote Boost</h1>
        {isConnected && (
          <button
            onClick={() => setView("settings")}
            title={t("settings.open")}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 2, lineHeight: 1 }}
          >
            ⚙️
          </button>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
        {t("popup.tagline")}
      </p>

      {missingPerms && <PermissionsCard onGranted={() => setMissingPerms(false)} />}

      {isConnected ? (
        <>
          <div style={styles.card}>
            ✓ {t("popup.connected")}
            {profile?.full_name && (
              <div style={{ marginTop: 4, fontWeight: 500, color: "#064e3b" }}>
                {profile.full_name}
              </div>
            )}
            {stored?.karma && (
              <div style={{ marginTop: 4, color: "#047857" }}>
                {stored.karma.boosts_given} {t("popup.karmaGiven")} · {stored.karma.boosts_received} {t("popup.karmaReceived")}
              </div>
            )}
          </div>

          {/* Tâches en attente / Pending tasks */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {tasksLabel}
            </div>
            {tasks.length === 0 ? (
              <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                {t("popup.noTasksDesc")}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {tasks.map((task) => (
                  <a
                    key={task.id}
                    href={
                      task.pod_posts.post_url ??
                      `https://www.linkedin.com/feed/update/${task.pod_posts.linkedin_post_urn}/`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.taskItem}
                  >
                    <div style={{ color: "#5d6cdb", fontSize: 11, marginBottom: 4 }}>
                      {t("popup.viewPost")}
                    </div>
                    <div style={{ color: "#374151" }}>
                      {(task.pod_posts.content_excerpt ?? t("popup.postFallback")).slice(0, 120)}
                      {task.pod_posts.content_excerpt && task.pod_posts.content_excerpt.length > 120
                        ? "…"
                        : ""}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <a
              href={`${TIPOTE_API_BASE}/boost`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.secondaryBtn, display: "block" }}
            >
              {t("popup.dashboard")}
            </a>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
            {t("popup.notConnectedDesc")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a
              href={`${TIPOTE_API_BASE}/boost`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.primaryBtn}
            >
              {t("popup.haveAccount")}
            </a>
            <a
              href={TIPOTE_LANDING_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.secondaryBtn}
            >
              {t("popup.discover")}
            </a>
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px solid #eee",
          fontSize: 10,
          color: "#999",
          textAlign: "center",
        }}
      >
        <a
          href={TIPOTE_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#999", textDecoration: "underline" }}
        >
          {t("popup.privacy")}
        </a>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) render(<Popup />, root);
