// app/affiliate/i18n/types.ts
//
// Type des traductions de l'espace affilié. Toutes les locales doivent
// implémenter cette structure complète (TypeScript force la cohérence
// au compile time → impossible d'oublier une clé dans une langue).
//
// Pour ajouter une nouvelle string :
//   1. Ajoute la clé dans ce type
//   2. Ajoute la traduction dans chaque locale (fr.ts, en.ts, ...)
//   3. Le compileur t'engueule si tu en oublies une

export type AffiliateDict = {
  // ─── Common (réutilisé partout) ──────────────────────────────────
  common: {
    copy: string;
    copied: string;
    save: string;
    saving: string;
    cancel: string;
    next: string;
    back: string;
    skip: string;
    close: string;
    learn_more: string;
    coming_soon: string;
    optional: string;
    days: string; // pluralisable via Intl
    day_singular: string;
    just_now: string;
  };

  // ─── Layout ──────────────────────────────────────────────────────
  layout: {
    page_title: string;
    page_description: string;
    space_subtitle: string; // "Espace affiliation"
    copyright: string; // "© {year} Tipote — Programme d'affiliation"
  };

  // ─── Navigation ──────────────────────────────────────────────────
  nav: {
    overview: string;
    promouvoir: string;
    trial: string;
    revenus: string;
    paiement: string;
    support: string;
    logout: string;
  };

  // ─── Login ───────────────────────────────────────────────────────
  login: {
    title_password: string;
    title_magic: string;
    description_password: string;
    description_magic: string;
    banner_not_affiliate: string;
    label_email: string;
    label_password: string;
    placeholder_email: string;
    forgot_password: string;
    show_password: string;
    hide_password: string;
    signing_in: string;
    sign_in: string;
    switch_to_magic: string;
    switch_to_password: string;
    magic_link_info: string;
    sending_magic_link: string;
    send_magic_link: string;
    magic_link_sent: string;
    no_account: string;
    discover_program: string;
    err_fill_credentials: string;
    err_invalid_credentials: string;
    err_fill_email: string;
    err_rate_limit: string;
    err_send_failed: string;
    err_not_affiliate: string;
    err_generic: string;
    err_network: string;
  };

  // ─── Signup (activation) ─────────────────────────────────────────
  signup: {
    title: string;
    description: string;
    success_title: string;
    success_with_password: string; // "Tu peux te connecter avec ton email {email} et ton mot de passe."
    success_with_magic_link: string; // "On t'a envoyé un lien à {email}..."
    go_to_login: string;
    label_email: string;
    label_email_hint: string;
    label_display_name: string;
    label_display_name_hint: string;
    placeholder_display_name: string;
    label_sa: string;
    label_sa_hint: string;
    label_locale: string;
    label_locale_hint: string;
    label_password: string;
    label_password_hint: string;
    placeholder_password: string;
    activate: string;
    activating: string;
    info_bottom: string;
    err_invalid_sa: string;
    err_email_not_in_systeme: string;
    err_invalid_email: string;
    err_weak_password: string;
    err_send_failed: string;
    err_generic: string;
    err_network: string;
  };

  // ─── Auth callback ───────────────────────────────────────────────
  callback: {
    validating: string;
    err_title: string;
    err_default: string;
    request_new_link: string;
  };

  // ─── Overview (dashboard) ────────────────────────────────────────
  overview: {
    greeting: string; // "Bonjour {name} 👋"
    subtitle: string;
    link_card_title: string;
    link_card_help: string; // explication "?sa=" partout
    stat_clicks: string;
    stat_signups: string;
    stat_sales: string;
    stat_conversion_rate: string;
    gain_total: string;
    gain_pending: string;
    gain_paid: string;
    tier_card_title: string;
    tier_current: string; // "Tu es actuellement au palier {label}."
    tier_remaining: string; // "Plus que {count} ventes pour atteindre..."
    tier_current_badge: string;
    coming_soon: string;
    trial_cta_title: string;
    trial_cta_description: string;
    trial_cta_button: string;
  };

  // ─── Promouvoir ──────────────────────────────────────────────────
  promouvoir: {
    page_title: string;
    page_subtitle: string;
    main_link_title: string;
    main_link_description: string;
    tab_links: string;
    tab_emails: string;
    tab_posts: string;
    tab_visuels: string;
    links_info: string; // "Tu peux aussi rajouter ?sa= partout..."
    emails_info_title: string;
    emails_info_body: string;
    posts_info_title: string;
    posts_info_body: string;
    visuels_info_title: string;
    visuels_info_body: string;
    conditions_title: string;
    conditions_cookie: string;
    conditions_lasttouch: string;
    conditions_tiers: string;
    see_full_terms: string;
  };

  // ─── Revenus ─────────────────────────────────────────────────────
  revenus: {
    page_title: string;
    page_subtitle: string;
    total_gains: string;
    pending: string;
    approved: string;
    paid: string;
    history_title: string;
    history_description: string;
    empty_title: string;
    empty_subtitle: string;
    th_date: string;
    th_product: string;
    th_customer: string;
    th_sale: string;
    th_commission: string;
    th_status: string;
    status_pending: string;
    status_approved: string;
    status_paid: string;
    status_cancelled: string;
    status_rejected: string;
    calculator_title: string;
    calculator_subtitle: string;
    calculator_visitors: string;
    calculator_conversion_rate: string;
    calculator_rate_hint: string;
    calculator_sales_per_month: string;
    calculator_revenue_per_month: string;
    calculator_revenue_per_year: string;
    calculator_disclaimer: string;
  };

  // ─── Paiement ────────────────────────────────────────────────────
  paiement: {
    page_title: string;
    page_subtitle: string;
    method_title: string;
    method_description: string;
    tab_paypal: string;
    tab_iban: string;
    label_paypal_email: string;
    placeholder_paypal_email: string;
    paypal_hint: string;
    label_iban_holder: string;
    placeholder_iban_holder: string;
    label_iban_number: string;
    placeholder_iban_number: string;
    iban_hint: string;
    save_button: string;
    saving: string;
    success: string;
    err_invalid_paypal_email: string;
    err_invalid_iban: string;
    err_iban_incomplete: string;
    err_generic: string;
    conditions_title: string;
    conditions_frequency: string;
    conditions_minimum: string;
    conditions_currency: string;
  };

  // ─── Support ─────────────────────────────────────────────────────
  support: {
    page_title: string;
    page_subtitle: string;
    contact_title: string;
    contact_description: string;
    contact_button: string;
    restart_tour_button: string;
    faq_title: string;
    terms_card_title: string;
    terms_card_button: string;
  };

  // ─── Trial Tipote ────────────────────────────────────────────────
  trial: {
    page_title: string;
    page_subtitle: string;
    // État non activé
    not_activated_title: string;
    not_activated_subtitle: string;
    feature_1: string;
    feature_2: string;
    feature_3: string;
    feature_4: string;
    feature_5: string;
    timing_title: string;
    timing_body: string;
    activate_button: string;
    activate_loading: string;
    activate_modal_title: string;
    activate_modal_body_1: string; // "Tu vas débloquer 30 jours..."
    activate_modal_body_2: string;
    activate_modal_warning: string;
    activate_modal_confirm: string;
    activate_modal_cancel: string;
    err_already_paid: string;
    err_already_activated: string;
    err_generic: string;
    err_network: string;
    why_offered_title: string;
    why_offered_body_1: string;
    why_offered_body_2: string;
    // État actif
    active_title: string;
    active_subtitle: string; // "Ton compte Tipote est en plan Elite jusqu'au {date}."
    active_remaining_singular: string;
    active_remaining_plural: string;
    today_label: string;
    end_label: string;
    access_tipote: string;
    ideas_title: string;
    idea_screencast: string;
    idea_screenshots: string;
    idea_niche: string;
    idea_bonus: string;
    // État expiré
    expired_title: string;
    expired_subtitle: string;
    expired_body_1: string;
    expired_body_2: string;
    discover_plans: string;
    continue_promoting: string;
  };

  // ─── Tour (tutoriel) ─────────────────────────────────────────────
  tour: {
    step1_title: string;
    step1_subtitle: string;
    step1_body_1: string;
    step1_body_2: string;
    step2_title: string;
    step2_subtitle: string;
    step2_body_intro: string;
    step2_bullet_cookie: string;
    step2_bullet_lasttouch: string;
    step2_bullet_anywhere: string;
    step3_title: string;
    step3_subtitle: string;
    step3_body_intro: string;
    step3_bullet_emails: string;
    step3_bullet_posts: string;
    step3_bullet_visuals: string;
    step3_body_outro: string;
    step4_title: string;
    step4_subtitle: string;
    step4_body_1: string;
    step4_body_2: string;
    step5_title: string;
    step5_subtitle: string;
    step5_body_intro: string;
    step5_tier_low: string;
    step5_tier_mid: string;
    step5_tier_high: string;
    step5_body_outro: string;
    skip: string;
    finish: string;
    next: string;
  };

  // ─── Trial banner (in Tipote app) ────────────────────────────────
  banner: {
    title_active: string;
    expires_today: string;
    expires_singular: string; // "plus que 1 jour"
    expires_plural: string; // "plus que {days} jours"
    offered_via_affiliate: string;
    keep_tipote: string;
    my_trial: string;
  };

  // ─── Locale switcher ─────────────────────────────────────────────
  locale_switcher: {
    label: string;
    fr: string;
    en: string;
    es: string;
    it: string;
    pt: string;
    ar: string;
  };
};

export const SUPPORTED_AFFILIATE_LOCALES = [
  "fr",
  "en",
  "es",
  "it",
  "pt",
  "ar",
] as const;

export type AffiliateLocale = (typeof SUPPORTED_AFFILIATE_LOCALES)[number];

export function isAffiliateLocale(v: unknown): v is AffiliateLocale {
  return typeof v === "string" && (SUPPORTED_AFFILIATE_LOCALES as readonly string[]).includes(v);
}
