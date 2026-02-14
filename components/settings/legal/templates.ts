// components/settings/legal/templates.ts
// Country-specific legal document templates
import type { Country, DocType, LegalFormData } from "./types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function v(val: string, fallback = "[NON RENSEIGNÉ]"): string {
  return val.trim() || fallback;
}

function dateNow(): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

/* ================================================================== */
/*  FRANCE                                                             */
/* ================================================================== */

function mentionsFrance(d: LegalFormData): string {
  return `MENTIONS LÉGALES
Dernière mise à jour : ${dateNow()}

ÉDITEUR DU SITE
Le site ${v(d.siteUrl)} est édité par :
${v(d.raisonSociale)}
${v(d.structureType)} au capital de ${v(d.capitalSocial)} €
Immatriculée au Registre du Commerce et des Sociétés de ${v(d.rcsVille)} sous le numéro ${v(d.rcsNumero)}
Numéro SIREN/SIRET : ${v(d.siren)}
Numéro de TVA intracommunautaire : ${v(d.tvaIntra)}
Siège social : ${v(d.adresse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}

DIRECTEUR DE LA PUBLICATION
${v(d.responsableName)}, en qualité de ${v(d.responsableFunction)}.

HÉBERGEMENT
Le site est hébergé par :
${v(d.hebergeurNom)}
Siège social : ${v(d.hebergeurAdresse)}
Téléphone : ${v(d.hebergeurTelephone)}
Site web : ${v(d.hebergeurUrl)}

PROPRIÉTÉ INTELLECTUELLE
L'ensemble des éléments figurant sur le site ${v(d.siteUrl)} (textes, images, graphismes, logo, vidéos, icônes, sons, logiciels, etc.) est protégé par les lois françaises et internationales relatives à la propriété intellectuelle.
Sauf mention contraire, ces éléments sont la propriété exclusive de ${v(d.raisonSociale)}.
Toute reproduction, représentation, modification, adaptation, distribution ou diffusion, totale ou partielle, du site ou de l'un quelconque des éléments qui le composent, par quelque procédé que ce soit, sans l'autorisation écrite préalable de ${v(d.raisonSociale)}, est strictement interdite et constitutive de contrefaçon.

RESPONSABILITÉ
${v(d.raisonSociale)} s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur le site, mais ne peut garantir l'exactitude, la précision ou l'exhaustivité des informations mises à disposition.
En conséquence, ${v(d.raisonSociale)} décline toute responsabilité pour toute imprécision, inexactitude ou omission portant sur des informations disponibles sur le site, ainsi que pour tous dommages résultant d'une intrusion frauduleuse d'un tiers ayant entraîné une modification des informations mises à disposition.

LIENS HYPERTEXTES
Le site peut contenir des liens vers d'autres sites ou sources externes. ${v(d.raisonSociale)} ne peut être tenue responsable du contenu, du fonctionnement ou de l'accès à ces sites et sources externes.

DONNÉES PERSONNELLES
${v(d.raisonSociale)} est susceptible de collecter des données à caractère personnel vous concernant, notamment lorsque vous utilisez un formulaire de contact, vous abonnez à une liste de diffusion, créez un compte ou effectuez une commande.
Les conditions de traitement de ces données et les droits dont vous disposez sont détaillés dans la « Politique de confidentialité » accessible sur le site.
Pour toute question relative à vos données personnelles ou pour exercer vos droits, vous pouvez contacter ${v(d.emailRgpd || d.email)}.
Vous disposez du droit d'introduire une réclamation auprès de la Commission nationale de l'informatique et des libertés (CNIL) via www.cnil.fr.

DROIT APPLICABLE
Le présent site et les présentes mentions légales sont soumis au droit français. Tout litige relatif à leur interprétation ou à leur exécution relève des tribunaux français compétents.`;
}

function cgvFrance(d: LegalFormData): string {
  return `CONDITIONS GÉNÉRALES DE VENTE
Dernière mise à jour : ${dateNow()}

ARTICLE 1 – OBJET
Les présentes Conditions Générales de Vente (ci-après les « CGV ») définissent les droits et obligations des parties dans le cadre de la vente en ligne de produits et/ou de services proposés par ${v(d.raisonSociale)} (ci-après le « Vendeur ») sur le site internet ${v(d.siteUrl)} au profit de tout consommateur ou non-professionnel (ci-après le « Client »).

ARTICLE 2 – IDENTITÉ DU VENDEUR
${v(d.raisonSociale)}
${v(d.structureType)} au capital de ${v(d.capitalSocial)} €
Immatriculée au RCS de ${v(d.rcsVille)} sous le numéro ${v(d.rcsNumero)}
Numéro SIREN/SIRET : ${v(d.siren)}
Numéro de TVA intracommunautaire : ${v(d.tvaIntra)}
Siège social : ${v(d.adresse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}

ARTICLE 3 – PRODUITS ET SERVICES
Les produits et services proposés à la vente sont ceux qui figurent sur le site ${v(d.siteUrl)} au jour de la consultation par le Client, dans la limite des stocks disponibles. Chaque produit ou service fait l'objet d'un descriptif reprenant ses caractéristiques essentielles.
Description de l'activité : ${v(d.produitsDescription)}

ARTICLE 4 – PRIX
Les prix sont indiqués en ${v(d.devise)}, toutes taxes comprises (TTC), hors éventuels frais de livraison, de traitement de commande ou d'autres frais supplémentaires mentionnés le cas échéant avant la validation de la commande.
Le Vendeur se réserve le droit de modifier ses prix à tout moment ; toutefois, le prix applicable est celui en vigueur au moment de la validation de la commande par le Client.

ARTICLE 5 – COMMANDE
Le Client sélectionne les produits et/ou services qu'il souhaite commander, les ajoute à son panier, puis suit le processus de commande indiqué sur le site. Avant de confirmer sa commande, le Client peut vérifier le détail de celle-ci, son prix total et corriger d'éventuelles erreurs.
La validation définitive de la commande par le Client vaut acceptation pleine et entière des présentes CGV.

ARTICLE 6 – PAIEMENT
Le prix est exigible immédiatement à la commande. Le paiement s'effectue par ${v(d.moyensPaiement)} via un système de paiement sécurisé assuré par ${v(d.prestatairePaiement)}.
Le Vendeur n'a pas accès aux données bancaires confidentielles communiquées par le Client lors du paiement.

ARTICLE 7 – LIVRAISON / FOURNITURE DES SERVICES
${d.produitsPhysiques ? `Produits physiques :
Les produits sont livrés à l'adresse indiquée par le Client lors de la commande.
Zones livrées : ${v(d.zonesLivrees)}
Délais de livraison : ${v(d.delaisLivraison)}
Frais de livraison : ${v(d.fraisLivraison)}
Le transfert des risques intervient au moment où le Client prend physiquement possession des produits.

` : ""}Produits et services numériques :
L'accès aux produits ou services numériques (formations en ligne, fichiers téléchargeables, abonnements, etc.) est accordé dans les conditions décrites sur la page de vente correspondante, généralement après encaissement intégral du prix.

ARTICLE 8 – DROIT DE RÉTRACTATION
Conformément aux articles L221-18 et suivants du Code de la consommation, le Client dispose d'un délai de quatorze (14) jours à compter de la réception du produit ou de la conclusion du contrat de prestation de services pour exercer son droit de rétractation, sans avoir à motiver sa décision.
Le droit de rétractation ne s'applique pas notamment :
- aux services pleinement exécutés avant la fin du délai de rétractation avec accord préalable exprès du Client ;
- à la fourniture de contenus numériques non fournis sur un support matériel dont l'exécution a commencé avec accord préalable exprès du Client ;
- aux biens confectionnés selon les spécifications du Client ou nettement personnalisés ;
${d.retractationExclusions ? `- ${v(d.retractationExclusions)}` : ""}
Pour exercer son droit de rétractation, le Client informe le Vendeur de sa décision par courrier ou email aux coordonnées indiquées à l'article 2.
${v(d.politiqueRemboursement, "Le Vendeur rembourse le Client de la totalité des sommes versées, y compris les frais de livraison standards, au plus tard quatorze (14) jours après avoir été informé de la décision de rétractation.")}

ARTICLE 9 – GARANTIES LÉGALES
Les produits vendus bénéficient de la garantie légale de conformité et de la garantie contre les vices cachés dans les conditions prévues par la loi.

ARTICLE 10 – PROPRIÉTÉ INTELLECTUELLE
Les contenus, produits et services sont protégés par le droit d'auteur et demeurent la propriété exclusive de ${v(d.raisonSociale)}. Le Client se voit accorder un droit d'utilisation personnel, non exclusif et non transmissible.

ARTICLE 11 – DONNÉES PERSONNELLES
Dans le cadre de l'exécution des commandes, le Vendeur collecte et traite des données à caractère personnel. Ces données sont traitées conformément à la Politique de confidentialité accessible sur le site.

ARTICLE 12 – RÈGLEMENT DES LITIGES – MÉDIATION
En cas de différend, le Client est invité à contacter le service clientèle du Vendeur à l'adresse ${v(d.email)} afin de rechercher une solution amiable. Le Client est informé qu'il peut recourir à un médiateur de la consommation.

ARTICLE 13 – DROIT APPLICABLE
Les présentes CGV sont soumises au droit français. Tout litige sera soumis aux tribunaux compétents dans les conditions de droit commun.`;
}

function privacyFrance(d: LegalFormData): string {
  return `POLITIQUE DE CONFIDENTIALITÉ
Dernière mise à jour : ${dateNow()}

1. PRÉAMBULE
La présente politique de confidentialité décrit la manière dont ${v(d.raisonSociale)} collecte, utilise, conserve et protège les données à caractère personnel des utilisateurs du site ${v(d.siteUrl)}, conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés modifiée.

2. RESPONSABLE DU TRAITEMENT
${v(d.raisonSociale)}
${v(d.structureType)}
Siège social : ${v(d.adresse)}
Email de contact : ${v(d.emailRgpd || d.email)}

3. DONNÉES COLLECTÉES
${v(d.donneesCollectees, "Identité (nom, prénom), coordonnées (email, téléphone, adresse), données de compte, données de navigation, données de paiement (via prestataire tiers).")}

4. FINALITÉS DU TRAITEMENT
${v(d.finalitesTraitement, `- Gestion des demandes et prises de contact
- Gestion des commandes, de la facturation et de la relation client
- Gestion des comptes utilisateurs
- Envoi de communications commerciales et de newsletters (si consentement)
- Mesure d'audience et amélioration du site
- Respect des obligations légales et réglementaires`)}

5. BASES LÉGALES
Les traitements reposent sur :
- l'exécution d'un contrat ou de mesures précontractuelles ;
- le respect d'obligations légales ;
- l'intérêt légitime du responsable du traitement ;
- le consentement de la personne concernée pour les traitements pour lesquels il est requis.

6. DESTINATAIRES DES DONNÉES
Les données personnelles peuvent être communiquées à des prestataires techniques et partenaires impliqués dans la fourniture des services (hébergement, emailing, paiement, analytics, etc.), soumis à une obligation de confidentialité.
Outils et sous-traitants utilisés : ${v(d.outilsUtilises, "hébergeur, emailing, paiement, analytics")}

7. TRANSFERTS DE DONNÉES HORS UNION EUROPÉENNE
${v(d.transfertsHorsUE, "Le cas échéant, si des données sont transférées vers des pays situés en dehors de l'Union européenne, des garanties appropriées sont mises en place (clauses contractuelles types, EU-US Data Privacy Framework, etc.).")}

8. DURÉE DE CONSERVATION
${v(d.dureesConservation, `- Données prospects : 3 ans à compter du dernier contact
- Données clients : durée de la relation contractuelle + obligations légales (10 ans pour la comptabilité)
- Données de navigation et cookies : 13 mois`)}

9. DROITS DES PERSONNES
Conformément à la réglementation, vous disposez des droits suivants :
- Droit d'accès à vos données
- Droit de rectification
- Droit d'effacement (droit à l'oubli)
- Droit à la limitation du traitement
- Droit d'opposition
- Droit à la portabilité de vos données
- Droit de définir des directives relatives au sort de vos données après votre décès
Vous pouvez exercer ces droits en envoyant un email à ${v(d.emailRgpd || d.email)}.

10. RÉCLAMATION
Vous disposez du droit d'introduire une réclamation auprès de la CNIL (www.cnil.fr).

11. SÉCURITÉ
${v(d.raisonSociale)} met en place des mesures techniques et organisationnelles appropriées pour garantir un niveau de sécurité adapté au risque.

12. MISE À JOUR
La présente politique peut être modifiée à tout moment. La date de dernière mise à jour figure en tête du document.`;
}

/* ================================================================== */
/*  BELGIQUE                                                           */
/* ================================================================== */

function mentionsBelgique(d: LegalFormData): string {
  return `MENTIONS LÉGALES
Dernière mise à jour : ${dateNow()}

ÉDITEUR DU SITE
${v(d.raisonSociale)}
${v(d.structureType)}
Siège social : ${v(d.adresse)}
Numéro d'entreprise (BCE) : ${v(d.bceName)}
Numéro de TVA : ${v(d.tvaBelgique)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}

RESPONSABLE DE LA PUBLICATION
${v(d.responsableName)}, ${v(d.responsableFunction)}.

HÉBERGEMENT
${v(d.hebergeurNom)}
${v(d.hebergeurAdresse)}
Téléphone : ${v(d.hebergeurTelephone)}
Site web : ${v(d.hebergeurUrl)}

PROPRIÉTÉ INTELLECTUELLE
Le contenu du site ${v(d.siteUrl)} (textes, images, graphismes, logos, vidéos, icônes, etc.) est protégé par le droit d'auteur et autres droits de propriété intellectuelle. Sauf indication contraire, ce contenu est la propriété de ${v(d.raisonSociale)}. Toute reproduction, même partielle, est interdite sans autorisation écrite préalable.

RESPONSABILITÉ
${v(d.raisonSociale)} met tout en œuvre pour assurer l'exactitude des informations publiées mais ne peut en garantir l'exhaustivité ou l'absence d'erreur. ${v(d.raisonSociale)} décline toute responsabilité en cas de dommage résultant de l'utilisation du site.

LIENS EXTERNES
Le site peut contenir des liens vers d'autres sites internet. ${v(d.raisonSociale)} n'assume aucune responsabilité quant à leur contenu.

DONNÉES PERSONNELLES
Les modalités de traitement des données personnelles sont décrites dans la Politique de confidentialité accessible sur le site.
Vous pouvez exercer vos droits en contactant ${v(d.emailRgpd || d.email)}.
L'autorité de contrôle compétente est l'Autorité de protection des données (APD) – www.autoriteprotectiondonnees.be.`;
}

function cgvBelgique(d: LegalFormData): string {
  return `CONDITIONS GÉNÉRALES DE VENTE
Dernière mise à jour : ${dateNow()}

ARTICLE 1 – OBJET
Les présentes CGV définissent les droits et obligations de ${v(d.raisonSociale)} (ci-après le « Vendeur ») et de toute personne (ci-après le « Client ») effectuant un achat via le site ${v(d.siteUrl)}.

ARTICLE 2 – IDENTIFICATION DU VENDEUR
${v(d.raisonSociale)}
${v(d.structureType)}
Numéro d'entreprise (BCE) : ${v(d.bceName)}
Numéro de TVA : ${v(d.tvaBelgique)}
Siège social : ${v(d.adresse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}

ARTICLE 3 – PRODUITS ET SERVICES
Les produits et services proposés sont décrits sur le site ${v(d.siteUrl)}. Les offres sont valables dans la limite des stocks disponibles.
Description : ${v(d.produitsDescription)}

ARTICLE 4 – PRIX
Les prix sont indiqués en ${v(d.devise)}, toutes taxes comprises (TVAC), sauf indication contraire. Les frais de livraison sont précisés avant la validation de la commande.

ARTICLE 5 – COMMANDE
En validant sa commande, le Client déclare accepter les présentes CGV. La vente est définitive après confirmation par email du Vendeur.

ARTICLE 6 – PAIEMENT
Le paiement s'effectue en ligne par ${v(d.moyensPaiement)}. Les transactions sont sécurisées via ${v(d.prestatairePaiement)}.

ARTICLE 7 – LIVRAISON / EXÉCUTION
${d.produitsPhysiques ? `Produits physiques : livrés à l'adresse indiquée par le Client.
Zones : ${v(d.zonesLivrees)} – Délais : ${v(d.delaisLivraison)} – Frais : ${v(d.fraisLivraison)}
` : ""}Produits et services numériques : fournis conformément aux indications du site à compter de la réception du paiement.

ARTICLE 8 – DROIT DE RÉTRACTATION (CONSOMMATEURS)
Le Client consommateur dispose d'un délai de quatorze (14) jours pour se rétracter. Le droit de rétractation ne s'applique pas à la fourniture de contenus numériques si l'exécution a commencé avec l'accord préalable exprès du Client.
${d.retractationExclusions ? `Exclusions supplémentaires : ${v(d.retractationExclusions)}` : ""}
${v(d.politiqueRemboursement, "")}

ARTICLE 9 – CONFORMITÉ ET GARANTIES
Les produits bénéficient des garanties légales de conformité et contre les défauts cachés prévues par le droit belge.

ARTICLE 10 – PROPRIÉTÉ INTELLECTUELLE
Les contenus demeurent la propriété exclusive du Vendeur. Toute reproduction non autorisée est interdite.

ARTICLE 11 – DONNÉES PERSONNELLES
Les données personnelles sont traitées conformément à la Politique de confidentialité de ${v(d.raisonSociale)}.

ARTICLE 12 – DROIT APPLICABLE ET LITIGES
Les présentes CGV sont régies par le droit belge. En cas de litige, les parties s'efforceront de trouver une solution amiable.`;
}

function privacyBelgique(d: LegalFormData): string {
  return `POLITIQUE DE CONFIDENTIALITÉ
Dernière mise à jour : ${dateNow()}

1. RESPONSABLE DU TRAITEMENT
${v(d.raisonSociale)}
${v(d.structureType)}
Numéro d'entreprise (BCE) : ${v(d.bceName)}
Siège social : ${v(d.adresse)}
Email de contact : ${v(d.emailRgpd || d.email)}

2. DONNÉES COLLECTÉES
${v(d.donneesCollectees, "Identité, coordonnées, données de compte, données de paiement via prestataire, données de navigation.")}

3. FINALITÉS
${v(d.finalitesTraitement, `- Gérer les demandes et la relation avec les utilisateurs
- Exécuter les contrats de vente et assurer le service après-vente
- Envoyer des informations et offres commerciales (avec consentement)
- Analyser la fréquentation du site
- Respecter les obligations légales`)}

4. BASES JURIDIQUES
- Exécution d'un contrat ou de mesures précontractuelles
- Respect d'obligations légales
- Intérêt légitime du responsable
- Consentement lorsque la loi le requiert

5. DESTINATAIRES
Personnel de ${v(d.raisonSociale)}, prestataires techniques (${v(d.outilsUtilises, "hébergement, emailing, paiement, analytics")}), autorités compétentes lorsque la loi l'impose.

6. TRANSFERTS HORS UE
${v(d.transfertsHorsUE, "Lorsque des transferts ont lieu hors UE/EEE, ils sont encadrés par des garanties appropriées (EU-US Data Privacy Framework, clauses contractuelles types).")}

7. DURÉES DE CONSERVATION
${v(d.dureesConservation, "Selon la catégorie de données : prospects, clients, cookies – conformément aux exigences légales.")}

8. DROITS DES PERSONNES
Conformément au RGPD et au droit belge : accès, rectification, effacement, limitation, opposition, portabilité.
Contact : ${v(d.emailRgpd || d.email)}

9. AUTORITÉ DE CONTRÔLE
Autorité de protection des données (APD) – www.autoriteprotectiondonnees.be

10. SÉCURITÉ
${v(d.raisonSociale)} met en œuvre des mesures techniques et organisationnelles pour protéger les données personnelles.

11. MODIFICATIONS
La présente politique peut être mise à jour. Toute modification importante sera signalée sur le site.`;
}

/* ================================================================== */
/*  LUXEMBOURG                                                         */
/* ================================================================== */

function mentionsLuxembourg(d: LegalFormData): string {
  return `MENTIONS LÉGALES
Dernière mise à jour : ${dateNow()}

ÉDITEUR DU SITE
${v(d.raisonSociale)}
${v(d.structureType)} au capital de ${v(d.capitalSocial)} €
Immatriculée au RCSL sous le numéro ${v(d.rcslNumero)}
Numéro de TVA : ${v(d.tvaLux)}
Siège social : ${v(d.adresse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}
${d.autorisationEtablissement ? `Autorisation d'établissement : ${v(d.autorisationEtablissement)}` : ""}

DIRECTEUR DE LA PUBLICATION
${v(d.responsableName)}, ${v(d.responsableFunction)}.

HÉBERGEMENT
${v(d.hebergeurNom)} – ${v(d.hebergeurAdresse)}
Téléphone : ${v(d.hebergeurTelephone)} – Site : ${v(d.hebergeurUrl)}

PROPRIÉTÉ INTELLECTUELLE
L'ensemble des éléments du site est protégé par les lois applicables en matière de propriété intellectuelle et sont la propriété de ${v(d.raisonSociale)}.

RESPONSABILITÉ
${v(d.raisonSociale)} s'efforce d'assurer l'exactitude des informations mais ne peut en garantir l'exhaustivité.

DONNÉES PERSONNELLES
Le traitement des données personnelles est décrit dans la Politique de confidentialité.
L'autorité de contrôle est la Commission nationale pour la protection des données (CNPD) – www.cnpd.lu.`;
}

function cgvLuxembourg(d: LegalFormData): string {
  return `CONDITIONS GÉNÉRALES DE VENTE
Dernière mise à jour : ${dateNow()}

ARTICLE 1 – OBJET
Les présentes CGV définissent les droits et obligations de ${v(d.raisonSociale)}, société de droit luxembourgeois (le « Vendeur »), et de toute personne effectuant un achat via le site ${v(d.siteUrl)} (le « Client »).

ARTICLE 2 – INFORMATIONS SUR LE VENDEUR
${v(d.raisonSociale)}
${v(d.structureType)} au capital de ${v(d.capitalSocial)} €
RCSL : ${v(d.rcslNumero)} – TVA : ${v(d.tvaLux)}
Siège social : ${v(d.adresse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}

ARTICLE 3 – PRODUITS ET SERVICES
Les produits et services sont décrits sur le site avec leurs caractéristiques essentielles.
Description : ${v(d.produitsDescription)}

ARTICLE 4 – PRIX
Les prix sont indiqués en ${v(d.devise)}, TTC. Le prix applicable est celui en vigueur au moment de la validation de la commande.

ARTICLE 5 – COMMANDE ET CONCLUSION DU CONTRAT
Le contrat est conclu lorsque le Vendeur envoie l'email de confirmation de commande.

ARTICLE 6 – PAIEMENT
Le paiement s'effectue par ${v(d.moyensPaiement)} via ${v(d.prestatairePaiement)}.

ARTICLE 7 – LIVRAISON ET FOURNITURE DES SERVICES
${d.produitsPhysiques ? `Produits physiques : livrés à l'adresse indiquée.
Zones : ${v(d.zonesLivrees)} – Délais : ${v(d.delaisLivraison)} – Frais : ${v(d.fraisLivraison)}
` : ""}Produits et services numériques : accès accordé après confirmation du paiement.

ARTICLE 8 – DROIT DE RÉTRACTATION (CONSOMMATEURS)
Le Client consommateur bénéficie d'un délai de quatorze (14) jours pour exercer son droit de rétractation. Exceptions : contenus numériques dont l'exécution a commencé avec accord préalable, biens personnalisés, services pleinement exécutés.
${d.retractationExclusions ? `Exclusions supplémentaires : ${v(d.retractationExclusions)}` : ""}

ARTICLE 9 – GARANTIES
Les produits bénéficient des garanties légales de conformité et contre les défauts cachés prévues par le droit luxembourgeois.

ARTICLE 10 – PROPRIÉTÉ INTELLECTUELLE
Les contenus sont la propriété exclusive de ${v(d.raisonSociale)}. Le Client obtient un droit d'utilisation personnel, non exclusif et non transférable.

ARTICLE 11 – DONNÉES PERSONNELLES
Le traitement des données est décrit dans la Politique de confidentialité.

ARTICLE 12 – DROIT APPLICABLE
Les présentes CGV sont régies par le droit luxembourgeois.`;
}

function privacyLuxembourg(d: LegalFormData): string {
  return `POLITIQUE DE CONFIDENTIALITÉ
Dernière mise à jour : ${dateNow()}

1. OBJET
La présente politique explique comment ${v(d.raisonSociale)} collecte, utilise et protège les données personnelles, conformément au RGPD et à la législation luxembourgeoise.

2. RESPONSABLE DU TRAITEMENT
${v(d.raisonSociale)}
${v(d.structureType)} – RCSL : ${v(d.rcslNumero)} – TVA : ${v(d.tvaLux)}
Siège social : ${v(d.adresse)}
Courriel : ${v(d.emailRgpd || d.email)}

3. DONNÉES COLLECTÉES
${v(d.donneesCollectees, "Données d'identification, de contact, de compte, de commande, de paiement (via prestataire), de navigation.")}

4. FINALITÉS
${v(d.finalitesTraitement, `- Gestion du site et fourniture des services
- Gestion de la relation contractuelle
- Communications et marketing (avec consentement)
- Analyse et statistiques
- Sécurité et prévention des fraudes
- Obligations légales`)}

5. BASES LÉGALES
Exécution d'un contrat, consentement, intérêt légitime, obligation légale.

6. DESTINATAIRES
Personnel autorisé, prestataires de services (${v(d.outilsUtilises, "hébergement, paiement, emailing, analytics")}), partenaires contractuels, autorités lorsque la loi l'exige.

7. TRANSFERTS HORS UE
${v(d.transfertsHorsUE, "Les transferts hors UE/EEE sont encadrés par des garanties appropriées (EU-US Data Privacy Framework, clauses contractuelles types).")}

8. DURÉE DE CONSERVATION
${v(d.dureesConservation, "Conformément aux durées nécessaires et aux obligations légales.")}

9. VOS DROITS
Accès, rectification, effacement, limitation, opposition, portabilité, retrait du consentement.
Contact : ${v(d.emailRgpd || d.email)}

10. RÉCLAMATION
Commission nationale pour la protection des données (CNPD) – www.cnpd.lu

11. SÉCURITÉ
Mesures techniques et organisationnelles appropriées mises en place.

12. COOKIES
Le site utilise des cookies techniques, analytiques et marketing. Vous pouvez configurer vos préférences via le bandeau cookies.

13. MODIFICATIONS
Cette politique peut être modifiée à tout moment. La date de mise à jour figure en tête du document.`;
}

/* ================================================================== */
/*  SUISSE                                                             */
/* ================================================================== */

function mentionsSuisse(d: LegalFormData): string {
  return `MENTIONS LÉGALES
Dernière mise à jour : ${dateNow()}

ÉDITEUR DU SITE
${v(d.raisonSociale)}
${v(d.structureType)}
Siège social : ${v(d.adresse)}
Numéro IDE : ${v(d.ideNumero)}
Numéro de TVA : ${v(d.tvaSuisse)}
Email : ${v(d.email)} – Téléphone : ${v(d.telephone)}
Responsable du contenu : ${v(d.responsableName)}

HÉBERGEMENT
${v(d.hebergeurNom)} – ${v(d.hebergeurAdresse)} – ${v(d.hebergeurTelephone)} – ${v(d.hebergeurUrl)}

PROPRIÉTÉ INTELLECTUELLE
L'ensemble des éléments du site est protégé par les lois applicables. Toute reproduction sans autorisation est interdite.

RESPONSABILITÉ
${v(d.raisonSociale)} s'efforce d'assurer l'exactitude des informations mais ne peut en garantir l'exhaustivité. L'utilisation du site est sous la responsabilité de l'utilisateur.

DONNÉES PERSONNELLES
Le traitement des données est décrit dans la Déclaration de protection des données. L'autorité compétente est le Préposé fédéral à la protection des données et à la transparence (PFPDT) – www.edoeb.admin.ch.`;
}

function cgvSuisse(d: LegalFormData): string {
  return `CONDITIONS GÉNÉRALES DE VENTE
Dernière mise à jour : ${dateNow()}

1. IDENTITÉ DU VENDEUR
${v(d.raisonSociale)}
${v(d.structureType)}
Siège : ${v(d.adresse)}
IDE : ${v(d.ideNumero)} – TVA : ${v(d.tvaSuisse)}
Téléphone : ${v(d.telephone)} – Email : ${v(d.email)}

2. CHAMP D'APPLICATION
Les présentes CGV s'appliquent à toutes les commandes passées via le site ${v(d.siteUrl)}.

3. PRODUITS ET SERVICES
Description : ${v(d.produitsDescription)}
Les offres sont valables tant qu'elles sont visibles sur le site.

4. PRIX
Les prix sont indiqués en ${v(d.devise, "CHF")}. Le prix applicable est celui affiché au moment de la commande.

5. COMMANDE ET CONCLUSION DU CONTRAT
Le contrat est conclu à la réception de l'email de confirmation par le Client.

6. MODALITÉS DE PAIEMENT
Moyens acceptés : ${v(d.moyensPaiement)}. Paiements sécurisés via ${v(d.prestatairePaiement)}.

7. LIVRAISON ET FOURNITURE
${d.produitsPhysiques ? `Produits physiques : livrés à l'adresse indiquée.
Zones : ${v(d.zonesLivrees)} – Délais : ${v(d.delaisLivraison)} – Frais : ${v(d.fraisLivraison)}
` : ""}Produits et services numériques : accès après validation du paiement.

8. DROIT DE RETOUR
Le droit suisse ne prévoit pas de droit général de rétractation pour les contrats en ligne. Le Vendeur peut toutefois offrir, à titre contractuel, des possibilités de retour ou de remboursement.
${d.politiqueRemboursement ? `Politique de remboursement : ${v(d.politiqueRemboursement)}` : ""}

9. GARANTIE
Les droits du Client en matière de garantie sont régis par le Code des obligations suisse (art. 197 ss CO).

10. RESPONSABILITÉ
La responsabilité du Vendeur est limitée au montant payé pour la commande concernée. Le Vendeur ne garantit pas l'obtention d'un résultat spécifique pour les services de conseil ou formation.

11. PROTECTION DES DONNÉES
Voir la Déclaration de protection des données accessible sur le site.

12. PROPRIÉTÉ INTELLECTUELLE
Tous les contenus sont protégés. Le Client obtient un droit d'utilisation personnel, non exclusif et non transférable.

13. DROIT APPLICABLE ET FOR
Les présentes CGV sont régies par le droit suisse. Le for juridique est fixé au siège du Vendeur.`;
}

function privacySuisse(d: LegalFormData): string {
  return `DÉCLARATION DE PROTECTION DES DONNÉES
Dernière mise à jour : ${dateNow()}

1. INTRODUCTION
La présente déclaration explique comment ${v(d.raisonSociale)} collecte, traite et protège les données personnelles, conformément à la loi fédérale suisse sur la protection des données (LPD / nLPD).

2. RESPONSABLE DU TRAITEMENT
${v(d.raisonSociale)}
${v(d.structureType)}
Siège : ${v(d.adresse)}
IDE : ${v(d.ideNumero)} – TVA : ${v(d.tvaSuisse)}
Courriel : ${v(d.emailRgpd || d.email)}

3. DONNÉES COLLECTÉES
${v(d.donneesCollectees, "Données d'identification, de contact, de compte, de commande, de paiement (via prestataire), de navigation.")}

4. FINALITÉS
${v(d.finalitesTraitement, `- Fourniture du site et de ses fonctionnalités
- Gestion de la relation contractuelle
- Communications et marketing (avec consentement)
- Analyse et amélioration
- Sécurité et prévention des abus
- Obligations légales`)}

5. BASES LÉGALES
Nécessité contractuelle, consentement, intérêt légitime, obligations légales.

6. COMMUNICATION À DES TIERS
Prestataires de services (${v(d.outilsUtilises, "hébergement, paiement, emailing, analytics")}), partenaires contractuels, autorités lorsque la loi l'exige.

7. TRANSFERTS À L'ÉTRANGER
${v(d.transfertsHorsUE, "Certains prestataires peuvent traiter des données hors de Suisse. Des garanties appropriées sont mises en place.")}

8. DURÉE DE CONSERVATION
${v(d.dureesConservation, "Données conservées pour la durée nécessaire aux finalités poursuivies ou selon les exigences légales.")}

9. SÉCURITÉ
Mesures techniques et organisationnelles appropriées.

10. VOS DROITS
Accès, rectification, effacement, limitation, opposition, portabilité.
Contact : ${v(d.emailRgpd || d.email)}

11. RECOURS
Préposé fédéral à la protection des données et à la transparence (PFPDT) – www.edoeb.admin.ch

12. COOKIES
Cookies techniques, analytiques et marketing. Gestion via le bandeau cookies.

13. MODIFICATIONS
Cette déclaration peut être modifiée à tout moment.`;
}

/* ================================================================== */
/*  CANADA                                                             */
/* ================================================================== */

function mentionsCanada(d: LegalFormData): string {
  return `INFORMATIONS LÉGALES
Dernière mise à jour : ${dateNow()}

EXPLOITANT DU SITE
${v(d.raisonSociale)}
${v(d.structureType)}
${d.bnNumero ? `Numéro d'entreprise (BN) : ${v(d.bnNumero)}` : ""}
${d.neqNumero ? `Numéro d'entreprise du Québec (NEQ) : ${v(d.neqNumero)}` : ""}
Adresse : ${v(d.adresse)}
Province : ${v(d.province)}
Courriel : ${v(d.email)} – Téléphone : ${v(d.telephone)}

RESPONSABLE DE L'ÉDITION DU SITE
${v(d.responsableName)}, ${v(d.responsableFunction)}

HÉBERGEMENT
${v(d.hebergeurNom)}
${v(d.hebergeurAdresse)}
Téléphone : ${v(d.hebergeurTelephone)} – Site : ${v(d.hebergeurUrl)}

PROPRIÉTÉ INTELLECTUELLE
Le site ${v(d.siteUrl)} et l'ensemble de son contenu sont protégés par les lois applicables. Toute reproduction sans autorisation écrite préalable est interdite.

UTILISATION DU SITE
L'utilisation du site se fait sous la seule responsabilité de l'utilisateur. ${v(d.raisonSociale)} décline toute responsabilité pour les dommages résultant de l'utilisation du site.

PROTECTION DES RENSEIGNEMENTS PERSONNELS
Les modalités de collecte et de protection des renseignements personnels sont décrites dans notre Politique de confidentialité.
${d.responsableViePrivee ? `Responsable de la protection des renseignements personnels (Loi 25) : ${v(d.responsableViePrivee)}` : ""}
Contact : ${v(d.emailRgpd || d.email)}

DROIT APPLICABLE
Les présentes sont régies par les lois de la province de ${v(d.province)} et les lois fédérales du Canada.`;
}

function cgvCanada(d: LegalFormData): string {
  return `CONDITIONS GÉNÉRALES DE VENTE
Dernière mise à jour : ${dateNow()}

1. OBJET
Les présentes CGV définissent les conditions dans lesquelles ${v(d.raisonSociale)} (le « Vendeur ») fournit des produits et/ou services aux clients via le site ${v(d.siteUrl)}.

2. INFORMATIONS SUR LE VENDEUR
${v(d.raisonSociale)}
${v(d.structureType)}
${d.bnNumero ? `BN : ${v(d.bnNumero)}` : ""}${d.neqNumero ? ` – NEQ : ${v(d.neqNumero)}` : ""}
Adresse : ${v(d.adresse)} – Province : ${v(d.province)}
Courriel : ${v(d.email)} – Téléphone : ${v(d.telephone)}

3. PRODUITS ET SERVICES
Description : ${v(d.produitsDescription)}
Les offres sont valables tant qu'elles sont visibles sur le site.

4. PRIX ET TAXES
Les prix sont indiqués en ${v(d.devise, "CAD")}. Les taxes applicables (TPS, TVQ, TVH) sont calculées en fonction de l'adresse du Client.

5. COMMANDE
Le contrat est conclu à la réception de l'email de confirmation de commande.

6. PAIEMENT
Moyens acceptés : ${v(d.moyensPaiement)}. Paiements sécurisés via ${v(d.prestatairePaiement)}.

7. LIVRAISON ET FOURNITURE
${d.produitsPhysiques ? `Produits physiques : livrés à l'adresse indiquée.
Zones : ${v(d.zonesLivrees)} – Délais : ${v(d.delaisLivraison)} – Frais : ${v(d.fraisLivraison)}
` : ""}Produits et services numériques : accès après validation du paiement.

8. ANNULATION, RETOUR ET REMBOURSEMENT
Il n'existe pas de droit de rétractation harmonisé au niveau fédéral au Canada. Les droits varient selon la province.
${d.politiqueRemboursement ? `Politique de remboursement : ${v(d.politiqueRemboursement)}` : ""}

9. PROPRIÉTÉ INTELLECTUELLE
Tous les contenus sont protégés. Le Client obtient une licence d'utilisation personnelle, non exclusive et non transférable.

10. GARANTIES ET LIMITATION DE RESPONSABILITÉ
Les produits et services sont fournis « tels quels ». La responsabilité du Vendeur est limitée au montant payé par le Client.

11. PROTECTION DES RENSEIGNEMENTS PERSONNELS
Voir notre Politique de confidentialité (PIPEDA${d.province.toLowerCase().includes("québec") || d.province.toLowerCase().includes("quebec") ? " et Loi 25" : ""}).

12. DROIT APPLICABLE
Les présentes CGV sont régies par les lois de la province de ${v(d.province)} et les lois fédérales du Canada.`;
}

function privacyCanada(d: LegalFormData): string {
  const isQuebec = d.province.toLowerCase().includes("québec") || d.province.toLowerCase().includes("quebec");
  return `POLITIQUE DE CONFIDENTIALITÉ ET DE PROTECTION DES RENSEIGNEMENTS PERSONNELS
Dernière mise à jour : ${dateNow()}

1. OBJET
La présente politique explique comment ${v(d.raisonSociale)} collecte, utilise, communique et protège les renseignements personnels, conformément à la LPRPDE (PIPEDA)${isQuebec ? " et à la Loi 25 du Québec" : ""}.

2. RESPONSABLE DES RENSEIGNEMENTS PERSONNELS
${v(d.responsableViePrivee || d.responsableName)}
${v(d.raisonSociale)}
Adresse : ${v(d.adresse)}
Courriel : ${v(d.emailRgpd || d.email)} – Téléphone : ${v(d.telephone)}

3. RENSEIGNEMENTS COLLECTÉS
${v(d.donneesCollectees, "Renseignements d'identification, de contact, de compte, de transaction, de paiement (via prestataire), de navigation.")}

4. FINALITÉS
${v(d.finalitesTraitement, `- Fourniture de nos produits et services
- Gestion de la relation client
- Marketing et communications (avec consentement)
- Analyse et amélioration du site
- Sécurité et prévention de la fraude
- Obligations légales`)}

5. CONSENTEMENT
Nous traitons vos renseignements avec votre consentement (explicite ou implicite). Vous pouvez le retirer à tout moment en nous contactant.

6. COMMUNICATION À DES TIERS
Prestataires de services (${v(d.outilsUtilises, "hébergement, paiement, emailing, analytics")}), partenaires d'affaires, autorités lorsque la loi l'exige.

7. TRANSFERTS HORS CANADA
${v(d.transfertsHorsUE, "Certains prestataires peuvent être situés hors du Canada. Nous prenons des mesures pour assurer une protection adéquate.")}

8. CONSERVATION
${v(d.dureesConservation, "Durée nécessaire aux finalités poursuivies ou selon les exigences légales.")}

9. SÉCURITÉ
Mesures physiques, administratives et techniques appropriées.

10. VOS DROITS
Accès, rectification, retrait du consentement.
Contact : ${v(d.emailRgpd || d.email)}
${isQuebec ? `
11. INCIDENTS DE CONFIDENTIALITÉ (LOI 25)
En cas d'incident de confidentialité, nous évaluons le risque, tenons un registre et notifions la Commission d'accès à l'information du Québec et les personnes concernées si nécessaire.
` : ""}
12. COOKIES
Cookies techniques, analytiques et marketing. Gestion via le bandeau cookies ou les paramètres de votre navigateur.

13. MODIFICATIONS
Cette politique peut être mise à jour à tout moment.

14. CONTACT
${v(d.raisonSociale)}
${v(d.emailRgpd || d.email)} – ${v(d.telephone)}
${v(d.adresse)}`;
}

/* ================================================================== */
/*  DISPATCH                                                           */
/* ================================================================== */

type Generator = (d: LegalFormData) => string;

const GENERATORS: Record<Country, Record<DocType, Generator>> = {
  france:     { mentions: mentionsFrance,     cgv: cgvFrance,     privacy: privacyFrance },
  belgique:   { mentions: mentionsBelgique,   cgv: cgvBelgique,   privacy: privacyBelgique },
  luxembourg: { mentions: mentionsLuxembourg, cgv: cgvLuxembourg, privacy: privacyLuxembourg },
  suisse:     { mentions: mentionsSuisse,     cgv: cgvSuisse,     privacy: privacySuisse },
  canada:     { mentions: mentionsCanada,     cgv: cgvCanada,     privacy: privacyCanada },
};

export function generateDocument(docType: DocType, data: LegalFormData): string {
  const gen = GENERATORS[data.country]?.[docType];
  if (!gen) return "Template non disponible pour ce pays.";
  return gen(data);
}
