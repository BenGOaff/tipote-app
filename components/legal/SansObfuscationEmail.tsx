import type { ReactNode } from "react";

/**
 * CLOUDFLARE MASQUE LES ADRESSES EMAIL DU HTML SERVI (3 septembre 2026).
 *
 * L'option « Email Address Obfuscation » (Scrape Shield) remplace toute
 * adresse du HTML par :
 *
 *   <span class="__cf_email__" data-cfemail="...">[email protected]</span>
 *
 * plus un script qui la reconstruit dans le navigateur. Un lecteur qui
 * n'execute PAS le JavaScript lit donc une politique de confidentialite
 * SANS aucune adresse de contact : le validateur OAuth de Google, un
 * robot d'indexation, un lecteur d'ecran en mode degrade.
 *
 * MESURE DU 3 SEPTEMBRE, avec l'agent de Googlebot, en production :
 *
 *   app.tipote.com/legal/privacy      5 adresses masquees sur 5
 *   app.tipote.com/legal/extension    1
 *   atelierduquiz.fr/privacy          1
 *   tiquiz.fr/privacy                 0  (corrige le 2 septembre)
 *
 * Les cinq de Tipote vivent dans le CORPS du document (mentions legales,
 * desinscription, garanties, exercice des droits, contact) : ce sont
 * exactement celles que la page promet et que Google vient chercher.
 *
 * CA NE SE VOIT QUE SUR LA PAGE RENDUE, jamais dans le depot : c'est un
 * intermediaire qu'on oublie parce qu'il ne nous appartient pas. Meme
 * famille que les images en 403 du 31 aout, ou la configuration etait
 * juste et adressee au mauvais serveur.
 *
 * Les deux marqueurs ci dessous sont la directive OFFICIELLE de
 * Cloudflare pour laisser une zone intacte. Ils ne changent rien a
 * l'affichage, et ils sont sans effet si l'option est desactivee un jour.
 */
export default function SansObfuscationEmail({ children }: { children: ReactNode }) {
  return (
    <>
      <span dangerouslySetInnerHTML={{ __html: "<!--email_off-->" }} />
      {children}
      <span dangerouslySetInnerHTML={{ __html: "<!--email_on-->" }} />
    </>
  );
}
