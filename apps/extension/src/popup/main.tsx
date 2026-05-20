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

const TIPOTE_LANDING_URL = "https://www.tipote.fr/";
const TIPOTE_PRIVACY_URL = `${TIPOTE_API_BASE}/legal/extension`;

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

function Popup() {
  const [stored, setStored] = useState<StoredUser>(null);
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(
      [STORAGE_KEYS.CONNECTED_USER, STORAGE_KEYS.PENDING_TASKS],
      (data) => {
        setStored(data[STORAGE_KEYS.CONNECTED_USER] ?? null);
        setTasks((data[STORAGE_KEYS.PENDING_TASKS] as PendingTask[] | undefined) ?? []);
        setLoading(false);
      },
    );
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: "#666" }}>Chargement…</p>;
  }

  const profile = stored?.linkedin_profile ?? null;
  const isConnected = !!profile;

  return (
    <div>
      <h1 style={{ fontSize: 16, margin: "0 0 8px", fontWeight: 600 }}>Tipote Boost</h1>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
        Boost organique collaboratif pour LinkedIn
      </p>

      {isConnected ? (
        <>
          <div style={styles.card}>
            ✓ Connecté
            {profile?.full_name && (
              <div style={{ marginTop: 4, fontWeight: 500, color: "#064e3b" }}>
                {profile.full_name}
              </div>
            )}
            {stored?.karma && (
              <div style={{ marginTop: 4, color: "#047857" }}>
                {stored.karma.boosts_given} donnés · {stored.karma.boosts_received} reçus
              </div>
            )}
          </div>

          {/* Tâches en attente */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              {tasks.length === 0
                ? "Aucune tâche en attente"
                : `${tasks.length} tâche${tasks.length > 1 ? "s" : ""} en attente`}
            </div>
            {tasks.length === 0 ? (
              <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                Tu es à jour. Les nouvelles publications du pod apparaîtront ici.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                {tasks.map((t) => (
                  <a
                    key={t.id}
                    href={
                      t.pod_posts.post_url ??
                      `https://www.linkedin.com/feed/update/${t.pod_posts.linkedin_post_urn}/`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.taskItem}
                  >
                    <div style={{ color: "#5d6cdb", fontSize: 11, marginBottom: 4 }}>
                      → Voir le post
                    </div>
                    <div style={{ color: "#374151" }}>
                      {(t.pod_posts.content_excerpt ?? "Post à booster").slice(0, 120)}
                      {t.pod_posts.content_excerpt && t.pod_posts.content_excerpt.length > 120
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
              Mon dashboard
            </a>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
            Pour activer le boost, connecte-toi à Tipote puis ouvre LinkedIn.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <a
              href={`${TIPOTE_API_BASE}/boost`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.primaryBtn}
            >
              J'ai un compte Tipote →
            </a>
            <a
              href={TIPOTE_LANDING_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.secondaryBtn}
            >
              Découvrir Tipote
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
          Politique de confidentialité
        </a>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) render(<Popup />, root);
