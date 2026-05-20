// Popup affiché quand l'user clique sur l'icône de l'extension dans la
// barre Chrome. V0 = squelette qui affiche l'état "connecté ou non" en
// fonction de chrome.storage.local. Phase 2.2 : ajout du bouton
// "Connecter mon compte Tipote" qui ouvre app.tipote.com/boost.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { STORAGE_KEYS, TIPOTE_API_BASE } from "../config";

type ConnectedUser = {
  user_id: string;
  linkedin_urn: string;
} | null;

function Popup() {
  const [user, setUser] = useState<ConnectedUser>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.CONNECTED_USER], (data) => {
      setUser(data[STORAGE_KEYS.CONNECTED_USER] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <p style={{ fontSize: 13, color: "#666" }}>Chargement…</p>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 16, margin: "0 0 8px", fontWeight: 600 }}>Tipote Boost</h1>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
        Boost organique collaboratif pour LinkedIn
      </p>

      {user ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            padding: 10,
            fontSize: 12,
            color: "#065f46",
          }}
        >
          ✓ Connecté
          <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11 }}>
            {user.linkedin_urn}
          </div>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 12px" }}>
            Pour activer le boost, connecte ton compte sur Tipote puis ouvre
            LinkedIn.
          </p>
          <a
            href={`${TIPOTE_API_BASE}/boost`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: "#5d6cdb",
              color: "#fff",
              padding: "8px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Ouvrir Tipote →
          </a>
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) render(<Popup />, root);
