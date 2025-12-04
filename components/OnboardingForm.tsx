// components/OnboardingForm.tsx
// Rôle : formulaire multi-étapes pour l'onboarding Tipote (Q1 → Q8).
// Enregistre les réponses dans /api/onboarding/answers,
// puis déclenche la génération du plan via /api/onboarding/complete.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BusinessProfileRow = {
  first_name: string | null;
  age_range: string | null;
  gender: string | null;
  country: string | null;
  niche: string | null;
  niche_other: string | null;
  mission: string | null;
  business_maturity: string | null;
  offers_status: string | null;
  offers: Array<{
    name: string;
    type: string;
    price: number | null;
    sales: number | null;
  }> | null;
  audience_social: number | null;
  audience_email: number | null;
  time_available: string | null;
  main_goal: string | null;
} | null;

type OnboardingFormProps = {
  initialProfile: BusinessProfileRow;
};

type OfferInput = {
  name: string;
  type: string;
  price: string;
  sales: string;
};

export default function OnboardingForm({ initialProfile }: OnboardingFormProps) {
  const router = useRouter();

  const [step, setStep] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [firstName, setFirstName] = useState(
    initialProfile?.first_name ?? '',
  );
  const [ageRange, setAgeRange] = useState(
    initialProfile?.age_range ?? '',
  );
  const [gender, setGender] = useState(initialProfile?.gender ?? '');
  const [country, setCountry] = useState(initialProfile?.country ?? '');
  const [niche, setNiche] = useState(initialProfile?.niche ?? '');
  const [nicheOther, setNicheOther] = useState(
    initialProfile?.niche_other ?? '',
  );
  const [mission, setMission] = useState(initialProfile?.mission ?? '');
  const [businessMaturity, setBusinessMaturity] = useState(
    initialProfile?.business_maturity ?? '',
  );
  const [offersStatus, setOffersStatus] = useState(
    initialProfile?.offers_status ?? '',
  );

  const initialOffers: OfferInput[] =
    initialProfile?.offers?.map((offer) => ({
      name: offer.name,
      type: offer.type,
      price: offer.price != null ? String(offer.price) : '',
      sales: offer.sales != null ? String(offer.sales) : '',
    })) ?? [];

  const [offers, setOffers] = useState<OfferInput[]>(
    initialOffers.length > 0
      ? initialOffers
      : [
          {
            name: '',
            type: '',
            price: '',
            sales: '',
          },
        ],
  );

  const [audienceSocial, setAudienceSocial] = useState(
    initialProfile?.audience_social != null
      ? String(initialProfile.audience_social)
      : '',
  );
  const [audienceEmail, setAudienceEmail] = useState(
    initialProfile?.audience_email != null
      ? String(initialProfile.audience_email)
      : '',
  );
  const [timeAvailable, setTimeAvailable] = useState(
    initialProfile?.time_available ?? '',
  );
  const [mainGoal, setMainGoal] = useState(
    initialProfile?.main_goal ?? '',
  );

  function goToNextStep() {
    setError(null);
    setSuccessMessage(null);
    setStep((current) => Math.min(current + 1, 4));
  }

  function goToPreviousStep() {
    setError(null);
    setSuccessMessage(null);
    setStep((current) => Math.max(current - 1, 1));
  }

  function updateOffer(index: number, field: keyof OfferInput, value: string) {
    setOffers((current) =>
      current.map((offer, i) =>
        i === index ? { ...offer, [field]: value } : offer,
      ),
    );
  }

  function addOffer() {
    setOffers((current) => [
      ...current,
      { name: '', type: '', price: '', sales: '' },
    ]);
  }

  function removeOffer(index: number) {
    setOffers((current) => current.filter((_, i) => i !== index));
  }

  async function saveAnswers(showToast = true) {
    try {
      setSaving(true);
      setError(null);
      if (showToast) {
        setSuccessMessage(null);
      }

      const parsedOffers = offers
        .filter(
          (offer) =>
            offer.name.trim() !== '' && offer.type.trim() !== '',
        )
        .map((offer) => ({
          name: offer.name.trim(),
          type: offer.type.trim(),
          price:
            offer.price.trim() === '' ? null : Number(offer.price.trim()),
          sales:
            offer.sales.trim() === '' ? null : Number(offer.sales.trim()),
        }));

      const payload = {
        firstName: firstName.trim(),
        ageRange,
        gender,
        country,
        niche,
        nicheOther: niche === 'autre' ? nicheOther.trim() : undefined,
        mission: mission.trim(),
        businessMaturity,
        offersStatus,
        offers: parsedOffers,
        audienceSocial:
          audienceSocial.trim() === ''
            ? null
            : Number(audienceSocial.trim()),
        audienceEmail:
          audienceEmail.trim() === ''
            ? null
            : Number(audienceEmail.trim()),
        timeAvailable,
        mainGoal,
      };

      const response = await fetch('/api/onboarding/answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data?.error ?? 'Erreur lors de la sauvegarde des réponses.';
        throw new Error(message);
      }

      if (showToast) {
        setSuccessMessage('Réponses sauvegardées.');
      }
    } catch (err) {
      console.error('[OnboardingForm] saveAnswers error', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur inattendue pendant la sauvegarde.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePlan(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    try {
      setGenerating(true);

      // 1) Toujours sauvegarder les réponses avant la génération
      await saveAnswers(false);

      // 2) Appel backend pour générer le plan
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data?.error ??
          'Erreur lors de la génération du plan stratégique.';
        throw new Error(message);
      }

      setSuccessMessage(
        'Plan stratégique généré avec succès. Redirection vers le dashboard...',
      );

      // 3) Redirection vers le dashboard
      router.push('/app');
      router.refresh();
    } catch (err) {
      console.error('[OnboardingForm] handleGeneratePlan error', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur inattendue pendant la génération du plan.',
      );
    } finally {
      setGenerating(false);
    }
  }

  const disableForm = saving || generating;

  return (
    <form
      onSubmit={handleGeneratePlan}
      className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      {/* Indicateur d'étapes */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Étape {step} sur 4
          </p>
          <h2 className="text-sm font-semibold text-slate-900">
            {step === 1 && 'Ton identité'}
            {step === 2 && 'Ta niche et ta mission'}
            {step === 3 && 'Maturité, offres et audience'}
            {step === 4 && 'Temps disponible et objectif 90 jours'}
          </h2>
        </div>
        <div className="flex h-2 w-32 overflow-hidden rounded-full bg-slate-100">
          <div
            className="rounded-full bg-slate-900 transition-all"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Messages système */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}

      {/* Étape 1 : Q1 — Identité */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Comment tu t&apos;appelles ? (Prénom)
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={disableForm}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Tranche d&apos;âge
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                disabled={disableForm}
              >
                <option value="">Sélectionne...</option>
                <option value="18-24">18-24</option>
                <option value="25-34">25-34</option>
                <option value="35-44">35-44</option>
                <option value="45-54">45-54</option>
                <option value="55+">55+</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Genre
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                disabled={disableForm}
              >
                <option value="">Sélectionne...</option>
                <option value="feminin">Féminin</option>
                <option value="masculin">Masculin</option>
                <option value="non_genre">Non genré</option>
                <option value="no_answer">Préfère ne pas répondre</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Pays
            </label>
            <input
              type="text"
              placeholder="France, Belgique, Canada..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={disableForm}
            />
          </div>
        </div>
      )}

      {/* Étape 2 : Q2 — Niche, Q3 — Mission */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Dans quel domaine veux-tu aider les gens ? (Niche)
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              disabled={disableForm}
            >
              <option value="">Sélectionne...</option>
              <option value="argent">
                Argent (e-commerce, affiliation, freelance, services...)
              </option>
              <option value="sante_bien_etre">
                Santé / Bien-être (coaching, paramédical, hypnose...)
              </option>
              <option value="developpement_perso">
                Développement personnel (productivité, reconversion pro...)
              </option>
              <option value="relations">
                Relations (famille, dating, parentalité...)
              </option>
              <option value="autre">Autre</option>
            </select>
          </div>

          {niche === 'autre' && (
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Précise ta niche
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={nicheOther}
                onChange={(e) => setNicheOther(e.target.value)}
                disabled={disableForm}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Décris en une phrase : qui veux-tu aider à faire quoi, et comment ?
            </label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              placeholder={`Exemple : "J'aide les mamans débordées à s'organiser grâce à des routines simples."`}
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              disabled={disableForm}
            />
            <p className="mt-1 text-xs text-slate-500">
              Tipote utilisera cette phrase pour générer ton persona client
              idéal.
            </p>
          </div>
        </div>
      )}

      {/* Étape 3 : Q4 — Maturité, Q5 — Offres, Q6 — Audience */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Où en es-tu aujourd&apos;hui ? (Maturité business)
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={businessMaturity}
              onChange={(e) => setBusinessMaturity(e.target.value)}
              disabled={disableForm}
            >
              <option value="">Sélectionne...</option>
              <option value="not_launched">Je n&apos;ai pas encore lancé</option>
              <option value="launched_no_sales">
                J&apos;ai lancé mais pas encore vendu
              </option>
              <option value="lt_500">Je fais moins de 500€/mois</option>
              <option value="500_2000">
                Je fais entre 500€ et 2000€/mois
              </option>
              <option value="gt_2000">Je fais plus de 2000€/mois</option>
            </select>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                As-tu déjà des offres à vendre ?
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={offersStatus}
                onChange={(e) => setOffersStatus(e.target.value)}
                disabled={disableForm}
              >
                <option value="">Sélectionne...</option>
                <option value="none">Non, aucune</option>
                <option value="lead_magnet">
                  Oui, un lead magnet (gratuit)
                </option>
                <option value="one_paid">Oui, une offre payante</option>
                <option value="multiple_paid">
                  Oui, plusieurs offres
                </option>
              </select>
            </div>

            {(offersStatus === 'lead_magnet' ||
              offersStatus === 'one_paid' ||
              offersStatus === 'multiple_paid') && (
              <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-700">
                  Détail de tes offres (optionnel mais très utile pour un plan
                  précis)
                </p>

                {offers.map((offer, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded-md border border-slate-200 bg-white p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Nom de l&apos;offre
                        </label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={offer.name}
                          onChange={(e) =>
                            updateOffer(index, 'name', e.target.value)
                          }
                          disabled={disableForm}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Type (ebook, formation, coaching...)
                        </label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={offer.type}
                          onChange={(e) =>
                            updateOffer(index, 'type', e.target.value)
                          }
                          disabled={disableForm}
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Prix (en €)
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={offer.price}
                          onChange={(e) =>
                            updateOffer(index, 'price', e.target.value)
                          }
                          disabled={disableForm}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-700">
                          Nombre de ventes
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={offer.sales}
                          onChange={(e) =>
                            updateOffer(index, 'sales', e.target.value)
                          }
                          disabled={disableForm}
                        />
                      </div>
                    </div>
                    {offers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOffer(index)}
                        className="text-[11px] font-medium text-red-600 hover:underline"
                        disabled={disableForm}
                      >
                        Supprimer cette offre
                      </button>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addOffer}
                  className="text-[11px] font-medium text-slate-700 hover:underline"
                  disabled={disableForm}
                >
                  + Ajouter une offre
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Abonnés réseaux sociaux (approx.)
              </label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={audienceSocial}
                onChange={(e) => setAudienceSocial(e.target.value)}
                disabled={disableForm}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Emails dans ta liste (approx.)
              </label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={audienceEmail}
                onChange={(e) => setAudienceEmail(e.target.value)}
                disabled={disableForm}
              />
            </div>
          </div>
        </div>
      )}

      {/* Étape 4 : Q7 — Temps dispo, Q8 — Objectif principal */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Combien de temps peux-tu consacrer à ton business par semaine ?
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={timeAvailable}
              onChange={(e) => setTimeAvailable(e.target.value)}
              disabled={disableForm}
            >
              <option value="">Sélectionne...</option>
              <option value="lt_5h">Moins de 5h</option>
              <option value="5_10h">5 à 10h</option>
              <option value="10_20h">10 à 20h</option>
              <option value="gt_20h">Plus de 20h</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Quel est ton objectif prioritaire pour les 90 prochains jours ?
            </label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={mainGoal}
              onChange={(e) => setMainGoal(e.target.value)}
              disabled={disableForm}
            >
              <option value="">Sélectionne...</option>
              <option value="create_first_offer">
                Créer ma première offre
              </option>
              <option value="build_audience">
                Construire mon audience
              </option>
              <option value="first_sales">
                Faire mes premières ventes
              </option>
              <option value="increase_revenue">
                Augmenter mon CA existant
              </option>
              <option value="save_time">
                Automatiser pour gagner du temps
              </option>
            </select>
          </div>

          <p className="text-xs text-slate-500">
            Ton plan d&apos;action 30/90 jours sera entièrement basé sur cette
            réponse, ta maturité business et ton temps disponible.
          </p>
        </div>
      )}

      {/* Footer : navigation + actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={goToPreviousStep}
          disabled={step === 1 || disableForm}
          className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Précédent
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveAnswers(true)}
            disabled={disableForm}
            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={goToNextStep}
              disabled={disableForm}
              className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continuer
            </button>
          ) : (
            <button
              type="submit"
              disabled={disableForm}
              className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating
                ? 'Génération en cours...'
                : 'Générer mon plan stratégique'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
