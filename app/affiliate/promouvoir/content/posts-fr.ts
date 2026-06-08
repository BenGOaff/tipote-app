// app/affiliate/promouvoir/content/posts-fr.ts
//
// Posts réseaux sociaux pour la promo Tiquiz - séquence 8 jours.
// Pour chaque jour, un visuel + 3 versions (Instagram, LinkedIn, X).
// Tonalité Béné : tutoiement, phrases sèches, chiffres concrets.
//
// Placeholders : {AFFILIATE_LINK} remplacé par le lien tracké réel.
// L'URL est insérée en caption (Instagram → "lien en bio" ou story
// swipe up ; LinkedIn et X → lien direct dans le post).

export type SocialPost = {
  network: "instagram" | "linkedin" | "x";
  caption: string;
};

export type PostDay = {
  id: string;
  dayLabel: string;
  theme: string;
  hook: string;
  visualPath: string; // chemin public du visuel à utiliser
  posts: SocialPost[];
};

export const POSTS_FR: PostDay[] = [
  {
    id: "j1-annonce",
    dayLabel: "J1 - Annonce de Tiquiz",
    theme: "Annonce - présenter l'outil",
    hook: "C'est live.",
    visualPath: "/affiliate-assets/visuels/singles/single-01-annonce.png",
    posts: [
      {
        network: "instagram",
        caption: `C'est live.

Tiquiz, le SaaS de quiz marketing de Béné (blagardette.com).

Tu génères ton quiz en 3-4 minutes avec l'IA.
Tu connectes ton Systeme io.
Tes leads tombent, déjà segmentés, déjà tagués.

- Compte gratuit : 1 quiz, 10 réponses/mois
- Mensuel : 9 €/mois sans engagement
- Annuel : 90 €/an

Pas de carte bancaire pour le gratuit. Tu testes vraiment.

Lien en bio 👆

#tiquiz #leadgeneration #systemeio #quiz #marketingautomation #conversion #infopreneur #copywriting`,
      },
      {
        network: "linkedin",
        caption: `J'utilise Tiquiz depuis quelques jours, je voulais le partager.

C'est un créateur de quiz marketing avec IA et synchronisation native Systeme io. Tu rentres ton objectif (qualifier ta liste, vendre une offre, ouvrir un onboarding...), l'IA génère un quiz complet, tu ajustes, tu partages.

Ce qui change vs un Typeform :
- Chaque réponse tague automatiquement le lead dans ton Systeme io
- Chaque profil de résultat a sa propre mini page de vente avec CTA personnalisé
- Tu peux inscrire en formation ou en communauté selon le profil
- 9 €/mois ou 90 €/an (vs Typeform Plus à 50 €/mois + Zapier 20 €/mois)

Compte gratuit pour tester (1 quiz, 10 réponses/mois, sans CB) : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Tiquiz est live.

Quiz marketing → segmentation auto → tagging Systeme io natif → page de résultat personnalisée par profil.

3 plans :
• Gratuit (1 quiz, 10 réponses/mois)
• 9 €/mois illimité
• 90 €/an illimité

Sans CB pour le gratuit : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j2-benefices",
    dayLabel: "J2 - 3 bénéfices clés",
    theme: "Ce que ton Typeform ne fera jamais",
    hook: "Ce que ton Typeform ne fera jamais.",
    visualPath: "/affiliate-assets/visuels/singles/single-02-benefices.png",
    posts: [
      {
        network: "instagram",
        caption: `Ce que ton Typeform ne fera jamais :

1. Taguer automatiquement chaque lead dans ton Systeme io selon ses réponses.
2. Inscrire le lead en formation OU en communauté selon son profil de résultat.
3. Lui servir une page de résultat dédiée avec CTA vers l'offre adaptée à SON moment.

Typeform collecte. Tiquiz qualifie + segmente + pré-vend.

9 €/mois ou 90 €/an. Compte gratuit pour tester.

Lien en bio 👆

#typeform #tally #tiquiz #leadqualification #systemeio #emailmarketing #funnel`,
      },
      {
        network: "linkedin",
        caption: `Typeform et Tally sont d'excellents formulaires.

Mais ce sont des formulaires. Ils collectent, ils t'envoient un CSV, fin de l'histoire.

Quand tu veux :
- Taguer automatiquement le lead dans ton CRM selon ses réponses
- L'inscrire en formation ou en communauté selon son profil
- Lui afficher une page de résultat unique par profil, avec CTA personnalisé

...il faut empiler Zapier, Make, et écrire ta propre logique.

Tiquiz fait ces 3 choses nativement, intégrées avec Systeme io. Le quiz n'est plus juste un formulaire, c'est un funnel complet de qualification + pré-vente.

9 €/mois ou 90 €/an. Tu testes avec le compte gratuit (1 quiz, 10 réponses/mois) : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Typeform : collecte.
Tiquiz : collecte + tague dans Systeme io + sert une page de résultat par profil + push une offre adaptée.

Différence de prix : 9 €/mois vs 50 €/mois + Zapier.

Compte gratuit ici : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j3-linda",
    dayLabel: "J3 - Cas Linda",
    theme: "Cas client (persona) Linda",
    hook: "Elle est passée de 0,6 % à 4,2 %.",
    visualPath: "/affiliate-assets/visuels/singles/single-03-linda.png",
    posts: [
      {
        network: "instagram",
        caption: `Linda : coach, liste de 600 contacts, ebook gratuit, 1 vente/mois.

Avant : 1 séquence email envoyée à toute la liste. Conversion 0,6 %.

Après Tiquiz : 1 quiz « Quel type d'entrepreneur·e es-tu ? ». 4 profils. 4 séquences différentes. Conversion 4,2 % sur l'offre adaptée.

7× mieux. Sans plus de trafic. Juste en parlant à la bonne personne au bon moment.

Compte gratuit pour tester : lien en bio 👆

#leadqualification #emailmarketing #funnel #conversion #coachbusiness`,
      },
      {
        network: "linkedin",
        caption: `Cas concret : Linda, coach business solo, 600 contacts en liste, 1 vente/mois.

Avant Tiquiz : 1 séquence email envoyée à tout le monde. Conversion 0,6 %. La même offre balancée à tous, peu importe le moment d'achat.

Après Tiquiz : 1 quiz « Quel type d'entrepreneur·e es-tu ? » avec 4 profils. Chaque profil reçoit une séquence email adaptée et une offre adaptée. Le quiz tague automatiquement dans Systeme io.

Conversion 4,2 % sur l'offre adaptée par segment. Soit 7× mieux qu'avant.

Le quiz n'a pas remplacé son travail. Il a mis un filtre intelligent à l'entrée pour que tout le reste (contenu, mails, offres) parle à la bonne personne au bon moment.

Compte gratuit pour tester : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Linda, coach, 600 contacts, 1 vente/mois.

Avant : 1 séquence pour tout le monde. Conv. 0,6 %.

Après quiz Tiquiz (4 profils, 4 séquences) : conv. 4,2 %.

7× mieux, sans plus de trafic.

Compte gratuit : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j4-demo",
    dayLabel: "J4 - Démo en 4 minutes",
    theme: "Démo complète (carrousel 10 slides)",
    hook: "Segmente ta liste en 4 minutes.",
    visualPath: "/affiliate-assets/visuels/carrousel/slide-01-cover.png",
    posts: [
      {
        network: "instagram",
        caption: `Carrousel : la création d'un quiz Tiquiz, étape par étape, chrono en main.

Total : 4 à 8 minutes selon ton niveau de perfectionnisme.

→ Brief IA (2 min)
→ L'IA écrit ton quiz (1 min)
→ Tu personnalises (2-3 min)
→ Tu connectes Systeme io (1 min par profil)
→ Tu publies (instantané)

Swipe → swipe → swipe.

Compte gratuit pour tester : lien en bio 👆

#tiquiz #leadgeneration #systemeio #marketingautomation #howto

- Carrousel de 10 slides : poste-les dans l'ordre slide-01 → slide-10.`,
      },
      {
        network: "linkedin",
        caption: `Combien de temps pour créer un quiz dans Tiquiz : 4 à 8 minutes.

Le process :

1. Brief IA (2 min) - objectif, audience, ton, CTA, bonus viral.
2. L'IA écrit ton quiz (1 min) - questions, options, profils de résultat.
3. Tu personnalises (2-3 min) - reformule, ajoute ton logo, tes couleurs.
4. Tu connectes Systeme io (1 min par profil) - tag, formation, communauté.
5. Tu publies (instantané) - lien public ou code embed.

Pas de Zapier. Pas de Make. Pas de middleware. Connexion native avec Systeme io.

Compte gratuit pour tester (1 quiz, 10 réponses/mois) : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Création d'un quiz Tiquiz, chrono en main :

1. Brief IA · 2 min
2. L'IA écrit · 1 min
3. Tu personnalises · 2-3 min
4. Tu connectes SIO · 1 min/profil
5. Tu publies · instantané

Total : 4-8 min.

Compte gratuit : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j5-faq",
    dayLabel: "J5 - FAQ",
    theme: "Les vraies questions",
    hook: "Les 4 trucs qu'on me redemande.",
    visualPath: "/affiliate-assets/visuels/singles/single-05-faq.png",
    posts: [
      {
        network: "instagram",
        caption: `Les 4 questions Tiquiz qui reviennent le plus :

❓ Faut-il être technique ? Non. Si tu sais utiliser Systeme io, tu sais utiliser Tiquiz.

❓ Différence avec Typeform ? Tiquiz tague auto dans SIO, sert une page de résultat dédiée par profil, et coûte 9 € vs 50 €.

❓ Faut-il déjà avoir SIO ? Tu peux sans, mais c'est là où la magie opère.

❓ Garantie ? Non. Le compte gratuit te permet de tester en conditions réelles avant de payer.

Compte gratuit ici (lien en bio) 👆

#tiquiz #faq #systemeio`,
      },
      {
        network: "linkedin",
        caption: `Les 4 questions Tiquiz qui reviennent le plus :

1. Faut-il être technique ?
Non. Si tu sais utiliser Systeme io, tu sais utiliser Tiquiz. L'IA fait la partie lourde, toi tu valides et tu publies. Tutoriel guidé en 7 étapes à la première connexion.

2. Quelle différence avec Typeform / Tally ?
Typeform et Tally sont d'excellents formulaires. Tiquiz est pensé pour la qualification + segmentation + pré-vente : tagging Systeme io natif, page de résultat dédiée par profil, inscription auto en formation/communauté. Et 9 €/mois vs 50 €/mois pour Typeform Plus.

3. Faut-il déjà avoir un compte Systeme io ?
Tu peux sans (les leads arrivent dans ton dashboard Tiquiz, tu exportes). Mais la vraie puissance c'est la connexion SIO. Compte gratuit SIO suffit pour démarrer.

4. Y a-t-il une garantie / remboursement ?
Non. Pas de garantie, pas de remboursement. Béné assume - le compte gratuit (1 quiz, 10 réponses/mois) te permet déjà de tester en conditions réelles. Si tu hésites encore après ça, ce n'est pas l'outil pour toi.

Compte gratuit : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `FAQ Tiquiz, 4 réponses :

- Technique ? Non, si tu sais SIO tu sais Tiquiz.
- Diff Typeform ? Tag SIO auto, page résultat par profil, 9 € vs 50 €.
- SIO requis ? Pas obligé, mais c'est là que ça brille.
- Garantie ? Non. Le gratuit est là pour ça.

Compte gratuit : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j6-prix",
    dayLabel: "J6 - Le vrai coût",
    theme: "Comparaison de prix sur 5 ans",
    hook: "Pour 5 ans, fais le calcul.",
    visualPath: "/affiliate-assets/visuels/singles/single-06-prix.png",
    posts: [
      {
        network: "instagram",
        caption: `Coût sur 5 ans, calculé honnêtement :

Typeform Plus + Zapier : ~4 200 €
Tally Pro + Zapier : ~2 800 €
Tiquiz Annuel : 450 €

Pourquoi ? Tiquiz a été codé par Béné avec l'IA, sans dépendre d'un dev externe coûteux. Les économies de structure passent dans le prix utilisateur.

Compte gratuit pour tester : lien en bio 👆

#typeform #tiquiz #saas #pricing #leadgeneration`,
      },
      {
        network: "linkedin",
        caption: `Pourquoi Tiquiz est à 9 €/mois quand Typeform Plus est à 50 €/mois.

J'ai fait le calcul sur 5 ans.

Pour reproduire ce que fait Tiquiz nativement (tagging Systeme io, segmentation, page résultat par profil), il faut Typeform + Zapier ou Tally + Zapier.

Sur 5 ans :
- Typeform Plus + Zapier : environ 4 200 €
- Tally Pro + Zapier : environ 2 800 €
- Tiquiz Annuel : 450 €

La différence vient du fait que Béné a codé Tiquiz avec l'IA, sans dev externe. Les économies de structure passent dans le prix utilisateur.

Compte gratuit pour tester (1 quiz, 10 réponses/mois) : {AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Coût sur 5 ans :

• Typeform + Zapier : ~4 200 €
• Tally + Zapier : ~2 800 €
• Tiquiz Annuel : 450 €

Béné a codé Tiquiz avec l'IA sans dev externe → économies structurelles → prix bas.

Gratuit pour tester : {AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j7-jmoins1",
    dayLabel: "J7 - J-1 (urgence)",
    theme: "Dernière chance",
    hook: "J-1. 3 mai · minuit.",
    visualPath: "/affiliate-assets/visuels/singles/single-07-jmoins1.png",
    posts: [
      {
        network: "instagram",
        caption: `J-1.

Si tu envisages de tester Tiquiz, c'est le moment de te lancer.

Compte gratuit : 0 € · sans CB · 1 quiz · 10 réponses/mois.

Tu fais ton premier quiz ce soir, tu vois la mécanique tourner sur ton audience demain.

Lien en bio 👆

#tiquiz #lastchance #leadgeneration`,
      },
      {
        network: "linkedin",
        caption: `Dernier rappel sur Tiquiz cette semaine.

Si tu envisages de tester un quiz pour qualifier ta liste : le compte gratuit te permet de monter ton premier quiz ce soir sans sortir un euro. 1 quiz, 10 réponses par mois, sans CB.

10 réponses, c'est largement assez pour valider que la mécanique fonctionne sur ton audience avant de passer en illimité.

{AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `J-1 pour tester Tiquiz.

Compte gratuit : 0 €, sans CB. 1 quiz, 10 réponses/mois. Tu lances ton 1er quiz ce soir, tu vois la mécanique tourner demain.

{AFFILIATE_LINK}`,
      },
    ],
  },
  {
    id: "j8-dernier-jour",
    dayLabel: "J8 - Dernier jour",
    theme: "Fermeture du focus (mais pas du gratuit)",
    hook: "À minuit, c'est terminé.",
    visualPath: "/affiliate-assets/visuels/singles/single-08-dernier-jour.png",
    posts: [
      {
        network: "instagram",
        caption: `Dernier jour de cette série Tiquiz.

À minuit, j'arrête d'en parler.

Si tu veux tester avant : compte gratuit, 0 €, sans CB, 1 quiz, 10 réponses/mois.

Si tu décides de ne rien prendre : on se reparle bientôt sur un autre sujet.

Merci d'avoir suivi.

Lien en bio 👆`,
      },
      {
        network: "linkedin",
        caption: `Dernier post Tiquiz cette semaine.

Je te résume les 3 chemins possibles :

Chemin 1 - Compte gratuit. 0 €, sans CB, 1 quiz, 10 réponses/mois. Tu testes sur ton audience, tu décides ensuite.

Chemin 2 - Mensuel à 9 €. Quiz illimités, sans engagement. Tu arrêtes quand tu veux.

Chemin 3 - Annuel à 90 €. Tu économises 2 mois.

Si tu décides de ne rien prendre, pas de souci. Je continue à partager les outils que je trouve solides.

Merci d'avoir lu cette série.

{AFFILIATE_LINK}`,
      },
      {
        network: "x",
        caption: `Dernier post Tiquiz cette semaine.

3 chemins :
• Gratuit (0 €, sans CB)
• Mensuel 9 € sans engagement
• Annuel 90 € (économise 2 mois)

Sinon, on se reparle sur autre chose. Merci d'avoir suivi.

{AFFILIATE_LINK}`,
      },
    ],
  },
];
