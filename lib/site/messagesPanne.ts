// lib/site/messagesPanne.ts
//
// CE QU'ON AFFICHE QUAND LE NAVIGATEUR PLANTE.
//
// Retour d'un client anglophone, 7 septembre 2026 : "I think Tiquiz had
// some downtime while I was testing it (the quiz was just showing white,
// including the demo on the Tiquiz website)... this made me lose the
// most confidence in the solution."
//
// MESURE, le meme jour : la page publique d'un quiz ne rend AUCUN
// contenu cote serveur (seulement le JSON-LD et les pixels), tout le
// quiz est monte par le navigateur apres un appel a l'API. Et il
// n'existait AUCUN `error.tsx` ni `global-error.tsx` dans tout `app/` :
// la moindre exception cote client, un fragment JS qui repond 404 apres
// un deploiement, et la page reste BLANCHE, sans un mot.
//
// C'est la regle du 3 aout, transposee au navigateur : un echec produit
// TOUJOURS quelque chose a l'ecran. Une page blanche envoie le visiteur
// conclure que le service est mort ; une phrase et un bouton "recharger"
// disent que c'est passager, et le rechargement suffit dans le cas le
// plus frequent (un fragment JS remplace par un deploiement).
//
// AUCUNE DEPENDANCE, aucun appel reseau, aucun contexte React : ce
// module est lu par un ecran qui s'affiche justement quand le reste a
// echoue.

import { langueDuNavigateur, repliLangue } from "@/lib/quiz/langueViewer";

export type MessagePanne = {
  titre: string;
  corps: string;
  recharger: string;
};

export const MESSAGES_PANNE: Record<string, MessagePanne> = {
  fr: {
    titre: "Cette page n'a pas pu s'afficher",
    corps:
      "Le problème vient de notre côté, pas du tien. Recharge la page : dans la plupart des cas, ça repart tout de suite.",
    recharger: "Recharger la page",
  },
  en: {
    titre: "This page could not load",
    corps:
      "The problem is on our side, not yours. Reload the page: in most cases it comes straight back.",
    recharger: "Reload the page",
  },
  es: {
    titre: "Esta página no se ha podido mostrar",
    corps:
      "El problema es nuestro, no tuyo. Recarga la página: en la mayoría de los casos vuelve enseguida.",
    recharger: "Recargar la página",
  },
  it: {
    titre: "Questa pagina non si è caricata",
    corps:
      "Il problema è dalla nostra parte, non dalla tua. Ricarica la pagina: nella maggior parte dei casi riparte subito.",
    recharger: "Ricarica la pagina",
  },
  de: {
    titre: "Diese Seite konnte nicht geladen werden",
    corps:
      "Das Problem liegt bei uns, nicht bei dir. Lade die Seite neu: meistens ist sie sofort wieder da.",
    recharger: "Seite neu laden",
  },
  pt: {
    titre: "Esta página não conseguiu carregar",
    corps:
      "O problema é do nosso lado, não do teu. Recarrega a página: na maioria dos casos volta logo.",
    recharger: "Recarregar a página",
  },
  "pt-BR": {
    titre: "Esta página não conseguiu carregar",
    corps:
      "O problema é do nosso lado, não do seu. Recarregue a página: na maioria dos casos ela volta na hora.",
    recharger: "Recarregar a página",
  },
  ar: {
    titre: "تعذّر عرض هذه الصفحة",
    corps: "المشكلة من جهتنا، لا من جهتك. أعد تحميل الصفحة: في أغلب الحالات تعود فوراً.",
    recharger: "إعادة تحميل الصفحة",
  },
};

/** La panne se dit dans la langue du NAVIGATEUR : a ce stade la page a
 *  echoue, donc on n'a ni session, ni quiz, ni langue d'interface. */
export function messagePanne(locale?: string | null): MessagePanne {
  return repliLangue(locale ?? langueDuNavigateur(), MESSAGES_PANNE, "en");
}
