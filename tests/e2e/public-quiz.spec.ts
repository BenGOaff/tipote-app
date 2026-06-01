// tests/e2e/public-quiz.spec.ts
//
// Tests de non-régression sur le quiz public Tipote (route /q/[quizId]).
// Phase 7 ROADMAP_RETENTION.md.
//
// Couvre ce qui CASSE de manière silencieuse pour les users qui embed
// leurs quiz (JB & co — cf. PITFALLS section X) :
//
//   1. Headers : iframe permise (X-Frame-Options absent + CSP
//      frame-ancestors *)
//   2. La page se charge (status 200, hero ou intro visible)
//   3. OG meta présents
//   4. Funnel basique : intro → start s'enchaîne (on n'envoie pas le
//      vrai email pour ne pas créer de faux lead en prod)
//
// SMOKE_QUIZ_ID doit pointer sur un quiz actif (slug ou UUID). Si absent,
// les tests sont skip — c'est volontaire pour ne pas bloquer la CI quand
// l'env n'est pas fourni.

import { test, expect, type APIResponse } from "@playwright/test";

const QUIZ_ID = process.env.SMOKE_QUIZ_ID;
const skipIf = (cond: boolean, reason: string) => test.skip(cond, reason);

test.describe("Quiz public /q/[id]", () => {
  test.beforeEach(() => {
    skipIf(!QUIZ_ID, "SMOKE_QUIZ_ID non fourni");
  });

  test("headers : iframe permise (pas de X-Frame-Options + CSP frame-ancestors *)", async ({
    request,
    baseURL,
  }) => {
    const response = (await request.get(`/q/${QUIZ_ID}`)) as APIResponse;
    expect(response.status(), `URL ${baseURL}/q/${QUIZ_ID}`).toBe(200);

    const headers = response.headers();

    // Critique : X-Frame-Options ne doit pas être posé sur les routes
    // publiques embeddables, sinon les iframes des users (JB sur son blog)
    // cassent silencieusement. Cf. PITFALLS X.
    expect(
      headers["x-frame-options"],
      "X-Frame-Options présent → iframe cassée chez les users qui embed",
    ).toBeUndefined();

    const csp = headers["content-security-policy"] ?? "";
    expect(
      csp,
      "CSP doit contenir 'frame-ancestors *' pour autoriser l'embed",
    ).toMatch(/frame-ancestors\s+\*/i);
  });

  test("la page se charge et affiche un contenu visible", async ({ page }) => {
    const response = await page.goto(`/q/${QUIZ_ID}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    // Le body doit avoir du contenu visible — on n'exige pas un sélecteur
    // précis (les pages personnalisent leur DOM) mais le body ne doit
    // pas être vide. Garde-fou contre une white-screen-of-death.
    const bodyText = await page.locator("body").innerText({ timeout: 5_000 });
    expect(bodyText.length, "Body vide → quiz cassé").toBeGreaterThan(20);
  });

  test("metadata Open Graph présents (titre + url + image)", async ({ page }) => {
    await page.goto(`/q/${QUIZ_ID}`, { waitUntil: "domcontentloaded" });

    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle, "og:title manquant → preview iMessage/WhatsApp dégradé").toHaveCount(1);

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl, "og:url manquant").toHaveCount(1);

    // og:url doit être une URL absolue valide. On NE force PAS l'égalité
    // host(og:url) == host(requête) : un quiz avec domaine custom
    // canonicalise légitimement vers le domaine de son propriétaire
    // (ex. accès via app.tipote.com → og:url = mondomaine.fr). On logue
    // juste le mismatch en info.
    const ogUrlContent = await ogUrl.getAttribute("content");
    expect(ogUrlContent, "og:url vide").toBeTruthy();
    if (ogUrlContent) {
      expect(() => new URL(ogUrlContent), "og:url n'est pas une URL absolue valide").not.toThrow();
      const requestedHost = new URL(page.url()).host;
      const ogHost = new URL(ogUrlContent).host;
      if (ogHost !== requestedHost) {
        test.info().annotations.push({
          type: "info",
          description: `og:url host=${ogHost} ≠ requête=${requestedHost} (normal si domaine custom)`,
        });
      }
    }
  });

  test("intro → start : un bouton de démarrage est cliquable", async ({ page }) => {
    await page.goto(`/q/${QUIZ_ID}`, { waitUntil: "domcontentloaded" });

    // On cherche un bouton "Démarrer / Commencer / Start" robuste aux
    // variations de texte (FR vouvoiement/tutoiement + EN). Si le quiz
    // a un start_button_text personnalisé, on accepte aussi tout bouton
    // visible dans le hero.
    const startCandidates = page.getByRole("button", {
      name: /(démarre|commenc|start|c'est parti|on y va|let's go)/i,
    });

    // Au moins un bouton de démarrage visible. Si 0 trouvé, ce n'est pas
    // un échec hard (les surveys n'ont pas de start) mais on log.
    const count = await startCandidates.count();
    if (count === 0) {
      test.info().annotations.push({
        type: "info",
        description: "Aucun bouton de démarrage typé trouvé — peut être un sondage ou un start custom",
      });
      return;
    }
    await expect(startCandidates.first()).toBeVisible();
  });
});

test.describe("Quiz public — tracking endpoints", () => {
  test.beforeEach(() => {
    skipIf(!QUIZ_ID, "SMOKE_QUIZ_ID non fourni");
  });

  test("/track retourne 200 (jamais 4xx, même pour bot/owner)", async ({ request }) => {
    // Bug historique (cf. PITFALLS D) : un endpoint analytics qui balance
    // des 4xx dans la console du visiteur donne l'impression d'un bug
    // applicatif. /track doit TOUJOURS renvoyer 200, même quand il
    // refuse de logger (bot, owner, dédup, etc.).
    const response = await request.post(`/api/quiz/${QUIZ_ID}/track`, {
      data: { event: "view" },
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status(), "/track doit toujours répondre 200").toBe(200);
  });
});
