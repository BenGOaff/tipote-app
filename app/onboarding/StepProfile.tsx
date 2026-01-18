"use client";

import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ArrowRight } from "lucide-react";
import { OnboardingData } from "./OnboardingFlow";

interface StepProfileProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
}

// ✅ Pas de “Autre”
const niches = [
  { value: "Argent & Business", label: "Argent & Business" },
  { value: "Marketing & Vente", label: "Marketing & Vente" },
  { value: "Carrière & Leadership", label: "Carrière & Leadership" },
  { value: "Santé & Bien-être", label: "Santé & Bien-être" },
  { value: "Nutrition & Sport", label: "Nutrition & Sport" },
  { value: "Développement personnel", label: "Développement personnel" },
  { value: "Parentalité & Famille", label: "Parentalité & Famille" },
  { value: "Relations & Sexualité", label: "Relations & Sexualité" },
  { value: "Créativité & Loisirs", label: "Créativité & Loisirs" },
  { value: "Éducation & Pédagogie", label: "Éducation & Pédagogie" },
  { value: "Spiritualité / Mindfulness", label: "Spiritualité / Mindfulness" },
  { value: "Productivité / Organisation", label: "Productivité / Organisation" },
  { value: "Tech / IA / Outils", label: "Tech / IA / Outils" },
  { value: "Artisanat / Local / Services", label: "Artisanat / Local / Services" },
  { value: "Immobilier / Finance perso", label: "Immobilier / Finance perso" },
];

const NICHES_WITH_SPECIAL = [
  ...niches,
  { value: "__two_domains__", label: "Je suis entre deux domaines" },
] as const;

// ✅ Pays ISO (alpha-2) — label FR.
// (liste complète, sans dépendance, prêt v2 multilangue : on traduira seulement label)
const COUNTRIES: { code: string; label: string }[] = [
  { code: "AF", label: "Afghanistan" },
  { code: "ZA", label: "Afrique du Sud" },
  { code: "AL", label: "Albanie" },
  { code: "DZ", label: "Algérie" },
  { code: "DE", label: "Allemagne" },
  { code: "AD", label: "Andorre" },
  { code: "AO", label: "Angola" },
  { code: "AG", label: "Antigua-et-Barbuda" },
  { code: "SA", label: "Arabie saoudite" },
  { code: "AR", label: "Argentine" },
  { code: "AM", label: "Arménie" },
  { code: "AU", label: "Australie" },
  { code: "AT", label: "Autriche" },
  { code: "AZ", label: "Azerbaïdjan" },
  { code: "BS", label: "Bahamas" },
  { code: "BH", label: "Bahreïn" },
  { code: "BD", label: "Bangladesh" },
  { code: "BB", label: "Barbade" },
  { code: "BE", label: "Belgique" },
  { code: "BZ", label: "Belize" },
  { code: "BJ", label: "Bénin" },
  { code: "BT", label: "Bhoutan" },
  { code: "BY", label: "Biélorussie" },
  { code: "BO", label: "Bolivie" },
  { code: "BA", label: "Bosnie-Herzégovine" },
  { code: "BW", label: "Botswana" },
  { code: "BR", label: "Brésil" },
  { code: "BN", label: "Brunéi" },
  { code: "BG", label: "Bulgarie" },
  { code: "BF", label: "Burkina Faso" },
  { code: "BI", label: "Burundi" },
  { code: "KH", label: "Cambodge" },
  { code: "CM", label: "Cameroun" },
  { code: "CA", label: "Canada" },
  { code: "CV", label: "Cap-Vert" },
  { code: "CL", label: "Chili" },
  { code: "CN", label: "Chine" },
  { code: "CY", label: "Chypre" },
  { code: "CO", label: "Colombie" },
  { code: "KM", label: "Comores" },
  { code: "CG", label: "Congo" },
  { code: "CD", label: "Congo (RDC)" },
  { code: "KR", label: "Corée du Sud" },
  { code: "KP", label: "Corée du Nord" },
  { code: "CR", label: "Costa Rica" },
  { code: "CI", label: "Côte d’Ivoire" },
  { code: "HR", label: "Croatie" },
  { code: "CU", label: "Cuba" },
  { code: "DK", label: "Danemark" },
  { code: "DJ", label: "Djibouti" },
  { code: "DM", label: "Dominique" },
  { code: "EG", label: "Égypte" },
  { code: "AE", label: "Émirats arabes unis" },
  { code: "EC", label: "Équateur" },
  { code: "ER", label: "Érythrée" },
  { code: "ES", label: "Espagne" },
  { code: "EE", label: "Estonie" },
  { code: "US", label: "États-Unis" },
  { code: "ET", label: "Éthiopie" },
  { code: "FJ", label: "Fidji" },
  { code: "FI", label: "Finlande" },
  { code: "FR", label: "France" },
  { code: "GA", label: "Gabon" },
  { code: "GM", label: "Gambie" },
  { code: "GE", label: "Géorgie" },
  { code: "GH", label: "Ghana" },
  { code: "GR", label: "Grèce" },
  { code: "GD", label: "Grenade" },
  { code: "GT", label: "Guatemala" },
  { code: "GN", label: "Guinée" },
  { code: "GQ", label: "Guinée équatoriale" },
  { code: "GW", label: "Guinée-Bissau" },
  { code: "GY", label: "Guyana" },
  { code: "HT", label: "Haïti" },
  { code: "HN", label: "Honduras" },
  { code: "HU", label: "Hongrie" },
  { code: "IN", label: "Inde" },
  { code: "ID", label: "Indonésie" },
  { code: "IQ", label: "Irak" },
  { code: "IR", label: "Iran" },
  { code: "IE", label: "Irlande" },
  { code: "IS", label: "Islande" },
  { code: "IL", label: "Israël" },
  { code: "IT", label: "Italie" },
  { code: "JM", label: "Jamaïque" },
  { code: "JP", label: "Japon" },
  { code: "JO", label: "Jordanie" },
  { code: "KZ", label: "Kazakhstan" },
  { code: "KE", label: "Kenya" },
  { code: "KG", label: "Kirghizistan" },
  { code: "KI", label: "Kiribati" },
  { code: "KW", label: "Koweït" },
  { code: "LA", label: "Laos" },
  { code: "LS", label: "Lesotho" },
  { code: "LV", label: "Lettonie" },
  { code: "LB", label: "Liban" },
  { code: "LR", label: "Liberia" },
  { code: "LY", label: "Libye" },
  { code: "LI", label: "Liechtenstein" },
  { code: "LT", label: "Lituanie" },
  { code: "LU", label: "Luxembourg" },
  { code: "MK", label: "Macédoine du Nord" },
  { code: "MG", label: "Madagascar" },
  { code: "MY", label: "Malaisie" },
  { code: "MW", label: "Malawi" },
  { code: "MV", label: "Maldives" },
  { code: "ML", label: "Mali" },
  { code: "MT", label: "Malte" },
  { code: "MA", label: "Maroc" },
  { code: "MU", label: "Maurice" },
  { code: "MR", label: "Mauritanie" },
  { code: "MX", label: "Mexique" },
  { code: "FM", label: "Micronésie" },
  { code: "MD", label: "Moldavie" },
  { code: "MC", label: "Monaco" },
  { code: "MN", label: "Mongolie" },
  { code: "ME", label: "Monténégro" },
  { code: "MZ", label: "Mozambique" },
  { code: "MM", label: "Myanmar" },
  { code: "NA", label: "Namibie" },
  { code: "NR", label: "Nauru" },
  { code: "NP", label: "Népal" },
  { code: "NI", label: "Nicaragua" },
  { code: "NE", label: "Niger" },
  { code: "NG", label: "Nigeria" },
  { code: "NO", label: "Norvège" },
  { code: "NZ", label: "Nouvelle-Zélande" },
  { code: "OM", label: "Oman" },
  { code: "UG", label: "Ouganda" },
  { code: "UZ", label: "Ouzbékistan" },
  { code: "PK", label: "Pakistan" },
  { code: "PA", label: "Panama" },
  { code: "PG", label: "Papouasie-Nouvelle-Guinée" },
  { code: "PY", label: "Paraguay" },
  { code: "NL", label: "Pays-Bas" },
  { code: "PE", label: "Pérou" },
  { code: "PH", label: "Philippines" },
  { code: "PL", label: "Pologne" },
  { code: "PT", label: "Portugal" },
  { code: "QA", label: "Qatar" },
  { code: "RO", label: "Roumanie" },
  { code: "GB", label: "Royaume-Uni" },
  { code: "RU", label: "Russie" },
  { code: "RW", label: "Rwanda" },
  { code: "KN", label: "Saint-Christophe-et-Niévès" },
  { code: "LC", label: "Sainte-Lucie" },
  { code: "SM", label: "Saint-Marin" },
  { code: "VC", label: "Saint-Vincent-et-les-Grenadines" },
  { code: "SV", label: "Salvador" },
  { code: "WS", label: "Samoa" },
  { code: "ST", label: "Sao Tomé-et-Principe" },
  { code: "SN", label: "Sénégal" },
  { code: "RS", label: "Serbie" },
  { code: "SC", label: "Seychelles" },
  { code: "SL", label: "Sierra Leone" },
  { code: "SG", label: "Singapour" },
  { code: "SK", label: "Slovaquie" },
  { code: "SI", label: "Slovénie" },
  { code: "SO", label: "Somalie" },
  { code: "SD", label: "Soudan" },
  { code: "SS", label: "Soudan du Sud" },
  { code: "LK", label: "Sri Lanka" },
  { code: "SE", label: "Suède" },
  { code: "CH", label: "Suisse" },
  { code: "SR", label: "Suriname" },
  { code: "SY", label: "Syrie" },
  { code: "TJ", label: "Tadjikistan" },
  { code: "TZ", label: "Tanzanie" },
  { code: "TD", label: "Tchad" },
  { code: "CZ", label: "Tchéquie" },
  { code: "TH", label: "Thaïlande" },
  { code: "TL", label: "Timor oriental" },
  { code: "TG", label: "Togo" },
  { code: "TO", label: "Tonga" },
  { code: "TT", label: "Trinité-et-Tobago" },
  { code: "TN", label: "Tunisie" },
  { code: "TM", label: "Turkménistan" },
  { code: "TR", label: "Turquie" },
  { code: "UA", label: "Ukraine" },
  { code: "UY", label: "Uruguay" },
  { code: "VU", label: "Vanuatu" },
  { code: "VE", label: "Venezuela" },
  { code: "VN", label: "Viêt Nam" },
  { code: "YE", label: "Yémen" },
  { code: "ZM", label: "Zambie" },
  { code: "ZW", label: "Zimbabwe" },

  // Territoires fréquents dans tes audiences
  { code: "RE", label: "La Réunion" },
  { code: "GP", label: "Guadeloupe" },
  { code: "MQ", label: "Martinique" },
  { code: "GF", label: "Guyane française" },
  { code: "NC", label: "Nouvelle-Calédonie" },
  { code: "PF", label: "Polynésie française" },
];

function normalizeCountryToISO(countryValue: string): string {
  const raw = (countryValue || "").trim();
  if (!raw) return "";
  // déjà ISO ?
  const upper = raw.toUpperCase();
  if (upper.length === 2 && COUNTRIES.some((c) => c.code === upper)) return upper;

  // ancien stockage en clair ("France", "Belgique"...)
  const found = COUNTRIES.find((c) => c.label.toLowerCase() === raw.toLowerCase());
  return found ? found.code : raw; // fallback safe (ne casse pas si valeur inconnue)
}

function countryLabelFromValue(value: string): string {
  const iso = normalizeCountryToISO(value);
  const found = COUNTRIES.find((c) => c.code === iso);
  return found ? found.label : value;
}

export const StepProfile = ({ data, updateData, onNext }: StepProfileProps) => {
  // ✅ option “entre deux domaines”
  const [twoDomains, setTwoDomains] = useState(false);
  const [nicheA, setNicheA] = useState("");
  const [nicheB, setNicheB] = useState("");

  const countryISO = useMemo(() => normalizeCountryToISO(data.country), [data.country]);

  useEffect(() => {
    // si data.niche est déjà "A / B", on repop
    const raw = (data.niche || "").trim();
    if (raw.includes(" / ")) {
      const [a, b] = raw.split(" / ").map((s) => s.trim());
      if (a && b) {
        setTwoDomains(true);
        setNicheA(a);
        setNicheB(b);
      }
    }
  }, [data.niche]);

  const finalNiche = useMemo(() => {
    if (!twoDomains) return (data.niche || "").trim();
    const a = nicheA.trim();
    const b = nicheB.trim();
    if (!a || !b) return "";
    if (a === b) return a;
    return `${a} / ${b}`;
  }, [twoDomains, nicheA, nicheB, data.niche]);

  const isValid =
    data.firstName.trim() &&
    countryISO.trim() &&
    finalNiche.trim() &&
    data.missionStatement.trim();

  const handleNicheChange = (value: string) => {
    if (value === "__two_domains__") {
      setTwoDomains(true);
      updateData({ niche: "" });
      return;
    }
    setTwoDomains(false);
    setNicheA("");
    setNicheB("");
    updateData({ niche: value });
  };

  // garde la valeur “niche” toujours cohérente pour l’API
  useEffect(() => {
    if (twoDomains) {
      updateData({ niche: finalNiche });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [twoDomains, finalNiche]);

  return (
    <div className="space-y-6">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Toi & ton business</h2>
            <p className="text-muted-foreground">Socle minimal (obligatoire)</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Prénom *</Label>
            <Input
              value={data.firstName}
              onChange={(e) => updateData({ firstName: e.target.value })}
              placeholder="Ton prénom"
            />
          </div>

          <div className="space-y-2">
            <Label>Pays *</Label>
            <Select
              value={countryISO}
              onValueChange={(value) => updateData({ country: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder={data.country ? countryLabelFromValue(data.country) : "Sélectionne ton pays"} />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dans quel domaine exerces-tu ? *</Label>
            <Select value={twoDomains ? "__two_domains__" : data.niche} onValueChange={handleNicheChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionne ton domaine" />
              </SelectTrigger>
              <SelectContent>
                {NICHES_WITH_SPECIAL.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {twoDomains && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="space-y-2">
                  <Label>Domaine principal *</Label>
                  <Select value={nicheA} onValueChange={setNicheA}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisis le principal" />
                    </SelectTrigger>
                    <SelectContent>
                      {niches.map((n) => (
                        <SelectItem key={n.value} value={n.value}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Domaine secondaire *</Label>
                  <Select value={nicheB} onValueChange={setNicheB}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisis le secondaire" />
                    </SelectTrigger>
                    <SelectContent>
                      {niches.map((n) => (
                        <SelectItem key={n.value} value={n.value}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Décris en une phrase : qui aides-tu à faire quoi ? *</Label>
            <Textarea
              value={data.missionStatement}
              onChange={(e) => updateData({ missionStatement: e.target.value })}
              placeholder="Ex : j’aide les plombiers à trouver plus de clients grâce à leur fiche Google My Business."
              className="min-h-[120px]"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuer
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};

export default StepProfile;
