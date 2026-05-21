// Script injecté dans le MAIN world de LinkedIn (pas dans le content
// script isolé). Le seul moyen fiable de détecter "l'utilisateur vient
// de publier un post" sans dépendre d'endpoints Voyager privés qui
// changent tous les 3-6 mois.
//
// Stratégie : on hook `window.fetch` et `XMLHttpRequest.prototype.send`
// pour observer les requêtes que la page LinkedIn fait elle-même. Quand
// LinkedIn POST vers son endpoint interne de création de post (URLs
// connues : /voyager/api/contentcreation/normShares, /ugcPosts, ou un
// graphql mutation), on lit la réponse, on extrait l'URN du nouveau
// post, on signale via window.postMessage au content script Tipote.
//
// Le content script (lui dans l'isolated world, accès aux APIs Chrome)
// reçoit le message et fait le relai vers le service worker → backend.
//
// Pourquoi MAIN world : le content script tourne en isolated world et
// son `window.fetch` est SÉPARÉ de celui de la page. Pour intercepter
// les fetch faits par le JS de LinkedIn, il faut être dans son monde.
//
// Sécurité : on ne touche RIEN d'autre que le wrapping autour de fetch.
// On ne lit aucun token, aucun cookie, aucune donnée sensible. On loggue
// juste les URL qu'on intercepte (côté Tipote pour debug si LinkedIn
// renomme une route).

(() => {
  const MARKER = "__tipote_fetch_intercepted__";
  const w = window as unknown as Record<string, unknown>;
  if (w[MARKER]) return; // idempotent (rechargements multiples)
  w[MARKER] = true;

  // Patterns d'URL qui correspondent à "l'utilisateur vient de publier".
  // À étendre quand LinkedIn ajoute de nouvelles routes — chaque pattern
  // est testé via includes() (substring match).
  const POST_CREATE_PATTERNS = [
    "/voyager/api/contentcreation/normShares",
    "/voyager/api/ugcPosts",
    "/voyager/api/feed/normShares",
    "/voyager/api/identity/dash/profileUpdates",
    // GraphQL mutation : la queryId varie mais le path est stable.
    // On capture toutes les POST graphql et on filtre la réponse pour
    // un urn:li:activity:* fraîchement créé.
    "/voyager/api/graphql",
  ];

  function shouldIntercept(url: string, method: string): boolean {
    if (method.toUpperCase() !== "POST") return false;
    return POST_CREATE_PATTERNS.some((p) => url.includes(p));
  }

  function emit(urn: string, source: string): void {
    window.postMessage(
      {
        source: "tipote-page",
        type: "linkedin/post-created",
        payload: { urn, capturedAt: Date.now(), via: source },
      },
      window.location.origin,
    );
  }

  // Extrait le premier `urn:li:activity:NNN` ou `urn:li:ugcPost:NNN` du
  // texte de réponse. Les 2 sont valides comme identifiants de post.
  function extractActivityUrn(text: string): string | null {
    const m =
      text.match(/urn:li:activity:\d+/) ??
      text.match(/urn:li:ugcPost:\d+/) ??
      text.match(/urn:li:share:\d+/);
    return m ? m[0] : null;
  }

  // ─── Hook window.fetch ────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");

    const response = await originalFetch(input, init);

    if (shouldIntercept(url, method) && response.ok) {
      // Clone obligatoire — on ne peut lire response.text() qu'une fois
      // et la page LinkedIn elle-même va le lire après nous.
      try {
        const clone = response.clone();
        const text = await clone.text();
        const urn = extractActivityUrn(text);
        if (urn) emit(urn, `fetch:${shortPath(url)}`);
      } catch {
        // best-effort : si la lecture du clone échoue (encoding bizarre),
        // on laisse silencieusement passer.
      }
    }

    return response;
  };

  // ─── Hook XMLHttpRequest ──────────────────────────────────────────
  // LinkedIn utilise majoritairement fetch en 2024+, mais certaines
  // routes legacy passent encore par XHR. On wrap aussi par sécurité.
  type XHRWithTipote = XMLHttpRequest & {
    __tipote_url?: string;
    __tipote_method?: string;
  };
  const OrigXHR = window.XMLHttpRequest;
  const originalOpen = OrigXHR.prototype.open;
  const originalSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function (this: XHRWithTipote, method: string, url: string | URL, ...rest: unknown[]) {
    this.__tipote_method = method;
    this.__tipote_url = typeof url === "string" ? url : url.href;
    // Cast nécessaire — la signature de open accepte plus de params.
    return originalOpen.apply(this, [method, url, ...rest] as unknown as Parameters<typeof originalOpen>);
  };

  OrigXHR.prototype.send = function (this: XHRWithTipote, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = this.__tipote_url ?? "";
    const method = this.__tipote_method ?? "GET";
    if (shouldIntercept(url, method)) {
      this.addEventListener("load", () => {
        if (this.status >= 200 && this.status < 300) {
          try {
            const text = typeof this.responseText === "string" ? this.responseText : "";
            const urn = extractActivityUrn(text);
            if (urn) emit(urn, `xhr:${shortPath(url)}`);
          } catch {
            // ignore
          }
        }
      });
    }
    return originalSend.call(this, body);
  };

  function shortPath(url: string): string {
    try {
      const u = new URL(url, window.location.origin);
      return u.pathname;
    } catch {
      return url.slice(0, 80);
    }
  }

  console.log("[tipote/injected] fetch + XHR interceptors armed");
})();
