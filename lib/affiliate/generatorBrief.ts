// lib/affiliate/generatorBrief.ts
//
// Ce que le générateur a le droit de dire. Un affilié qui écrit "à la
// place de Béné" ne doit jamais inventer un prix, une garantie ou un
// chiffre : tout ce qui suit est vérifié et sourcé, et c'est le SEUL
// matériau factuel autorisé.

import { PRIORITY_RULES_CONTENT } from "@/lib/prompts/priority";
import type { ContentProduct } from "./contentSpace";

export const GENERATOR_FORMATS = [
  "email",
  "post",
  "article",
  "script_court",
  "script_long",
] as const;
export type GeneratorFormat = (typeof GENERATOR_FORMATS)[number];

const ATELIER_FACTS = `PRODUIT : L'Atelier du Quiz, formation créée par Béné (blagardette.com).
Prix : 47 € en paiement unique, accès à vie, mises à jour comprises. Aucun abonnement.
Format : 7 jours, une action par jour, un livrable concret par jour. On n'apprend pas à faire un quiz, on fait le sien. Le quiz est publié et connecté dès le 4e jour.
Méthode CAPTO® : Capter, Attirer, Profiler, Transformer, Optimiser. Les 5 maillons d'un quiz qui vend.
Contenu : carnet de bord qui se remplit avec les réponses de l'élève, générateur de campagne (séquence de bienvenue, un email par profil de résultat, séquence de vente, kit de lancement), modèles à importer en un clic dans Systeme.io.
Accompagnement : coach IA connecté aux vraies données du quiz de l'élève, disponible jour et nuit ; Quiz Doctor qui diagnostique le quiz question par question ; communauté ; Béné qui répond personnellement.
Bonus (inclus) : trafic payant sans risque, vendre avec son quiz, les sondages, les popquiz, les réseaux sociaux en 7 modules.
Outils inclus pour démarrer : accès gratuit à Tiquiz, modèles Systeme.io.
Garantie : aucun inscrit capté au bout de 30 jours en appliquant la méthode, remboursement.
Certificat : décroché en terminant les 7 jours du parcours. Il n'y a PAS d'examen.
Commission affilié : 70%.
Cas réel utilisable : Jocelyne, orthophoniste pendant 40 ans, comptes créés la veille, zéro audience, quiz monté en 1 h 30 (5 questions, 5 profils), 285 personnes ont laissé leur email en 9 jours.
Chiffre de marché utilisable, avec sa source : 44,9 % des personnes qui commencent un quiz en coaching ou formation laissent leur email (rapport Interact).`;

const TIQUIZ_FACTS = `PRODUIT : Tiquiz, le logiciel de création de quiz marketing (quiz.tipote.com).
Tarifs : compte gratuit à vie (1 quiz, 10 réponses par mois, sans carte bancaire) ; accès simple 17 €/mois ou 170 €/an (utilisateur solo, un seul projet) ; Plus 29 €/mois ou 290 €/an (agences, freelances qui vendent des prestations de quiz à leurs clients, entrepreneurs multi-projets).
Ce que fait l'outil : génération du quiz par IA à partir d'une idée, quiz à profils ou quiz scoré multi-axes, page de résultat dédiée par profil avec son propre appel à l'action, capture d'email, tagging automatique dans Systeme.io, sondages, popquiz (quiz incrusté dans une vidéo), statistiques question par question, partage du résultat obtenu.
Ce que débloque le Plus : multiprofils (un espace par client ou par marque, branding et statistiques séparés), analyse IA des réponses, plusieurs clés API Systeme.io, modèles pré-conçus.
Différence avec un formulaire classique (Typeform, Tally) : le quiz qualifie, segmente et pré-vend au lieu de seulement collecter.
Commission affilié : 40% sur chaque vente, sur les 12 premiers mois de chaque abonnement.`;

export function productFacts(product: ContentProduct): string {
  return product === "atelier" ? ATELIER_FACTS : TIQUIZ_FACTS;
}

const FORMAT_BRIEF: Record<GeneratorFormat, string> = {
  email: `FORMAT : un email de vente.
Structure : objet (donne 3 variantes A, B, C), pré-en-tête d'une ligne, puis le corps.
Le corps commence par "Salut {first_name}," et se termine par un appel à l'action unique sur une ligne, de la forme "**Texte du bouton >> {AFFILIATE_LINK}**", suivi de la signature "{NAME}" puis d'un PS court.
Un seul lien dans tout l'email. Longueur : 250 à 450 mots.`,
  post: `FORMAT : un post pour les réseaux sociaux.
La première ligne est une accroche qui tient seule et donne envie de cliquer sur "voir plus". Laisse-lui une ligne blanche après.
Paragraphes courts, une idée par paragraphe. Termine par "Lien en commentaire ↓" puis 4 à 5 hashtags pertinents en minuscules.
Ne mets AUCUN lien dans le corps du post : LinkedIn étouffe les publications sortantes. Longueur : 150 à 300 mots.`,
  article: `FORMAT : un ARTICLE DE BLOG. Ce n'est PAS un post réseaux sociaux : pas d'accroche isolée, pas de "Lien en commentaire", aucun hashtag, et on ne s'arrête pas à 300 mots.
Structure OBLIGATOIRE, dans cet ordre :
1. Une ligne "# Titre de l'article" (un seul #).
2. Un chapô de deux ou trois phrases, en paragraphe normal.
3. AU MOINS QUATRE sections, chacune introduite par une ligne "## Sous-titre" suivie de deux à quatre paragraphes. Une liste à puces (lignes commençant par "- ") dans une ou deux sections, pas partout.
4. Une section finale "## " de conclusion qui amène l'appel à l'action, avec le lien sur sa propre ligne sous la forme "**Texte du lien >> {AFFILIATE_LINK}**".
Mise en forme : markdown léger uniquement. "# " et "## " pour les titres, "**gras**" pour les mots importants, "- " pour les puces. Rien d'autre : pas de tableau, pas de bloc de code, pas de note de bas de page.
Longueur : 700 à 1100 mots. En dessous de 700, l'article est incomplet, ajoute une section.`,
  script_court: `FORMAT : un script de vidéo courte (Reel, Short, TikTok), 30 à 60 secondes.
Donne le texte à dire, découpé en plans numérotés avec la durée approximative de chacun, et indique entre crochets ce qui doit apparaître à l'écran.
Les 3 premières secondes doivent arrêter le défilement. Termine par un appel à l'action parlé qui renvoie au lien en bio ou en commentaire.`,
  script_long: `FORMAT : un script de vidéo longue (YouTube), 6 à 10 minutes.
Donne l'accroche des 20 premières secondes, le plan en 4 à 6 parties avec le texte à dire pour chacune, les moments où montrer l'écran, et la conclusion avec l'appel à l'action et {AFFILIATE_LINK} à mentionner en description.`,
};

export function formatBrief(format: GeneratorFormat): string {
  return FORMAT_BRIEF[format];
}

/** Règles d'écriture non négociables, identiques pour tous les formats. */
export const WRITING_RULES = `RÈGLES D'ÉCRITURE, sans exception :
- Français, tutoiement, ton direct et chaleureux, phrases courtes.
- JAMAIS de tiret cadratin ni demi-cadratin. À la place : une virgule, deux-points, des parenthèses, ou une nouvelle phrase.
- Aucun accord de genre sur le lecteur : le texte doit pouvoir s'envoyer à une audience mixte sans retouche.
- Aucune fausse urgence : pas de place limitée, pas de date de fermeture, pas d'augmentation de prix annoncée. Aucune de ces choses n'existe.
- Aucun chiffre inventé : ni revenu moyen, ni taux de conversion, ni nombre de membres, ni témoignage. Tu n'utilises QUE les faits listés plus haut, et tu cites la source quand elle est donnée.
- Aucune promesse de résultat chiffré. On promet une méthode et un système, jamais un montant.
- N'invente aucune URL. Le seul lien autorisé est le marqueur {AFFILIATE_LINK}, que tu places tel quel : il sera remplacé par le lien tracké de l'affilié.
- Le marqueur {NAME} désigne l'affilié qui signe, {first_name} désigne le destinataire (variable Systeme.io). Laisse-les tels quels.
- Béné se nomme "ma partenaire Béné" à la première mention, puis "Béné".
- Pas de jargon marketing anglais quand un mot français existe.
- Tu écris le contenu demandé, rien d'autre : pas de préambule, pas de commentaire sur ton propre travail, pas de conclusion du type "voilà ton email".`;

// L'ordre compte : le FORMAT est la dernière chose lue avant d'écrire.
// Coincé au milieu du prompt, entre les faits produits et les règles de
// style, il se faisait oublier et un article demandé revenait en post
// (retour Béné, 1er août 2026).
export function buildSystemPrompt(
  product: ContentProduct,
  format: GeneratorFormat,
): string {
  return `Tu es la plume d'un affilié qui recommande un produit à SON audience. Tu écris à sa place, dans sa voix, pour promouvoir le produit décrit ci-dessous. Tu ne fais rien d'autre : si la demande sort de la promotion de ce produit, tu réponds en une phrase que tu ne peux aider que sur ce sujet.

${productFacts(product)}

${PRIORITY_RULES_CONTENT}

${WRITING_RULES}

FORMAT DEMANDÉ, à respecter à la lettre. Il prime sur toute habitude :

${formatBrief(format)}`;
}

/** Rappel du format dans le message utilisateur : deuxième ancrage. */
export const FORMAT_REMINDER: Record<GeneratorFormat, string> = {
  email: "Tu écris UN EMAIL DE VENTE (objets A/B/C, pré-en-tête, corps signé).",
  post: "Tu écris UN POST pour les réseaux sociaux (accroche, paragraphes courts, hashtags, aucun lien dans le corps).",
  article:
    "Tu écris UN ARTICLE DE BLOG de 700 à 1100 mots, avec un titre en '# ' et au moins quatre sous-titres en '## '. Ce n'est pas un post : ni hashtag, ni 'lien en commentaire'.",
  script_court: "Tu écris UN SCRIPT DE VIDÉO COURTE, découpé en plans numérotés.",
  script_long: "Tu écris UN SCRIPT DE VIDÉO LONGUE, avec accroche, plan en parties et conclusion.",
};

/**
 * Le rendu attendu est-il conforme au format ? Sert de garde-fou serveur :
 * un article sans le moindre sous-titre est un post déguisé, on le refait
 * une fois plutôt que de le servir tel quel.
 */
export function looksLikeFormat(format: GeneratorFormat, text: string): boolean {
  if (format !== "article") return true;
  const hasTitle = /^#\s+\S/m.test(text);
  const sectionCount = (text.match(/^##\s+\S/gm) ?? []).length;
  return hasTitle && sectionCount >= 3;
}
