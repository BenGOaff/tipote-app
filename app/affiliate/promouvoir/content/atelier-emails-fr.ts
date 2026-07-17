// app/affiliate/promouvoir/content/atelier-emails-fr.ts
//
// Séquence email affiliation L'ATELIER DU QUIZ (formation, commission 70%).
// Texte de Béné, repris fidèlement, mis en forme dans le style "maison" des
// emails affiliés (texte propre, pas de markdown brut). FR uniquement.
//
// Placeholders (résolus côté UI, cf. contenus/page.tsx + EmailCard) :
//   {AFFILIATE_LINK} -> lien tracké de l'affilié vers le tunnel Atelier
//                        (https://www.tipote.fr/atelier-du-quiz?sa=...).
//   {NAME}           -> prénom de l'affilié (signature).
//   {first_name}     -> variable du destinataire (ESP de l'affilié), laissée telle quelle.
//   {LIEN_ETUDE_CAS} -> lien tracké vers l'étude de cas Jocelyne
//                        (https://www.tipote.fr/tiquiz/cas-client-jocelyne-tdah?sa=...),
//                        pré-injecté avec le ?sa de l'affilié côté page.

import type { EmailTemplate } from "./emails-fr";

export const ATELIER_EMAILS_FR: EmailTemplate[] = [
  {
    id: "atelier-01-ouverture",
    subject: "Ton quiz, tu sais le faire. Et après ?",
    preheader: "",
    notes:
      "Mail 1 - Ouverture (cascade de bénéfices). Objets A/B/C à tester. B : La pièce qui manque à 90% des quiz. C : Comment transformer un quiz en machine à leads.",
    body: `Salut {first_name},

Si tu cherches à capter plus de leads sans y passer tes journées, garde ce mail deux minutes.

On sait tous que les quiz, ça marche pour récolter des emails.

Le hic, ce n'est presque jamais de créer le quiz. Ça, c'est la partie facile.

Le vrai blocage, c'est l'après : amener des visiteurs dessus, trier les leads, les relancer, vendre. Et savoir dans quel ordre le faire.

Personne n'explique cette partie-là. Résultat : des quiz tout beaux… qui ne rapportent rien.

Je suis tombé sur un truc qui règle exactement ce problème : L'Atelier du Quiz.

Ce n'est pas une formation de plus à regarder en accéléré pour ne jamais l'appliquer.

C'est un « quizing » : tu apprends en faisant, une petite action par jour, et au bout de 7 jours tu as un quiz publié, branché à ton Systeme.io, qui tourne tout seul.

Voici ce que tu obtiens :

- Un plan de trafic gratuit, jour par jour, pour remplir ton quiz de visiteurs qualifiés sans un euro de pub.
- Le réglage à 0€ qui empêche les gens d'abandonner ton quiz juste avant de te laisser leur email.
- Le Quiz Doctor qui passe ton quiz au crible avant publication, repère les erreurs qui te coûtent des leads et te dit quoi corriger.
- Un générateur d'emails branché sur ton quiz + des templates Systeme.io à importer en un clic : tes leads sont accueillis et relancés à ta place.
- La méthode CAPTO® : les 5 étapes dans l'ordre, pour ne plus jamais te demander « et maintenant, je fais quoi ? ».
- Ton quiz branché à Systeme.io sans code, tes leads taggés et tes emails automatisés (pas de Zapier, pas de Make).
- Un coach IA branché sur les vraies données de ton quiz, dispo jour et nuit, qui adapte sa stratégie à TES chiffres.

Tu as aussi la communauté des participants et 5 bonus pour aller plus loin (trafic payant, vente, sondages, popquiz, réseaux sociaux).

Le tout pour 47€. Une seule fois. Accès à vie, et l'accès Tiquiz gratuit est inclus pour démarrer sans rien payer de plus.

Et il y a une garantie : si tu appliques la méthode et que tu ne captes pas un seul lead en 30 jours, tu es remboursé.

👉 Je découvre l'Atelier du Quiz → {AFFILIATE_LINK}

{NAME}

PS : si tu as déjà un quiz qui ne te ramène pas grand-chose, le problème n'est presque jamais le quiz lui-même. C'est tout ce qu'il y a autour. Et c'est exactement ce que l'Atelier règle en 7 jours.`,
  },
  {
    id: "atelier-02-preuve",
    subject: "285 leads en 9 jours, partie de zéro",
    preheader: "",
    notes:
      "Mail 2 - La preuve (étude de cas). Objets A/B/C à tester. B : 0,18€ le lead (tu as bien lu). C : Elle n'avait ni audience ni liste.",
    body: `Salut {first_name},

Hier je t'ai parlé de l'Atelier du Quiz. Aujourd'hui, du concret.

Il y a une étude de cas qui résume tout : celle de Jocelyne.

Elle s'est lancée sur une niche où elle était totalement inconnue. Comptes réseaux créés la veille. Aucune audience. Aucune liste email. Le point de départ le plus dur qui soit.

Plutôt que d'attendre des mois pour construire une audience, elle a fait un quiz. 5 questions, des profils sur mesure. Le quiz tague chaque personne selon ses réponses, directement dans Systeme.io, et déclenche l'email adapté. Sans code.

Le résultat, sur 9 jours (chiffres réels) :

- 285 leads qualifiés via la pub.
- 63,50€ de budget pub. Au total, pas par jour.
- 0,18€ le lead.

Et ce n'est pas un coup de chance. C'est juste le bon enchaînement, dans le bon ordre : capter, attirer, profiler, transformer, optimiser. La méthode qu'on installe pas à pas dans l'Atelier.

Franchement, elle a mis un peu de pub. Mais dans l'Atelier, on commence par le trafic 100% gratuit (la pub, c'est un bonus, pas un passage obligé). Ce que son histoire prouve, c'est l'essentiel : un quiz bien construit qualifie tes leads pour une fraction du prix d'un PDF classique, même en partant de rien.

👉 Je veux ce système pour mon activité → {AFFILIATE_LINK}

Si tu veux lire son histoire en détail (captures et analyse), c'est ici : {LIEN_ETUDE_CAS}

{NAME}`,
  },
  {
    id: "atelier-03-objection",
    subject: "« Oui mais elle, c'est pas pareil »",
    preheader: "",
    notes:
      "Mail 3 - Pourquoi pas toi (objection d'identité). Objets A/B/C à tester. B : Ils l'ont fait. Pourquoi pas toi ? C : Ce que ton cerveau s'est dit hier.",
    body: `Salut {first_name},

Hier, l'histoire de Jocelyne. Et je parie que ton cerveau a fait un truc en la lisant : il a cherché la raison pour laquelle, toi, ça ne marcherait pas.

« Elle a plus d'expérience que moi. »
« Elle a mis de la pub, j'ai pas de budget. »
« Moi je suis nul en technique. »

Je te réponds vite fait.

Ton expertise, tu l'as déjà. Tu as un métier, un vécu, des galères que d'autres traversent en ce moment. Le quiz sert justement à mettre ça en avant, et l'IA t'aide à le formuler à partir de tes mots.

Le budget, tu n'en as pas besoin pour démarrer. On commence par le trafic gratuit, et l'accès Tiquiz gratuit est inclus. Tu fais tout le parcours sans sortir un euro de plus que les 47€.

La technique, elle est guidée. Zéro code, zéro Make, zéro Zapier. L'IA écrit ton quiz, tu corriges en cliquant, la connexion à Systeme.io est expliquée clic par clic. Si tu sais répondre à des questions, tu sais faire ton quiz.

Et si malgré tout tu as un doute : la garantie couvre tes arrières. Pas un seul lead capté en 30 jours malgré la méthode appliquée ? Remboursé. Le risque est du côté du produit, pas du tien.

Donc la vraie question, ce n'est plus « est-ce que ça peut marcher pour moi ». C'est « est-ce que je me lance ».

👉 Oui, je me lance → {AFFILIATE_LINK}

{NAME}`,
  },
  {
    id: "atelier-04-systeme",
    subject: "Là où 9 personnes sur 10 lâchent",
    preheader: "",
    notes:
      "Mail 4 - Le système (la chaîne CAPTO). Objets A/B/C à tester. B : Ton quiz n'est que la première marche. C : Les 5 étapes (et celle que tout le monde saute).",
    body: `Salut {first_name},

Pour qu'un quiz rapporte vraiment, il y a des étapes à respecter, dans l'ordre :

1. Capter : un quiz qu'on a envie de finir (le bon angle, des résultats qui parlent).
2. Attirer : du trafic qualifié dessus, gratuitement.
3. Profiler : taguer chaque personne selon ses réponses.
4. Transformer : convertir ces leads en ventes, avec les bons emails au bon moment.
5. Optimiser : mesurer, ajuster, faire tourner en boucle.

C'est la méthode CAPTO®. Et voilà le truc que presque personne ne dit.

La plupart des gens font l'étape 1. Ils créent leur quiz. Ils sont fiers (à raison). Et ils s'arrêtent là.

Le quiz est en ligne, mais personne ne tombe dessus. Ou il capte des emails que personne ne trie ni ne relance. La chaîne casse à la première marche, et le quiz ne rapporte rien.

Ce n'est pas un problème d'effort. C'est un problème d'enchaînement.

L'Atelier du Quiz, c'est exactement ça : on déroule les 5 maillons avec toi, dans l'ordre, sans en sauter un seul. Ton quiz est publié dès le 4e jour, pour avoir le temps de brancher tout le reste derrière.

Un maillon en cadeau, tout de suite : à l'étape « Capter », l'ordre de tes questions change tout. Plus une personne avance dans ton quiz, moins elle a envie de l'abandonner. Donc si ta question qui fait décrocher tombe trop tôt, tu perds des gens juste avant qu'ils ne te laissent leur email. Inverse-la avec une autre, et tu gardes plus de monde jusqu'au bout. Plus de monde au bout = plus de leads, sans un visiteur de plus.

Ça, c'est UN maillon. Dans l'Atelier, tu as les cinq, et le coach vérifie que les tiens tiennent.

👉 Je veux la chaîne complète → {AFFILIATE_LINK}

{NAME}`,
  },
  {
    id: "atelier-05-faq",
    subject: "Tout ce que tu te demandes sur l'Atelier",
    preheader: "",
    notes:
      "Mail 5 - FAQ (objections pratiques). Objets A/B/C à tester. B : Je réponds à tes questions. C : Cette question vient de toi ?",
    body: `Salut {first_name},

On me pose souvent les mêmes questions sur l'Atelier du Quiz. Je te réponds cash.

« C'est un abonnement ? »
Non. 47€ une seule fois, accès à vie, mises à jour comprises. Aucun prélèvement caché.

« Faut-il payer Tiquiz pour réussir ? »
Non, tu démarres en gratuit. L'accès Tiquiz gratuit est inclus et il suffit pour créer et publier ton premier quiz. Tu passeras au payant seulement quand ton quiz te ramènera déjà des leads.

« C'est encore une formation comme les autres ? »
Non. Tu ne regardes pas des vidéos en prenant des notes que tu n'appliques jamais. Tu apprends à faire un quiz en faisant ton quiz. Chaque jour, une action, un livrable. À la fin, tu as un quiz publié qui tourne.

« Et si je bloque ? »
Tu as un coach IA branché sur les vraies données de ton quiz, dispo jour et nuit, qui te débloque en adaptant ses conseils à tes chiffres. Plus la communauté des participants.

« Comment je sais si mon quiz est bon avant de le lancer ? »
Le Quiz Doctor le passe au crible avant publication : angle, ordre des questions, capture, images. Il te dit quoi corriger. Tu publies un quiz déjà réglé.

« Je débute, je suis nul en technique. »
C'est fait pour toi. Zéro code. L'IA écrit ton quiz, tu corriges en cliquant, chaque étape est guidée.

« Est-ce que ça marche dans ma niche ? »
Oui. Coach, consultant, e-commerce, freelance, créateur… la mécanique est la même, c'est juste l'angle qui change. Partout, les gens adorent parler d'eux et découvrir leur profil.

« Et si ça ne marche pas pour moi ? »
Garantie 30 jours. Pas un seul lead capté en appliquant la méthode ? Remboursé.

👉 J'ai ma réponse, je rejoins l'Atelier → {AFFILIATE_LINK}

{NAME}`,
  },
  {
    id: "atelier-06-cloture",
    subject: "Dernier rappel pour l'Atelier du Quiz",
    preheader: "",
    notes:
      "Mail 6 - Clôture (à activer si l'affilié pose une deadline). Objets A/B/C à tester. B : Ce n'est plus le moment de réfléchir. C : On récapitule (et on décide).",
    body: `Salut {first_name},

Je ne vais pas te tenir la jambe, alors je fais court.

Tu sais que les quiz marchent. Tu sais (ou presque) en créer un. Et tu sais que ce qui te manque, c'est tout ce qui vient après : le trafic, le tri des leads, les relances, la vente.

C'est exactement ce que tu installes dans l'Atelier du Quiz, en 7 jours, accompagné du premier au dernier jour :

- Un quiz audité par le Quiz Doctor puis publié dès le 4e jour.
- Tes leads triés et tes relances automatisées (générateur d'emails + templates Systeme.io).
- Des visiteurs sans un euro de pub et le mécanisme de viralité qui fait grossir ta liste.
- Un coach IA branché sur tes données, la communauté et 5 bonus (trafic payant, vente, sondages, popquiz, réseaux sociaux).

Le tout pour 47€, une seule fois, avec la garantie remboursé si tu ne captes pas un seul lead en 30 jours.

Au fond, tu as deux options. Fermer ce mail, et dans un mois ton quiz est au même point qu'aujourd'hui. Ou cliquer, répondre à quelques questions, et dans 7 jours avoir un système qui te ramène des leads en automatique.

👉 Je rejoins l'Atelier du Quiz → {AFFILIATE_LINK}

{NAME}

PS : si tu veux vraiment créer de l'urgence auprès de ta liste, ajoute ici TA propre échéance (un bonus que tu offres, une date de fin de recommandation). Reste honnête : ne promets que ce que tu tiens.`,
  },
];
