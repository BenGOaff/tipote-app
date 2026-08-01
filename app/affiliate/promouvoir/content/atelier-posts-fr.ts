// app/affiliate/promouvoir/content/atelier-posts-fr.ts
//
// Généré à partir du kit affilié de Béné (repo formaquiz,
// vente/contenu-affiliés). Ne pas réécrire à la main : régénérer depuis
// le markdown source si le kit évolue.
//
// Placeholders résolus à l'affichage :
//   {AFFILIATE_LINK} -> lien tracké de l'affilié
//   {NAME}           -> nom affiché de l'affilié
//   {first_name}     -> variable Systeme.io, laissée telle quelle

export type AtelierPostVisual =
  | { kind: "single"; png: string }
  | { kind: "carousel"; pdf: string; slides: string[]; captions: string[] };

export type AtelierPost = {
  id: string;
  label: string;
  hook: string;
  body: string;
  hashtags: string;
  visual: AtelierPostVisual;
};

export const ATELIER_POSTS_FR: AtelierPost[] = [
  {
    "id": "atelier-post-01",
    "label": "L'ouverture",
    "hook": "Tout le monde sait créer un quiz.",
    "body": "Tout le monde sait créer un quiz.\n\nPresque personne ne sait le faire rapporter.\n\nCréer le quiz, c'est 10 % du travail.\n\nLes 90 % qui rapportent, personne ne les montre : amener du monde dessus, trier les gens selon leurs réponses, les relancer avec le bon message, et vendre. Dans cet ordre précis.\n\nRésultat : des quiz très jolis qui ne rapportent rien.\n\nC'est pour ça que je parle de l'Atelier du Quiz, créé par ma partenaire Béné.\n\nCe n'est pas une formation de plus à empiler dans ton drive. C'est 7 jours, une action par jour, et à la fin tu as un quiz publié, connecté à ton Systeme.io, qui tourne sans toi.\n\n47 €. Une fois. Accès à vie. L'accès à l'outil est inclus pour démarrer sans payer un centime de plus.\n\nSi ton quiz actuel ne rapporte rien, retiens juste ça : le problème n'est presque jamais le quiz. C'est tout ce qu'il y a autour.\n\nLien en commentaire ↓\n\n#leadgeneration #systemeio #marketingdigital #solopreneur #quiz",
    "hashtags": "#leadgeneration #systemeio #marketingdigital #solopreneur #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-01.png"
    }
  },
  {
    "id": "atelier-post-02",
    "label": "Partir de zéro",
    "hook": "Elle a créé ses comptes la veille. Zéro abonné. Zéro liste.",
    "body": "Elle a créé ses comptes la veille. Zéro abonné. Zéro liste.\n\nNeuf jours plus tard, 285 personnes avaient laissé leur email.\n\nVoilà comment 👇\n\nJocelyne a été orthophoniste pendant 40 ans. Elle se lance sur un sujet où personne ne la connaît. Le pire point de départ possible.\n\nAu lieu d'attendre des mois pour construire une audience, elle monte un quiz. Il lui a pris une heure et demie. 5 questions, 5 profils.\n\nChaque réponse tague la personne dans Systeme.io et déclenche le bon email. Sans Zapier, sans une ligne de code.\n\nCe que son histoire prouve, ce n'est pas qu'elle a eu de la chance. C'est que ce qui a tout changé, ce n'est pas son audience : elle n'en avait pas. C'est d'avoir suivi le bon enchaînement, dans le bon ordre.\n\nCapter, attirer, profiler, transformer, optimiser.\n\nC'est exactement la méthode qu'on installe pas à pas dans l'Atelier du Quiz, celui de ma partenaire Béné. Et on y démarre en trafic 100 % gratuit, avant même de penser à dépenser un euro.\n\nSi tu attends d'avoir une audience pour lancer quelque chose, tu attends la mauvaise chose.\n\nLien en commentaire ↓\n\n#casclient #leadgeneration #systemeio #marketingdigital #solopreneur",
    "hashtags": "#casclient #leadgeneration #systemeio #marketingdigital #solopreneur",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-02.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-02-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-02-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-02-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-02-slide-4.png",
        "/affiliate-assets/atelier/posts/aff-post-02-slide-5.png",
        "/affiliate-assets/atelier/posts/aff-post-02-slide-6.png"
      ],
      "captions": [
        "Elle a créé ses comptes la veille. Zéro abonné, zéro liste.",
        "9 jours plus tard : 285 personnes avaient laissé leur email.",
        "Le point de départ. Orthophoniste pendant 40 ans. Un sujet où personne ne la connaît.",
        "Ce qu'elle a fait. Un quiz monté en 1 h 30. 5 questions, 5 profils. Chaque réponse tague la personne dans Systeme.io.",
        "Ce qui a tout changé. Pas son audience, elle n'en avait pas. Le bon enchaînement, dans le bon ordre.",
        "L'Atelier du Quiz · 7 jours pour installer le tien · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-03",
    "label": "Ce qui te retient",
    "hook": "« Ça marche pour eux, pas pour moi. »",
    "body": "« Ça marche pour eux, pas pour moi. »\n\nC'est la phrase qui enterre le plus de projets.\n\nTu veux lancer un quiz pour capter des contacts, mais ton cerveau a déjà trouvé pourquoi ça raterait. En général, l'une de ces quatre.\n\n**« Je n'ai pas l'expertise. »** Si. Ton métier, ton vécu, tes galères, tes clients. Ce qui te manque, ce n'est pas la matière, c'est la forme. L'IA fait la mise en forme, pas le fond.\n\n**« Je n'ai pas le budget. »** Le trafic gratuit est le point de départ, pas le plan B. L'accès à l'outil est inclus.\n\n**« La technique, ça me dépasse. »** Zéro code. Tu connectes ton quiz à ton Systeme.io en cliquant.\n\n**« Je suis tout seul face à ça. »** Un coach disponible jour et nuit, une communauté, et Béné qui répond en personne.\n\nEt une garantie : aucun contact capté en 30 jours en appliquant la méthode, remboursé.\n\nLa vraie question n'est plus « est-ce que ça peut marcher pour moi ».\n\nC'est « est-ce que je m'y mets ».\n\nLien en commentaire ↓\n\n#mindset #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#mindset #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-03.png"
    }
  },
  {
    "id": "atelier-post-04",
    "label": "La chaîne à 5 maillons",
    "hook": "Tu as testé un quiz et il ne t'a rien rapporté ?",
    "body": "Tu as testé un quiz et il ne t'a rien rapporté ?\n\n9 fois sur 10, c'est la même erreur : tu t'es arrêté au premier maillon.\n\nUn quiz qui rapporte, c'est une chaîne. Dans l'ordre. C'est la méthode CAPTO® 👇\n\n**Capter** : un quiz qu'on a envie de finir.\n**Attirer** : du monde dessus, gratuitement.\n**Profiler** : taguer chaque personne selon ses réponses.\n**Transformer** : le bon email, au bon moment.\n**Optimiser** : mesurer, ajuster, recommencer.\n\nCe que presque personne te dit : la plupart des gens font le premier maillon. Ils créent leur quiz. Ils sont fiers, et à raison. Et ils s'arrêtent là.\n\nLe quiz est en ligne, mais personne ne tombe dessus. Ou il capte des emails que personne ne trie ni ne relance.\n\nLa chaîne casse à la première marche, et le quiz meurt tranquillement dans son coin. À côté de ton vieux PDF, tu vois lequel.\n\nCe n'est pas un problème d'effort. C'est un problème d'enchaînement.\n\nAlors je t'offre un maillon, gratuitement.\n\nDans « Capter », l'ordre de tes questions change tout. Une participante l'a dit mieux que moi : « J'ai déplacé une seule question, celle qui demandait le budget. Je l'ai mise à la fin au lieu du début. 18 % de réponses en plus la semaine suivante. »\n\nElle n'a pas amené plus de monde. Elle a juste arrêté d'en perdre.\n\nÇa, c'est un cinquième d'un maillon. Il y en a cinq.\n\nDans l'Atelier du Quiz, celui de ma partenaire Béné, on construit chaque maillon ensemble, appliqué à ton activité. Et tu n'y es jamais seul.\n\nLien en commentaire ↓\n\n#methode #leadgeneration #systemeio #marketingdigital #quiz",
    "hashtags": "#methode #leadgeneration #systemeio #marketingdigital #quiz",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-04.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-04-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-4.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-5.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-6.png",
        "/affiliate-assets/atelier/posts/aff-post-04-slide-7.png"
      ],
      "captions": [
        "Ton quiz ne rapporte rien ? 9 fois sur 10, c'est la même erreur.",
        "Tu t'es arrêté au premier maillon. Un quiz qui rapporte, c'est une chaîne.",
        "La méthode CAPTO® · Capter · Attirer · Profiler · Transformer · Optimiser",
        "Ce que presque personne dit. La plupart créent leur quiz, sont fiers, et s'arrêtent là.",
        "La chaîne casse à la première marche. Ce n'est pas un problème d'effort. C'est un problème d'enchaînement.",
        "Un maillon offert. L'ordre de tes questions change tout. « J'ai déplacé la question du budget à la fin. 18 % de réponses en plus. »",
        "L'Atelier du Quiz · Les 5 maillons, montés dans l'ordre · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-05",
    "label": "Les questions qu'on me pose",
    "hook": "« Encore une formation que je ne finirai jamais. »",
    "body": "« Encore une formation que je ne finirai jamais. »\n\nC'est ce que tu te dis. Et tu as raison de te méfier, les vendeurs de rêve ne manquent pas.\n\nAlors voilà les 5 questions qu'on me pose le plus sur l'Atelier du Quiz.\n\n**1. C'est un abonnement ?**\nNon. 47 €, une seule fois, accès à vie, mises à jour comprises.\n\n**2. Il faut payer un outil en plus ?**\nNon pour démarrer. Tu commences avec la version gratuite, tu passeras au payant le jour où ton quiz te ramène déjà des contacts. Même logique pour Systeme.io.\n\n**3. C'est comme les autres formations ?**\nNon. Tu ne regardes pas des vidéos qui expliquent comment faire. Tu fais ton quiz. Chaque jour, une action, un livrable.\n\n**4. Et si je bloque ?**\nUn coach IA connecté aux vraies données de ton quiz, disponible jour et nuit. Une communauté. Et Béné qui répond en personne.\n\n**5. Et si ça ne marche pas ?**\nGarantie 30 jours. Aucun contact capté en appliquant la méthode, remboursé sans discussion.\n\nIl te reste une question ? Pose-la en commentaire, je réponds à tout.\n\nLien en commentaire ↓\n\n#faq #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#faq #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-05.png"
    }
  },
  {
    "id": "atelier-post-06",
    "label": "Pourquoi je te parle d'elle",
    "hook": "Je te recommande peu de choses. Alors quand je le fais, je te dis pourquoi.",
    "body": "Je te recommande peu de choses. Alors quand je le fais, je te dis pourquoi.\n\nBéné a été infirmière avant de créer son entreprise. Et ce métier lui a laissé un réflexe qu'elle utilise encore aujourd'hui.\n\nEn soin, on t'apprend une chose : on ne traite pas le symptôme, on cherche la vraie cause.\n\nDepuis des mois, elle voit des gens créer leur quiz. Fiers de l'avoir fait, soulagés. Et après, plus rien. Le quiz reste là, presque personne dessus, des emails capturés que personne n'exploite.\n\nToujours la même phrase dans sa boîte : « J'ai fait mon quiz, je fais quoi maintenant ? »\n\nAu début elle répondait un par un, longuement, des heures. Parce que ça la rend dingue, l'idée que quelqu'un fasse l'effort, y croie, et abandonne juste parce que personne ne lui a montré la suite.\n\nLe problème, ce n'est presque jamais le quiz. C'est le vide autour : pas de trafic, pas d'automatisation, pas de plan.\n\nAlors elle a arrêté de répondre à l'infini et elle a construit l'Atelier du Quiz.\n\nCe n'est pas une formation de plus à laisser moisir. C'est la réponse qu'elle aurait voulu donner à chaque personne restée coincée.\n\nVoilà pourquoi je t'en parle.\n\nLien en commentaire ↓\n\n#entrepreneuriat #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#entrepreneuriat #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-06.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-06-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-06-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-06-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-06-slide-4.png",
        "/affiliate-assets/atelier/posts/aff-post-06-slide-5.png"
      ],
      "captions": [
        "Je te recommande peu de choses. Alors quand je le fais, je te dis pourquoi.",
        "Elle a été infirmière avant. En soin, on ne traite pas le symptôme. On cherche la vraie cause.",
        "La phrase qu'elle recevait tous les jours. « J'ai fait mon quiz, je fais quoi maintenant ? »",
        "Le problème n'est presque jamais le quiz. C'est le vide autour : pas de trafic, pas d'automatisation, pas de plan.",
        "L'Atelier du Quiz · La réponse qu'elle aurait voulu donner à chacun · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-07",
    "label": "Ton PDF gratuit dort",
    "hook": "Ton PDF gratuit a arrêté de t'amener des clients, et tu crois que le problème c'est ta niche.",
    "body": "Ton PDF gratuit a arrêté de t'amener des clients, et tu crois que le problème c'est ta niche.\n\nCe n'est pas ça.\n\nPDF, checklist, mini-formation offerte : tu as sûrement testé. Quelques téléchargements, puis plus rien. Les emails captés dorment dans ta liste.\n\nLe problème n'est ni ta niche ni ton marketing.\n\nC'est que ces contenus sont passifs. On les télécharge, on ferme le document, on l'oublie. Et toi, tu n'apprends strictement rien sur la personne qui vient de le prendre.\n\nUn quiz, c'est l'inverse. La personne participe, elle répond, elle se dévoile.\n\nÀ la fin, tu ne récupères pas juste un email.\n\nTu récupères un email, un profil, et un besoin précis. Que tu peux taguer et relancer dans ton Systeme.io, automatiquement.\n\nVoilà pourquoi un quiz qualifie tellement mieux qu'un PDF. Dans toutes les niches, y compris la tienne.\n\nDans l'Atelier du Quiz, celui de ma partenaire Béné, on transforme ton contenu gratuit qui dort en quiz qui trie et qui vend.\n\nLien en commentaire ↓\n\n#leadmagnet #leadgeneration #systemeio #solopreneur #quiz",
    "hashtags": "#leadmagnet #leadgeneration #systemeio #solopreneur #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-07.png"
    }
  },
  {
    "id": "atelier-post-08",
    "label": "Ni facile ni rapide",
    "hook": "Je vais faire un truc stupide pour quelqu'un qui recommande un produit.",
    "body": "Je vais faire un truc stupide pour quelqu'un qui recommande un produit.\n\nJe vais te dire que ce ne sera ni facile ni rapide.\n\nTu ne vas pas cliquer 5 minutes, filer devant une série et enchaîner les ventes.\n\nIl faut créer un quiz assez bon pour qu'on aille jusqu'au bout. Le diffuser pour amener du monde dessus. Le connecter à ton autorépondeur pour que chaque réponse serve à quelque chose.\n\nEn gros : une petite heure par jour, pendant 7 jours.\n\nSi tu cherches une option « devenir riche sans rien faire », continue à scroller, sincèrement.\n\nEn revanche.\n\nSi tu acceptes de mettre une heure par jour pendant une semaine, voilà ce que ça installe chez toi :\n\n→ Un quiz publié et connecté dès le 4ᵉ jour\n→ Des contacts qui rentrent et se trient tout seuls\n→ Un plan clair, dans l'ordre, sans jamais douter de ta prochaine étape\n\nCe n'est pas facile au sens « sans rien faire ».\n\nC'est simple au sens « tu sais exactement quoi faire, et quelqu'un te débloque quand tu cales ».\n\nLa nuance change tout.\n\nUne participante a mis une heure et demie à créer son quiz. 285 personnes ont laissé leur email dans les 9 jours qui ont suivi. Elle a travaillé, oui. Mais dans le bon ordre.\n\nLien en commentaire ↓\n\n#entrepreneuriat #discipline #leadgeneration #solopreneur #quiz",
    "hashtags": "#entrepreneuriat #discipline #leadgeneration #solopreneur #quiz",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-08.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-08-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-08-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-08-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-08-slide-4.png",
        "/affiliate-assets/atelier/posts/aff-post-08-slide-5.png"
      ],
      "captions": [
        "Ce ne sera ni facile ni rapide. Je préfère te le dire tout de suite.",
        "Ce qu'il faut vraiment faire. Un quiz qu'on finit · du monde dessus · connecté à ton autorépondeur",
        "Une petite heure par jour, pendant 7 jours. Pas 5 minutes.",
        "Ce que ça installe. Un quiz publié au 4ᵉ jour · des contacts qui se trient tout seuls · un plan clair",
        "Simple ≠ facile. Tu sais exactement quoi faire, et quelqu'un te débloque quand tu cales."
      ]
    }
  },
  {
    "id": "atelier-post-09",
    "label": "« C'est gratuit sur YouTube »",
    "hook": "« C'est gratuit sur YouTube. »",
    "body": "« C'est gratuit sur YouTube. »\n\nOui. C'est vrai. Et c'est exactement là que ça coince.\n\nLa question m'a été posée cette semaine, et elle est légitime : pourquoi payer un atelier quand tout se trouve déjà en ligne ?\n\nCréer un quiz, amener du trafic, taguer un contact, monter une séquence d'emails : tout est quelque part.\n\nLe souci, c'est que c'est en morceaux, éparpillé dans des centaines de vidéos qui ne se parlent pas entre elles.\n\nLe problème n'a jamais été de trouver l'information. C'est le temps que tu vas y passer.\n\nTrier les vidéos. Les regarder. Adapter tout ça à ton activité à toi. Assembler des méthodes qui ne vont pas ensemble. Tester. Te tromper. Recommencer.\n\nEt rester bloqué, sans personne pour te dire où est l'erreur.\n\nC'est arrivé à quelqu'un que je connais : des jours à chercher un bug dans son quiz, alors qu'il lui manquait simplement du monde dessus.\n\nL'Atelier du Quiz, c'est le même savoir. Béné ne réinvente pas la route.\n\nSauf qu'il est rangé dans l'ordre, adapté à ton domaine, et que tu n'y es jamais seul.\n\nElle a passé des mois à le penser, à le coder et à tourner les vidéos.\n\nToi, il te faut 47 € et 7 jours pour tout lui prendre.\n\nÀ toi de voir ce que vaut ton temps.\n\nLien en commentaire ↓\n\n#leadgeneration #systemeio #solopreneur #productivite",
    "hashtags": "#leadgeneration #systemeio #solopreneur #productivite",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-09.png"
    }
  },
  {
    "id": "atelier-post-10",
    "label": "Dans 30 jours",
    "hook": "Dans 30 jours, un matin, tu ouvres ton téléphone.",
    "body": "Dans 30 jours, un matin, tu ouvres ton téléphone.\n\nEt tu vois que des gens ont rempli ton quiz pendant la nuit.\n\nPas des curieux. Des gens qui savent déjà ce que tu fais, et qui viennent de te dire ce dont ils ont besoin.\n\nTu n'as rien fait de spécial la veille. Ton quiz a tourné tout seul.\n\nTa liste grossit chaque semaine, sans que tu postes tous les jours en priant pour trois likes.\n\nEt quand tu lances une offre, tu ne pars plus de zéro. Il y a déjà des gens chauds, triés, qui n'attendent que ça.\n\nCe n'est pas un rêve lointain. C'est ce qu'une participante a mis en place en 9 jours, en partant de zéro.\n\nLa seule différence entre toi et cette matinée-là : un quiz bien construit, bien connecté. Et 7 jours pour le faire.\n\nC'est tout l'objet de l'Atelier du Quiz.\n\nLien en commentaire ↓\n\n#vision #liberte #leadgeneration #systemeio #quiz",
    "hashtags": "#vision #liberte #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-10.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-10-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-10-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-10-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-10-slide-4.png",
        "/affiliate-assets/atelier/posts/aff-post-10-slide-5.png"
      ],
      "captions": [
        "Dans 30 jours, un matin. Tu ouvres ton téléphone.",
        "Des gens ont rempli ton quiz pendant la nuit. Et t'ont dit ce dont ils ont besoin.",
        "Tu n'as rien fait de spécial la veille. Ton quiz a tourné tout seul.",
        "Quand tu lances une offre, tu ne pars plus de zéro. Des gens déjà chauds, déjà triés.",
        "La seule différence : 7 jours. L'Atelier du Quiz · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-11",
    "label": "47 €",
    "hook": "47 €.",
    "body": "47 €.\n\nLe prix de deux menus au restaurant. Ou celui d'un système qui te ramène des contacts qualifiés tous les jours, à vie.\n\nC'est le tarif de l'Atelier du Quiz : 7 jours pour lancer un quiz qui capte en automatique, connecté à ton Systeme.io.\n\nAvec 47 €, tu arrêtes de poster dans le vide en espérant récolter trois emails.\n\nAvec 47 €, tu installes quelque chose qui travaille pour toi le soir, le week-end, pendant tes vacances.\n\nPosés là, ces 47 € ne sont pas une dépense. C'est un outil qui peut te rapporter bien plus qu'il ne coûte. Paiement unique, aucun abonnement, aucun prélèvement caché.\n\nEt si au bout de 30 jours tu n'as pas capté un seul contact en appliquant la méthode, tu es remboursé.\n\nLe vrai risque n'est pas de perdre 47 €.\n\nC'est de rester exactement là où tu es.\n\nLien en commentaire ↓\n\n#investissement #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#investissement #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-11.png"
    }
  },
  {
    "id": "atelier-post-12",
    "label": "44,9 %",
    "hook": "44,9 %.",
    "body": "44,9 %.\n\nC'est la proportion de gens qui commencent un quiz de coaching ou de formation et qui laissent leur email au bout.\n\nC'est le rapport Interact qui le dit, pas moi.\n\nPresque une personne sur deux.\n\nMaintenant va regarder le taux de ta dernière page de capture, et compare.\n\nEt on continue de dire qu'un quiz, c'est sympa, mais que ça ne vend pas.\n\nUn contenu gratuit classique te donne une adresse email.\n\nUn quiz te donne une adresse email, et il te dit ce que la personne veut.\n\nElle répond. Elle arrive sur son résultat. Son résultat l'envoie sur ta page. Et parfois elle achète avant même que ta première relance soit partie.\n\nC'est ça qu'on installe dans l'Atelier du Quiz : 7 jours pour monter le tien, en ligne et connecté à ton Systeme.io dès le 4ᵉ jour.\n\n47 €, paiement unique, accès à vie. Aucun contact capté en 30 jours en appliquant la méthode ? Remboursé.\n\nLien en commentaire ↓\n\n#systemeio #quiz #leadmagnet #leadgeneration",
    "hashtags": "#systemeio #quiz #leadmagnet #leadgeneration",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-12.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-12-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-12-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-12-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-12-slide-4.png"
      ],
      "captions": [
        "44,9 % · La proportion de gens qui commencent un quiz de coaching ou de formation et laissent leur email au bout. Rapport Interact.",
        "Va regarder ta dernière page de capture. Et compare.",
        "Un PDF te donne une adresse. Un quiz te donne une adresse, et ce que la personne veut.",
        "L'Atelier du Quiz · En ligne et connecté dès le 4ᵉ jour · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-13",
    "label": "Tu ne restes jamais bloqué",
    "hook": "Le vrai risque quand tu achètes une formation, ce n'est pas qu'elle soit mauvaise.",
    "body": "Le vrai risque quand tu achètes une formation, ce n'est pas qu'elle soit mauvaise.\n\nC'est que tu bloques au jour 3, un dimanche soir, et que personne ne réponde.\n\nAlors tu remets à demain. Puis à la semaine prochaine. Et le dossier se referme.\n\nDans l'Atelier du Quiz, il y a trois filets sous toi.\n\n**Un coach IA** connecté aux vraies données de ton quiz. Il connaît ton domaine et ton contexte. Tu bloques à 23 h un dimanche, tu demandes, tu as ta réponse, et tu avances le soir même.\n\n**Un diagnostic question par question**, qui te montre exactement laquelle réécrire quand les gens abandonnent en cours de route. Tu changes une phrase, et ils vont jusqu'au bout du parcours que tu as construit.\n\n**Une communauté**, où tu vois les quiz des autres membres pendant que tu construis le tien. Tu repères le matin ce qui marche chez eux, tu l'appliques chez toi l'après-midi.\n\nEt au-dessus de tout ça, Béné répond en personne. Un vrai humain, pas un répondeur automatique.\n\nLa question n'est pas « est-ce que le contenu est bon ». C'est « est-ce que je vais aller au bout ».\n\nLien en commentaire ↓\n\n#accompagnement #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#accompagnement #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-13.png"
    }
  },
  {
    "id": "atelier-post-14",
    "label": "Ce qu'il y a dedans",
    "hook": "47 €, c'est le prix des 7 jours.",
    "body": "47 €, c'est le prix des 7 jours.\n\nLe reste, tu ne l'as pas payé.\n\n**Le trafic payant sans risque.** La règle d'or : tu ne lances jamais de publicité avant que ton quiz capte déjà en gratuit. Plus l'offre à placer juste après le quiz pour que ses ventes remboursent ce que tu as dépensé.\n\n**Vendre avec ton quiz.** Comment le résultat lui-même amène à ton offre, sans que ça ressemble à de la vente. Tu arrêtes de tortiller au moment de proposer quelque chose.\n\n**Les sondages.** Écrire ton quiz et ton offre avec les mots exacts de ta cible, au lieu de les deviner à ton bureau. Trois cents réponses, et tu crées ta prochaine offre en sachant déjà qu'elle va se vendre.\n\n**Les popquiz.** Le format court qui s'ouvre au bon moment sur ton site, pour transformer les visiteurs qui allaient repartir sans rien laisser.\n\n**Les réseaux sociaux.** Le déclencheur qui donne envie à tes participants d'envoyer ton quiz à leur entourage. Ton quiz continue de tourner pendant que tu dors.\n\nEt deux outils que tu n'as pas à payer pour démarrer : le logiciel de quiz en version gratuite, et les modèles à importer en un clic dans ton Systeme.io. Séquence de bienvenue et pages de liens comprises.\n\nTu remplaces, tu publies. La partie technique que tu repousses depuis des mois est pliée avant le dîner.\n\nLien en commentaire ↓\n\n#bonus #leadgeneration #systemeio #solopreneur #quiz",
    "hashtags": "#bonus #leadgeneration #systemeio #solopreneur #quiz",
    "visual": {
      "kind": "carousel",
      "pdf": "/affiliate-assets/atelier/posts/aff-post-14.pdf",
      "slides": [
        "/affiliate-assets/atelier/posts/aff-post-14-slide-1.png",
        "/affiliate-assets/atelier/posts/aff-post-14-slide-2.png",
        "/affiliate-assets/atelier/posts/aff-post-14-slide-3.png",
        "/affiliate-assets/atelier/posts/aff-post-14-slide-4.png"
      ],
      "captions": [
        "47 €, c'est le prix des 7 jours. Le reste, tu ne l'as pas payé.",
        "Les 5 bonus · Trafic payant sans risque · Vendre avec ton quiz · Les sondages · Les popquiz · Les réseaux sociaux",
        "Les 2 outils inclus pour démarrer · Le logiciel de quiz en gratuit · Les modèles à importer en un clic dans Systeme.io",
        "L'Atelier du Quiz · 7 jours, une action par jour · 47 € à vie · Lien en commentaire"
      ]
    }
  },
  {
    "id": "atelier-post-15",
    "label": "Les deux chemins",
    "hook": "Tu es à un embranchement, et les deux chemins sont valables.",
    "body": "Tu es à un embranchement, et les deux chemins sont valables.\n\n**Le premier.** Tu fermes ce post. Tu continues comme avant. Dans 30 jours, ton quiz est exactement au même point qu'aujourd'hui, ta liste ne te dit toujours rien de ceux qui sont dedans, et tu recommences à chercher d'où vont venir tes prochains clients. Ce chemin n'a rien de honteux. Beaucoup le prennent, et ils vivent très bien.\n\n**Le second.** Tu prends 7 jours, une heure par jour. Au 4ᵉ jour ton quiz est en ligne et capte déjà. Au 7ᵉ, le système tourne : les gens répondent, se trient tout seuls, et arrivent chez toi avec leur profil et leur besoin. Ensuite ça continue sans toi, le soir, le week-end, en vacances.\n\n47 €, paiement unique, accès à vie. Aucun contact capté en 30 jours en appliquant la méthode ? Remboursé.\n\nCe qui sépare les deux chemins, ce n'est pas le talent. C'est une décision qui prend dix secondes.\n\nLe lien est en commentaire. Il reste ouvert.\n\nQuoi que tu décides, c'est ton choix, et je le respecte.\n\n{NAME}\n\nLien en commentaire ↓\n\n#decision #solopreneur #leadgeneration #systemeio #quiz",
    "hashtags": "#decision #solopreneur #leadgeneration #systemeio #quiz",
    "visual": {
      "kind": "single",
      "png": "/affiliate-assets/atelier/posts/aff-post-15.png"
    }
  }
];
