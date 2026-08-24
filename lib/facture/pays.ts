// lib/facture/pays.ts
//
// LA LISTE DES PAYS, EN CODES, ET RIEN QUE LES CODES.
//
// Les NOMS ne sont pas écrits ici : `Intl.DisplayNames` les rend dans la
// langue de la personne, et une liste de noms écrite à la main serait
// une huitième traduction à tenir à jour, avec le même défaut que
// toujours (celui qui manque est toujours celui du client).
//
// L'ordre d'affichage met l'Union en premier parce que c'est là que sont
// les clients de Béné et parce que c'est l'Union qui décide de la TVA.
// Le reste suit, trié par nom dans la langue du visiteur.

import { PAYS_UE } from "@/lib/facture/tva";

/** ISO 3166-1 alpha-2. La liste courante des pays et territoires servis. */
export const CODES_PAYS: readonly string[] = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR",
  "BS","BT","BW","BY","BZ","CA","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GT","GU","GW","GY","HK","HN",
  "HR","HT","HU","ID","IE","IL","IM","IN","IQ","IR","IS","IT","JE","JM","JO",
  "JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH",
  "MK","ML","MM","MN","MO","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF",
  "PG","PH","PK","PL","PM","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU",
  "RW","SA","SB","SC","SD","SE","SG","SI","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TG","TH","TJ","TL","TM","TN","TO","TR",
  "TT","TV","TW","TZ","UA","UG","US","UY","UZ","VA","VC","VE","VG","VI","VN",
  "VU","WF","WS","YE","YT","ZA","ZM","ZW",
];

export interface OptionPays {
  code: string;
  nom: string;
  /** Les pays de l'Union, groupés en tête : ce sont eux qui portent la TVA. */
  union: boolean;
}

/** La liste prête pour un `<select>`, dans la langue demandée. */
export function optionsPays(locale = "fr"): OptionPays[] {
  let nommer: (c: string) => string;
  try {
    const dn = new Intl.DisplayNames([locale], { type: "region" });
    nommer = (c) => dn.of(c) ?? c;
  } catch {
    nommer = (c) => c;
  }
  const collator = new Intl.Collator(locale);
  const union = new Set(PAYS_UE);
  const toutes = CODES_PAYS.map((code) => ({ code, nom: nommer(code), union: union.has(code) }));
  const dans = toutes.filter((p) => p.union).sort((a, b) => collator.compare(a.nom, b.nom));
  const hors = toutes.filter((p) => !p.union).sort((a, b) => collator.compare(a.nom, b.nom));
  return [...dans, ...hors];
}
