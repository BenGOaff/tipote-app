// app/onboarding/OnboardingForm.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Offer = {
  name: string;
  type: string;
  price: number | null;
  sales: number | null;
};

type FormData = {
  // Identité
  firstName: string;
  ageRange: string;
  gender: string;
  country: string;

  // Niche & mission
  niche: string;
  nicheOther: string;
  mission: string;

  // Situation actuelle
  businessMaturity: string;
  offersStatus: string;
  offers: Offer[];
  audienceSocial: string;
  audienceEmail: string;
  timeAvailable: string;
  mainGoal: string;

  // Zone de génie
  energySources: string;
  uniqueValue: string;
  untappedStrength: string;
  communicationStyle: string;

  // Mindset & ambitions
  successDefinition: string;
  sixMonthVision: string;
  innerDialogue: string;
  ifCertainSuccess: string;
  biggestFears: string;

  // Défis & ressources
  biggestChallenge: string;
  workingStrategies: string;
  recentClientFeedback: string;
  preferredContentType: string;
};

const AGE_RANGES = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55+",
];

const GENDERS = [
  "feminin",
  "masculin",
  "non_genre",
  "prefere_ne_pas_repondre",
];

const NICHES = [
  "argent",
  "sante_bien_etre",
  "developpement_personnel",
  "relations",
  "autre",
];

const BUSINESS_MATURITY = [
  "not_launched",
  "launched_no_sales",
  "lt_500",
  "500_2000",
  "gt_2000",
];

const OFFERS_STATUS = [
  "none",
  "lead_magnet",
  "one_offer",
  "multiple_offers",
];

const TIME_AVAILABLE = [
  "lt_5h",
  "5_10h",
  "10_20h",
  "gt_20h",
];

const MAIN_GOALS = [
  "create_first_offer",
  "build_audience",
  "first_sales",
  "increase_revenue",
  "automate",
];

const PREFERRED_CONTENT_TYPES = [
  "ecrit",
  "video",
  "audio",
  "mix",
];

const initialFormData: FormData = {
  firstName: "",
  ageRange: "",
  gender: "",
  country: "",

  niche: "",
  nicheOther: "",
  mission: "",

  businessMaturity: "",
  offersStatus: "",
  offers: [],
  audienceSocial: "",
  audienceEmail: "",
  timeAvailable: "",
  mainGoal: "",

  energySources: "",
  uniqueValue: "",
  untappedStrength: "",
  communicationStyle: "",

  successDefinition: "",
  sixMonthVision: "",
  innerDialogue: "",
  ifCertainSuccess: "",
  biggestFears: "",

  biggestChallenge: "",
  workingStrategies: "",
  recentClientFeedback: "",
  preferredContentType: "",
};

export default function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0..5
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les réponses existantes si elles existent
  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/onboarding/answers");
        if (!res.ok) {
          // si 401 → redirection vers login ailleurs
          console.warn("Failed to fetch onboarding answers", await res.text());
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (json?.profile) {
          const p = json.profile;

          setFormData((prev) => ({
            ...prev,
            firstName: p.first_name ?? "",
            ageRange: p.age_range ?? "",
            gender: p.gender ?? "",
            country: p.country ?? "",
            niche: p.niche ?? "",
            nicheOther: p.niche_other ?? "",
            mission: p.mission ?? "",
            businessMaturity: p.business_maturity ?? "",
            offersStatus: p.offers_status ?? "",
            offers: p.offers ?? [],
            audienceSocial: p.audience_social?.toString() ?? "",
            audienceEmail: p.audience_email?.toString() ?? "",
            timeAvailable: p.time_available ?? "",
            mainGoal: p.main_goal ?? "",
            energySources: p.energy_sources ?? "",
            uniqueValue: p.unique_value ?? "",
            untappedStrength: p.untapped_strength ?? "",
            communicationStyle: p.communication_style ?? "",
            successDefinition: p.success_definition ?? "",
            sixMonthVision: p.six_month_vision ?? "",
            innerDialogue: p.inner_dialogue ?? "",
            ifCertainSuccess: p.if_certain_success ?? "",
            biggestFears: p.biggest_fears ?? "",
            biggestChallenge: p.biggest_challenge ?? "",
            workingStrategies: p.working_strategies ?? "",
            recentClientFeedback: p.recent_client_feedback ?? "",
            preferredContentType: p.preferred_content_type ?? "",
          }));
        }
      } catch (e) {
        console.error("Error loading onboarding profile", e);
        setError("Impossible de charger tes réponses. Réessaie dans un instant.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateStep = (): boolean => {
    setError(null);
    const requiredFieldsByStep: (keyof FormData)[][] = [
      // Step 0: Identité
      ["firstName", "ageRange", "gender", "country"],
      // Step 1: Niche & mission
      ["niche", "mission"],
      // Step 2: Situation actuelle
      [
        "businessMaturity",
        "offersStatus",
        "timeAvailable",
        "mainGoal",
      ],
      // Step 3: Zone de génie
      ["energySources", "uniqueValue", "untappedStrength", "communicationStyle"],
      // Step 4: Mindset & ambitions
      [
        "successDefinition",
        "sixMonthVision",
        "innerDialogue",
        "ifCertainSuccess",
        "biggestFears",
      ],
      // Step 5: Défis & ressources
      [
        "biggestChallenge",
        "workingStrategies",
        "recentClientFeedback",
        "preferredContentType",
      ],
    ];

    const required = requiredFieldsByStep[step] ?? [];
    const missing = required.filter((field) => {
      const v = formData[field];
      return typeof v === "string" ? v.trim() === "" : v == null;
    });

    if (missing.length > 0) {
      setError("Merci de répondre à toutes les questions de cette étape avant de continuer.");
      return false;
    }

    if (step === 1 && formData.niche === "autre" && formData.nicheOther.trim() === "") {
      setError("Merci de préciser ta niche dans le champ prévu.");
      return false;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;

    try {
      setSubmitting(true);
      setError(null);

      const payload: FormData = {
        ...formData,
        audienceSocial: formData.audienceSocial.trim(),
        audienceEmail: formData.audienceEmail.trim(),
      };

      const res = await fetch("/api/onboarding/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.error("Error saving onboarding answers", await res.text());
        setError("Impossible de sauvegarder tes réponses. Réessaie dans un instant.");
        setSubmitting(false);
        return;
      }

      // Générer le plan stratégique
      const planRes = await fetch("/api/onboarding/complete", {
        method: "POST",
      });

      if (!planRes.ok) {
        console.error("Error generating strategic plan", await planRes.text());
        setError(
          "Tes réponses sont enregistrées, mais la génération du plan a échoué. Tu pourras réessayer plus tard depuis ton tableau de bord."
        );
        setSubmitting(false);
        return;
      }

      router.push("/app");
    } catch (e) {
      console.error("Unexpected error during onboarding submit", e);
      setError("Une erreur inattendue s'est produite. Réessaie dans un instant.");
      setSubmitting(false);
    }
  };

  const renderStepTitle = () => {
    switch (step) {
      case 0:
        return "Apprenons à te connaître";
      case 1:
        return "Clarifions ta niche et ta mission";
      case 2:
        return "Faisons le point sur ta situation actuelle";
      case 3:
        return "Ta zone de génie";
      case 4:
        return "Ton mindset & tes ambitions";
      case 5:
        return "Tes défis & tes ressources";
      default:
        return "";
    }
  };

  const renderStepDescription = () => {
    switch (step) {
      case 0:
        return "Ces infos permettent à Tipote de parler ton langage et d'adapter le ton des recommandations.";
      case 1:
        return "Plus ta niche et ta mission sont claires, plus les contenus et offres proposés seront précis.";
      case 2:
        return "On calibre le plan d'action en fonction de là où tu en es vraiment aujourd'hui.";
      case 3:
        return "On veut que Tipote s'appuie sur ce qui te donne de l'énergie, pas l'inverse.";
      case 4:
        return "Le mindset et la vision impactent directement le rythme, le ton et les priorités du plan.";
      case 5:
        return "Ces éléments aident Tipote à t'aider exactement là où ça bloque vraiment.";
      default:
        return "";
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                Comment tu t&apos;appelles ? <span className="text-rose-400">*</span>
              </label>
              <input
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                placeholder="Ex : Béné"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Tranche d&apos;âge <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.ageRange}
                  onChange={(e) => updateField("ageRange", e.target.value)}
                >
                  <option value="">Sélectionne</option>
                  {AGE_RANGES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Genre <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.gender}
                  onChange={(e) => updateField("gender", e.target.value)}
                >
                  <option value="">Sélectionne</option>
                  <option value="feminin">Féminin</option>
                  <option value="masculin">Masculin</option>
                  <option value="non_genre">Non genré</option>
                  <option value="prefere_ne_pas_repondre">
                    Préfère ne pas répondre
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Pays <span className="text-rose-400">*</span>
                </label>
                <input
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.country}
                  onChange={(e) => updateField("country", e.target.value)}
                  placeholder="Ex : France, Belgique, Canada..."
                />
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                Dans quel grand domaine tu aides les gens ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <select
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.niche}
                onChange={(e) => updateField("niche", e.target.value)}
              >
                <option value="">Sélectionne</option>
                <option value="argent">Argent / Business</option>
                <option value="sante_bien_etre">Santé / Bien-être</option>
                <option value="developpement_personnel">
                  Développement personnel
                </option>
                <option value="relations">Relations</option>
                <option value="autre">Autre</option>
              </select>
              {formData.niche === "autre" && (
                <input
                  className="mt-2 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.nicheOther}
                  onChange={(e) => updateField("nicheOther", e.target.value)}
                  placeholder="Précise ta niche"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Décris en une phrase : qui tu aides à faire quoi, et comment ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.mission}
                onChange={(e) => updateField("mission", e.target.value)}
                placeholder="Ex : J'aide les mamans débordées à s'organiser grâce à des routines simples."
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                Où en es-tu aujourd&apos;hui avec ton business ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <select
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.businessMaturity}
                onChange={(e) =>
                  updateField("businessMaturity", e.target.value)
                }
              >
                <option value="">Sélectionne</option>
                <option value="not_launched">Je n&apos;ai pas encore lancé</option>
                <option value="launched_no_sales">
                  J&apos;ai lancé mais pas encore vendu
                </option>
                <option value="lt_500">Je fais moins de 500€/mois</option>
                <option value="500_2000">Entre 500€ et 2000€/mois</option>
                <option value="gt_2000">Plus de 2000€/mois</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                As-tu déjà des offres à vendre ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <select
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.offersStatus}
                onChange={(e) => updateField("offersStatus", e.target.value)}
              >
                <option value="">Sélectionne</option>
                <option value="none">Non, aucune</option>
                <option value="lead_magnet">Oui, un lead magnet</option>
                <option value="one_offer">Oui, une offre payante</option>
                <option value="multiple_offers">Oui, plusieurs offres</option>
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Tu pourras détailler plus précisément tes offres dans Tipote
                ensuite.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Abonnés réseaux sociaux (estimation){" "}
                </label>
                <input
                  type="number"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.audienceSocial}
                  onChange={(e) =>
                    updateField("audienceSocial", e.target.value)
                  }
                  placeholder="Ex : 2500"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Emails dans ta liste{" "}
                </label>
                <input
                  type="number"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.audienceEmail}
                  onChange={(e) =>
                    updateField("audienceEmail", e.target.value)
                  }
                  placeholder="Ex : 450"
                  min={0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Temps dispo / semaine pour ton business{" "}
                  <span className="text-rose-400">*</span>
                </label>
                <select
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                  value={formData.timeAvailable}
                  onChange={(e) => updateField("timeAvailable", e.target.value)}
                >
                  <option value="">Sélectionne</option>
                  <option value="lt_5h">Moins de 5h</option>
                  <option value="5_10h">5 à 10h</option>
                  <option value="10_20h">10 à 20h</option>
                  <option value="gt_20h">Plus de 20h</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Objectif principal pour les 90 prochains jours{" "}
                <span className="text-rose-400">*</span>
              </label>
              <select
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.mainGoal}
                onChange={(e) => updateField("mainGoal", e.target.value)}
              >
                <option value="">Sélectionne</option>
                <option value="create_first_offer">
                  Créer ma première offre
                </option>
                <option value="build_audience">Construire mon audience</option>
                <option value="first_sales">Faire mes premières ventes</option>
                <option value="increase_revenue">
                  Augmenter mon CA existant
                </option>
                <option value="automate">
                  Automatiser pour gagner du temps
                </option>
              </select>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                Qu&apos;est-ce qui te donne le plus d&apos;énergie dans ton
                business ? <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.energySources}
                onChange={(e) =>
                  updateField("energySources", e.target.value)
                }
                placeholder="Ex : créer du contenu, coacher en 1:1, animer des lives, designer des offres..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quelle valeur unique apportes-tu à tes clients, par rapport à
                la concurrence ? <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.uniqueValue}
                onChange={(e) => updateField("uniqueValue", e.target.value)}
                placeholder="Ex : vulgariser des sujets complexes, ton côté cash mais bienveillant, ton expérience personnelle..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quelle est ta plus grande force aujourd&apos;hui, que tu
                n&apos;exploitres pas encore assez ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.untappedStrength}
                onChange={(e) =>
                  updateField("untappedStrength", e.target.value)
                }
                placeholder="Ex : parler en public, raconter des histoires, créer des systèmes, enseigner..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Comment décrirais-tu ton style de communication ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[70px]"
                value={formData.communicationStyle}
                onChange={(e) =>
                  updateField("communicationStyle", e.target.value)
                }
                placeholder="Ex : direct, doux, fun, provocant, très pédagogique, introspectif..."
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                C&apos;est quoi, pour toi, la réussite dans ton business ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.successDefinition}
                onChange={(e) =>
                  updateField("successDefinition", e.target.value)
                }
                placeholder="Ex : vivre confortablement de mon activité, avoir du temps pour ma famille, me sentir utile..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                À quoi ressembleraient des résultats satisfaisants dans{" "}
                <strong>6 mois</strong> ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.sixMonthVision}
                onChange={(e) =>
                  updateField("sixMonthVision", e.target.value)
                }
                placeholder="Ex : une offre vendue régulièrement, X€ de CA/mois, une audience engagée..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quand ça devient difficile dans ton business, qu&apos;est-ce
                que tu te dis intérieurement ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.innerDialogue}
                onChange={(e) =>
                  updateField("innerDialogue", e.target.value)
                }
                placeholder="Ex : je ne suis pas légitime, personne ne va acheter, je suis en retard par rapport aux autres..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Si tu étais certain·e de réussir, quelles 3 actions lancerais-tu
                dès maintenant ? <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.ifCertainSuccess}
                onChange={(e) =>
                  updateField("ifCertainSuccess", e.target.value)
                }
                placeholder="Ex : lancer enfin ton offre principale, contacter des partenaires, poster tous les jours..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Qu&apos;est-ce qui te fait le plus peur aujourd&apos;hui par
                rapport à ton business ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.biggestFears}
                onChange={(e) => updateField("biggestFears", e.target.value)}
                placeholder="Ex : me montrer, échouer publiquement, investir du temps/argent pour rien..."
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">
                Quel est ton plus grand défi concret en ce moment ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.biggestChallenge}
                onChange={(e) =>
                  updateField("biggestChallenge", e.target.value)
                }
                placeholder="Ex : générer des leads, convertir, créer une offre claire, tenir le rythme de création..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quelles stratégies marketing fonctionnent déjà plutôt bien pour
                toi ? <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.workingStrategies}
                onChange={(e) =>
                  updateField("workingStrategies", e.target.value)
                }
                placeholder="Ex : stories Instagram, bouche-à-oreille, masterclass, email, challenges..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Quels retours clients as-tu reçus récemment ?{" "}
                <span className="text-rose-400">*</span>
              </label>
              <textarea
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm min-h-[90px]"
                value={formData.recentClientFeedback}
                onChange={(e) =>
                  updateField("recentClientFeedback", e.target.value)
                }
                placeholder="Ex : phrases qu'ils t'ont dites par mail, DM, vocal, témoignages..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Tu préfères créer du contenu plutôt{" "}
                <span className="text-rose-400">*</span>
              </label>
              <select
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm"
                value={formData.preferredContentType}
                onChange={(e) =>
                  updateField("preferredContentType", e.target.value)
                }
              >
                <option value="">Sélectionne</option>
                <option value="ecrit">Écrit (posts, emails, articles)</option>
                <option value="video">Vidéo (reels, live, YouTube)</option>
                <option value="audio">Audio (podcast, messages vocaux)</option>
                <option value="mix">Un mix des deux</option>
              </select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <p className="text-sm text-slate-300">
          Chargement de ton onboarding en cours...
        </p>
      </div>
    );
  }

  const isLastStep = step === 5;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl shadow-xl p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Onboarding Tipote
          </p>
          <h1 className="text-xl md:text-2xl font-semibold mt-1">
            {renderStepTitle()}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {renderStepDescription()}
          </p>
        </div>
        <div className="text-xs text-slate-400">
          Étape <span className="font-semibold">{step + 1}</span> / 6
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-rose-500 transition-all"
            style={{ width: `${((step + 1) / 6) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-6">{renderStep()}</div>

      {error && (
        <div className="mt-6 rounded-lg border border-rose-500/60 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0 || submitting}
          className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
        >
          Retour
        </button>

        <button
          type="button"
          onClick={isLastStep ? handleSubmit : handleNext}
          disabled={submitting}
          className="inline-flex items-center justify-center text-sm px-5 py-2.5 rounded-lg bg-rose-500 text-white font-medium hover:bg-rose-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? "Génération de ton plan en cours..."
            : isLastStep
            ? "Valider et générer mon plan"
            : "Continuer"}
        </button>
      </div>
    </div>
  );
}
