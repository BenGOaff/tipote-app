// Popup affiché quand l'user clique sur l'icône de l'extension dans la
// barre Chrome. Affiche l'état "connecté ou non" en fonction de
// chrome.storage.local + 2 CTAs distinctes selon le contexte :
//   - User connecté → ouvre le dashboard /boost
//   - User non connecté → 2 boutons :
//       "J'ai un compte" → app.tipote.com/boost (auth Supabase)
//       "Découvrir Tipote" → tipote.fr (landing commerciale, pour les
//       gens qui sont tombés sur l'extension par hasard via CWS).
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
  fetched_at: number;
} | null;

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
};

function Popup() {
  const [stored, setStored] = useState<StoredUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.CONNECTED_USER], (data) => {
      setStored(data[STORAGE_KEYS.CONNECTED_USER] ?? null);
      setLoading(false);
    });
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
            {stored?.memberships && stored.memberships.length > 0 && (
              <div style={{ marginTop: 4, color: "#047857" }}>
                {stored.memberships.length} pod
                {stored.memberships.length > 1 ? "s" : ""} actif
                {stored.memberships.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <a
              href={`${TIPOTE_API_BASE}/boost`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.primaryBtn, display: "block" }}
            >
              Voir mon dashboard →
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
