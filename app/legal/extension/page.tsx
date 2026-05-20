// app/legal/extension/page.tsx
//
// Politique de confidentialité spécifique à l'extension Chrome Tipote
// Boost. Publique (pas d'auth nécessaire) — Chrome Web Store vérifie
// que cette URL est accessible avant de valider la soumission.
//
// La route /legal/[slug] dynamique gère "privacy", "cgu", etc. — cette
// page-ci a un segment statique "extension" qui est prioritaire (règle
// Next App Router : static > dynamic). Pas de conflit.
//
// Volontairement plat, lisible, en français. Si la legal team réécrit
// un jour, on basculera dans le système markdown commun (legal/*.md).

import { Card } from "@/components/ui/card";

export const metadata = {
  title: "Politique de confidentialité — Extension Tipote",
  description:
    "Quelles données l'extension Chrome Tipote collecte, dans quel but, où elles sont stockées et comment les supprimer.",
};

export default function ExtensionPrivacyPage() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-2xl font-bold mb-2">
        Politique de confidentialité — Extension Tipote
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        Dernière mise à jour : 23 mai 2026
      </p>

      <Card className="p-5 space-y-5 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">À quoi sert l&apos;extension</h2>
          <p>
            L&apos;extension <strong>Tipote Boost</strong> permet aux membres du pod
            d&apos;engagement Tipote de booster mutuellement leurs publications LinkedIn,
            grâce à un système d&apos;auto-like et de suggestions de commentaires
            générés par IA que tu valides en un clic.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Quelles données collectons-nous ?</h2>
          <p>L&apos;extension collecte uniquement les données suivantes :</p>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>
              <strong>Ton identifiant LinkedIn (URN)</strong>, ton nom public, ton
              headline et l&apos;URL de ton profil — pour te rattacher à ton compte Tipote.
            </li>
            <li>
              <strong>L&apos;URN et l&apos;URL des posts que tu publies</strong> sur LinkedIn,
              ainsi que le début du texte (environ 500 caractères) — uniquement pour
              permettre la génération de commentaires IA pertinents par les autres
              membres du pod.
            </li>
            <li>
              <strong>Tes actions d&apos;engagement validées</strong> (like, ton de
              commentaire choisi, texte final posté) — pour les statistiques de karma
              de ton compte.
            </li>
          </ul>
          <p className="mt-2">
            L&apos;extension ne lit jamais le contenu intégral des autres pages LinkedIn,
            ne stocke pas d&apos;identifiants tiers, et n&apos;accède pas à tes messages
            privés.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">À quoi servent ces données ?</h2>
          <p>
            Strictement à faire fonctionner le pod d&apos;engagement collaboratif :
            identifier les membres, distribuer les tâches de boost, proposer des
            suggestions de commentaires personnalisées et tenir un karma équilibré entre
            ce que tu donnes et ce que tu reçois.
          </p>
          <p className="mt-2">
            <strong>Aucune donnée n&apos;est partagée avec un tiers</strong>. Pas de
            revente, pas d&apos;analytics tiers, pas de publicité.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Où sont-elles stockées ?</h2>
          <p>
            Sur l&apos;infrastructure Tipote, opérée par Supabase (datacenters Union
            européenne, France). Les communications entre l&apos;extension et le
            backend Tipote sont chiffrées en HTTPS.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">
            L&apos;extension publie-t-elle quelque chose en mon nom ?
          </h2>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>
              Le <strong>like</strong> est automatique sur les publications des autres
              membres du pod, dans la limite d&apos;un quota strict (max 12 actions par
              heure, avec délais aléatoires). Tu peux le désactiver à tout moment.
            </li>
            <li>
              Le <strong>commentaire</strong> n&apos;est jamais publié sans clic
              explicite de ta part sur l&apos;un des 4 tons proposés (« Je suis
              d&apos;accord », « Je ne suis pas d&apos;accord », « Ajouter de la valeur »,
              « Poser une question »). Tu peux éditer le texte avant l&apos;envoi.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Comment supprimer mes données ?</h2>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>
              <strong>Désinstaller l&apos;extension</strong> arrête immédiatement toute
              collecte sur LinkedIn.
            </li>
            <li>
              <strong>
                Supprimer ton compte Tipote
              </strong>{" "}
              depuis{" "}
              <a
                href="https://app.tipote.com/settings"
                className="text-primary underline"
              >
                app.tipote.com/settings
              </a>{" "}
              efface toutes les données associées (profil LinkedIn lié, posts détectés,
              tâches d&apos;engagement, karma) en cascade.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">Contact</h2>
          <p>
            Pour toute question relative à tes données :{" "}
            <a href="mailto:privacy@tipote.fr" className="text-primary underline">
              privacy@tipote.fr
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Responsable de traitement : ETHILIFE SAS. Voir aussi notre{" "}
            <a href="/legal/privacy" className="text-primary underline">
              politique de confidentialité générale
            </a>{" "}
            et nos{" "}
            <a href="/legal/mentions" className="text-primary underline">
              mentions légales
            </a>
            .
          </p>
        </section>
      </Card>
    </article>
  );
}
