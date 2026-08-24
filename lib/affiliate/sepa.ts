// lib/affiliate/sepa.ts
//
// LE FICHIER DE VIREMENTS, AU FORMAT QUE LA BANQUE ATTEND.
//
// Béné, 25 août : export SEPA et virement à la main. Le fichier se
// dépose dans l'interface de sa banque, qui exécute les virements après
// qu'elle a validé. Aucun argent ne bouge sans elle.
//
// -- LE FORMAT, ET POURQUOI CELUI LÀ -----------------------------------
//
// `pain.001.001.03` : le virement SEPA (SCT), version acceptée par
// toutes les banques françaises. Il existe des versions plus récentes
// (`.09`), mais elles ne sont pas universellement acceptées, et un
// fichier refusé au guichet ne se débogue pas : la banque dit "format
// invalide" et rien d'autre.
//
// -- CE QUI FAIT REFUSER UN FICHIER, ET QU'ON A DONC ÉCRIT ICI ---------
//
// 1. **Les identifiants doivent être uniques et stables.** `MsgId` et
//    `PmtInfId` sont dédupliqués par la banque : rejouer un fichier avec
//    le même `MsgId` fait rejeter le second, ce qui est une PROTECTION
//    (on ne paie pas deux fois) mais qui doit être compris. On y met
//    l'identifiant du lot, qui ne change jamais.
// 2. **Les montants sont en unités, avec deux décimales.** Pas de
//    séparateur de milliers, point décimal, jamais de virgule.
// 3. **La somme des lignes doit valoir `CtrlSum` au centime.** C'est le
//    contrôle que fait la banque en premier.
// 4. **Le XML doit être échappé.** Un nom d'affiliée avec `&` ou `<`
//    casse le fichier entier, et le nom vient d'un formulaire.
// 5. **La date d'exécution est un jour OUVRÉ.** Un fichier daté d'un
//    samedi est soit rejeté, soit décalé sans prévenir.
//
// Tout est pur : ça se teste, et c'est de l'argent.

import type { LigneLot } from "@/lib/affiliate/versement";

/** Le compte à débiter, celui de la société. Vient de l'environnement. */
export interface Debiteur {
  nom: string;
  iban: string;
  /** Facultatif depuis 2016 en zone SEPA, mais certaines banques l'exigent. */
  bic?: string | null;
}

/** Échappe ce qui casserait le XML. Le nom vient d'un formulaire. */
export function echapperXml(v: string): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Le nom, réduit à ce que le format accepte.
 *
 * SEPA n'admet qu'un jeu de caractères latins restreint : les accents,
 * les émojis et les caractères exotiques font rejeter le fichier. On les
 * translittère plutôt que de les supprimer ("Bénédicte" doit rester
 * lisible sur le relevé, pas devenir "Bndicte").
 */
export function nomSepa(v: string | null | undefined, max = 70): string {
  const brut = String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const propre = brut.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ").replace(/\s+/g, " ").trim();
  return propre.slice(0, max) || "AFFILIE";
}

/** "17.00" : point décimal, deux décimales, jamais de séparateur. */
export function montantSepa(cents: number): string {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2);
}

/**
 * LE PROCHAIN JOUR OUVRÉ, à partir d'une date.
 *
 * Un fichier daté d'un samedi est rejeté ou décalé en silence. On ne
 * gère PAS les jours fériés : la banque décale d'elle-même d'un férié,
 * alors qu'un week-end la fait souvent refuser. Une liste de fériés
 * serait une chose de plus à tenir à jour chaque année, pour un gain
 * nul.
 */
export function jourOuvre(depuis: Date): string {
  const d = new Date(Date.UTC(depuis.getUTCFullYear(), depuis.getUTCMonth(), depuis.getUTCDate()));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export interface OptionsSepa {
  /** L'identifiant du lot : il rend le fichier non rejouable. */
  lotId: string;
  periode: string;
  debiteur: Debiteur;
  /** Passée en paramètre : un test qui lit l'horloge clignote. */
  maintenant: Date;
}

/**
 * Construit le fichier. Rend `null` s'il n'y a rien à virer, ce qui
 * n'est pas une erreur : un mois sans virement bancaire arrive quand
 * tout le monde a choisi PayPal.
 */
export function construireSepaXml(
  lignes: readonly LigneLot[],
  options: OptionsSepa,
): string | null {
  const virements = lignes.filter((l) => l.methode === "virement");
  if (virements.length === 0) return null;

  const totalCents = virements.reduce((s, l) => s + l.montantCents, 0);
  const horodatage = options.maintenant.toISOString().replace(/\.\d{3}Z$/, "Z");
  const execution = jourOuvre(options.maintenant);
  const msgId = `TIPOTE-${options.lotId}`.slice(0, 35);
  const libelle = nomSepa(`Commissions affiliation ${options.periode}`, 140);

  const transactions = virements
    .map((l, i) => {
      const nom = nomSepa(l.displayName || l.email);
      const bic = l.bic ? `\n            <BIC>${echapperXml(l.bic)}</BIC>` : "";
      return `        <CdtTrfTxInf>
          <PmtId>
            <EndToEndId>${echapperXml(`${options.lotId}-${i + 1}`.slice(0, 35))}</EndToEndId>
          </PmtId>
          <Amt>
            <InstdAmt Ccy="EUR">${montantSepa(l.montantCents)}</InstdAmt>
          </Amt>
          <Cdtr>
            <Nm>${echapperXml(nom)}</Nm>
          </Cdtr>
          <CdtrAcct>
            <Id>
              <IBAN>${echapperXml(l.iban ?? "")}</IBAN>
            </Id>
          </CdtrAcct>${bic ? `\n          <CdtrAgt><FinInstnId>${bic}\n          </FinInstnId></CdtrAgt>` : ""}
          <RmtInf>
            <Ustrd>${echapperXml(libelle)}</Ustrd>
          </RmtInf>
        </CdtTrfTxInf>`;
    })
    .join("\n");

  const bicDebiteur = options.debiteur.bic
    ? `\n        <DbtrAgt><FinInstnId><BIC>${echapperXml(options.debiteur.bic)}</BIC></FinInstnId></DbtrAgt>`
    : "\n        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>";

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${echapperXml(msgId)}</MsgId>
      <CreDtTm>${horodatage}</CreDtTm>
      <NbOfTxs>${virements.length}</NbOfTxs>
      <CtrlSum>${montantSepa(totalCents)}</CtrlSum>
      <InitgPty>
        <Nm>${echapperXml(nomSepa(options.debiteur.nom))}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${echapperXml(msgId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${virements.length}</NbOfTxs>
      <CtrlSum>${montantSepa(totalCents)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${execution}</ReqdExctnDt>
      <Dbtr>
        <Nm>${echapperXml(nomSepa(options.debiteur.nom))}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${echapperXml(options.debiteur.iban)}</IBAN>
        </Id>
      </DbtrAcct>${bicDebiteur}
      <ChrgBr>SLEV</ChrgBr>
${transactions}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

/**
 * LA LISTE PAYPAL, au format que leur envoi groupé attend.
 *
 * PayPal accepte un fichier séparé par des TABULATIONS, une ligne par
 * paiement : adresse, montant, devise, référence, note. C'est le
 * pendant du SEPA pour les affiliées qui ont choisi PayPal, et il se
 * dépose de la même façon : elle valide, PayPal exécute.
 *
 * **Séparé par des tabulations, pas par des virgules.** Un nom ou une
 * note contenant une virgule décalerait toutes les colonnes suivantes,
 * et un montant se retrouverait dans la colonne devise.
 */
export function construirePaypalTsv(
  lignes: readonly LigneLot[],
  periode: string,
  lotId: string,
): string | null {
  const paypal = lignes.filter((l) => l.methode === "paypal");
  if (paypal.length === 0) return null;
  const propre = (v: string) => String(v ?? "").replace(/[\t\r\n]/g, " ").trim();
  return paypal
    .map((l, i) =>
      [
        propre(l.paypalEmail ?? l.email),
        montantSepa(l.montantCents),
        "EUR",
        propre(`${lotId}-${i + 1}`),
        propre(`Commissions affiliation ${periode}`),
      ].join("\t"),
    )
    .join("\n");
}
