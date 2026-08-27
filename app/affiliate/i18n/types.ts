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
    liens: string;
    contenus: string;
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
    signup_direct: string;
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
    err_email_deja_affiliee: string;
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
  nouveautes: {
    titre: string;
    intro: string;
    p1_titre: string;
    p1_corps: string;
    p2_titre: string;
    p2_corps: string;
    p3_titre: string;
    p3_corps: string;
    p4_titre: string;
    p4_corps: string;
    p5_titre: string;
    p5_corps: string;
    cta_liens: string;
    cta_paiement: string;
    cta_conditions: string;
    masquer: string;
  };
  overview: {
    greeting: string; // "Bonjour {name} 👋"
    subtitle: string;
    // Bloc "Ce que tu peux promouvoir" : une carte par produit, avec son
    // propre lien tracké. L'Atelier (70%) passe devant Tiquiz (40%) car
    // c'est le produit prioritaire côté stratégie. Il remplace l'ancienne
    // carte "lien d'affiliation" et l'ancienne carte "ta commission".
    promote_title: string;
    promote_subtitle: string;
    promote_atelier_kind: string; // "La formation"
    promote_atelier_badge: string; // "Le plus rentable"
    promote_atelier_pitch: string;
    promote_atelier_cta: string;
    promote_tiquiz_kind: string; // "L'outil"
    promote_tiquiz_pitch: string;
    promote_tiquiz_cta: string;
    promote_link_hint: string; // "Lien tracké avec ton ?sa={sa}"
    promote_combo_title: string;
    promote_combo_body: string;
    stat_clicks: string;
    stat_signups: string;
    stat_sales: string;
    stat_conversion_rate: string;
    gain_total: string;
    gain_pending: string;
    gain_paid: string;
    trial_cta_title: string;
    trial_cta_description: string;
    trial_cta_button: string;
    // Launch guide
    guide_title: string;
    guide_subtitle: string;
    guide_progress: string; // "{done}/{total} étapes"
    guide_completed_title: string;
    guide_completed_body: string;
    guide_mark_done: string;
    guide_mark_undone: string;
    guide_step_profile_title: string;
    guide_step_profile_body: string;
    guide_step_link_title: string;
    guide_step_link_body: string;
    guide_step_payment_title: string;
    guide_step_payment_body: string;
    guide_step_trial_title: string;
    guide_step_trial_body: string;
    guide_step_email_title: string;
    guide_step_email_body: string;
    guide_step_post_title: string;
    guide_step_post_body: string;
    // Badges
    badges_title: string;
    badges_subtitle: string;
    badges_progress: string; // "{done}/{total} débloqués"
    badge_locked: string;
    badge_first_click_title: string;
    badge_first_click_body: string;
    badge_first_signup_title: string;
    badge_first_signup_body: string;
    badge_first_sale_title: string;
    badge_first_sale_body: string;
    badge_tier_mid_title: string;
    badge_tier_mid_body: string;
    badge_tier_high_title: string;
    badge_tier_high_body: string;
    badge_100eur_title: string;
    badge_100eur_body: string;
    // Leaderboard
    leaderboard_title: string;
    leaderboard_subtitle: string;
    leaderboard_you: string;
    leaderboard_sales: string;
    leaderboard_empty: string;
    leaderboard_your_rank: string;
    leaderboard_unranked: string;
  };

  // ─── Default LinksManager link destinations ──────────────────────
  link_destinations: {
    // Le bon de commande sur NOTRE domaine : le seul lien qui ouvre
    // les 30 jours offerts (cf. lib/affiliate/links.ts).
    tiquiz_direct_label: string;
    tiquiz_direct_description: string;
    tiquiz_main_label: string;
    tiquiz_main_description: string;
    tiquiz_free_label: string;
    tiquiz_free_description: string;
    tiquiz_monthly_label: string;
    tiquiz_monthly_description: string;
    tiquiz_monthly_plus_label: string;
    tiquiz_monthly_plus_description: string;
    tiquiz_yearly_label: string;
    tiquiz_yearly_description: string;
    tiquiz_yearly_plus_label: string;
    tiquiz_yearly_plus_description: string;
    atelier_label: string; // L'Atelier du Quiz (formation, FR uniquement)
    atelier_description: string;
    tipote_main_label: string;
    tipote_main_description: string;
    tipote_order_label: string;
    tipote_order_description: string;
  };

  // ─── Promouvoir ──────────────────────────────────────────────────
  // ─── Mes liens (inspiré de l'espace ambassadeur Waalaxy, 24 août) ──
  liens: {
    page_title: string;
    page_subtitle: string;
    stat_links: string;
    stat_clicks: string;
    stat_signups: string;
    stat_commissions: string;
    col_name: string;
    col_link: string;
    col_clicks: string;
    col_signups: string;
    col_paying: string;
    col_commissions: string;
    col_actions: string;
    copy_short: string;
    copy_long: string;
    open: string;
    empty_title: string;
    empty_body: string;
    empty_cta: string;
  };
  promouvoir: {
    page_title: string;
    page_subtitle: string;
    market_label: string; // "Marché" (sélecteur de marché de diffusion)
    market_hint: string; // "Liens et contenus adaptés au marché {market}."
    // Le code public n'a pas pu être préparé : on le DIT au lieu
    // d'afficher un champ vide (un lien muet se partage).
    link_unavailable: string;
    // Le mois offert : l'argument de vente de l'affilié, et sa limite.
    mois_offert_title: string;
    mois_offert_body: string;
    mois_offert_note: string;
    mois_offert_limit: string;
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
    edit_button: string;
    edit_reset: string;
    edit_badge: string;
    edit_hint: string;
    edit_saved: string;
    // Articles de blog — sélecteur de cible affilié (juin 2026)
    blog_section_title: string;
    blog_section_description: string;
    blog_search_placeholder: string;
    blog_empty_search: string;
  };

  // ─── Revenus ─────────────────────────────────────────────────────
  revenus: {
    page_title: string;
    paye_par_sio: string;
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
    // Simulateur : deux produits, prix et taux réels, aucun chiffre de
    // conversion inventé (l'ancienne version annonçait une "moyenne
    // observée sur le programme" qui n'existait pas).
    calculator_title: string;
    calculator_subtitle: string;
    calculator_atelier_sales: string;
    calculator_tiquiz_subs: string;
    calculator_tiquiz_plan: string;
    calculator_plan_simple: string; // "Accès simple (17 €/mois)"
    calculator_plan_plus: string; // "Plus (29 €/mois)"
    calculator_month_total: string;
    calculator_year_total: string;
    calculator_breakdown: string; // "dont {atelier} … et {tiquiz} …"
    calculator_per_unit: string; // "{atelierUnit} par vente, {tiquizUnit} par abonné"
    calculator_per_unit_tiquiz: string; // variante sans l'Atelier
    calculator_assumptions: string; // "{atelier}" + "{tiquiz}" = prix publics
  };

  // ─── Paiement (info-only : tout passe par Systeme.io) ────────────
  paiement: {
    page_title: string;
    // Les coordonnées de versement (25 août 2026) : PayPal ou virement,
    // au choix de l'affiliée.
    choose_title: string;
    choose_body: string;
    method_paypal: string;
    method_paypal_hint: string;
    method_virement: string;
    method_virement_hint: string;
    label_paypal_email: string;
    label_titulaire: string;
    label_iban: string;
    label_bic: string;
    bic_optional: string;
    iban_stored_note: string;
    iban_current: string;
    iban_replace: string;
    save: string;
    saving: string;
    saved: string;
    saved_facture_seule: string;
    err_save: string;
    err_methode_inconnue: string;
    err_paypal_email: string;
    err_titulaire: string;
    err_iban: string;
    err_iban_invalide: string;
    err_bic_invalide: string;
    incomplete_banner: string;
    complete_banner: string;
    minimum_note: string;
    // Le profil fiscal et le mandat de facturation (25 août 2026) :
    // on émet la facture à sa place, il faut son accord et ses infos.
    fiscal_title: string;
    fiscal_body: string;
    statut_entreprise: string;
    statut_entreprise_hint: string;
    statut_particulier: string;
    statut_particulier_hint: string;
    label_denomination: string;
    label_adresse: string;
    label_adresse2: string;
    label_code_postal: string;
    label_ville: string;
    label_pays: string;
    label_siren: string;
    label_tva_numero: string;
    assujetti_label: string;
    assujetti_hint: string;
    mandat_title: string;
    mandat_accept: string;
    mandat_accepted_on: string;
    mandat_required: string;
    factures_title: string;
    factures_empty: string;
    factures_open: string;
    factures_note: string;
    err_statut: string;
    err_denomination: string;
    err_adresse: string;
    err_ville: string;
    err_pays: string;
    err_siren: string;
    err_siren_invalide: string;
    err_tva_numero: string;
    err_tva_numero_invalide: string;
    err_mandat: string;
    page_subtitle_sio: string;
    sio_config_title: string;
    sio_config_body: string;
    sio_config_cta: string;
    schedule_title: string;
    schedule_when: string;
    schedule_cooloff: string;
    invoices_title: string;
    invoices_body: string;
    invoices_cta: string;
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
    // FAQ entries
    // Trois entrées d'entrée de gamme pour les affiliés qui débutent :
    // par où commencer, quoi promouvoir, où est le matériel.
    faq_start_q: string;
    faq_start_a: string;
    faq_which_product_q: string;
    faq_which_product_a: string;
    faq_where_material_q: string;
    faq_where_material_a: string;
    faq_payment_q: string;
    faq_payment_a: string;
    faq_cookie_q: string;
    faq_cookie_a: string;
    faq_multi_link_q: string;
    faq_multi_link_a: string;
    faq_best_channels_q: string;
    faq_best_channels_a: string;
    faq_minimum_q: string;
    faq_minimum_a: string;
    faq_subscriptions_q: string;
    faq_subscriptions_a: string;
    faq_self_click_q: string;
    faq_self_click_a: string;
    faq_paid_ads_q: string;
    faq_paid_ads_a: string;
    faq_first_revenue_q: string;
    faq_first_revenue_a: string;
    faq_taxes_q: string;
    faq_taxes_a: string;
    // Ex-"combien gagnent les affiliés en moyenne" : la réponse citait des
    // moyennes jamais mesurées. Remplacée par le calcul réel par vente.
    faq_avg_earnings_q: string;
    faq_avg_earnings_a: string;
    faq_missing_commission_q: string;
    faq_missing_commission_a: string;
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
    access_tiquiz: string;
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

  // ─── Contenus (page affilié) ─────────────────────────────────────
  contenus: {
    page_title: string;
    page_subtitle: string; // "Tes emails, posts, articles et visuels prêts à copier-coller."
    page_subtitle_market: string; // " — change la langue si tu vises une autre audience."
    tab_articles: string;
    empty_emails: string; // "Aucun email en {locale}"
    empty_posts: string;
    empty_articles: string;
    empty_visuals: string;
    empty_lang_help: string; // "Cette langue n'a pas encore..."
    empty_visuals_help: string;
    admin_visuals_title: string; // "Visuels ajoutés"
    visual_alt: string; // "Visuel"
  };


  // ─── Espace Contenu (dossiers par produit) ───────────────────────
  content_space: {
    page_title: string;
    page_subtitle: string;
    home_hint: string;
    folder_promote: string; // "Promouvoir {product}"
    folder_atelier_desc: string;
    folder_tiquiz_desc: string;
    folder_meta: string; // "{emails} emails · {posts} posts"
    folder_subtitle: string; // "{rate} de commission…"
    folder_hint: string; // rappel du ?sa={sa}
    section_emails: string;
    section_emails_desc: string;
    section_reseaux: string;
    section_reseaux_desc: string;
    section_articles: string;
    section_articles_desc: string;
    section_logos: string;
    section_logos_desc: string;
    section_generer: string;
    section_generer_desc: string;
    count_emails: string;
    count_posts: string;
    count_articles: string;
    count_articles_empty: string;
    count_assets: string;
    count_generer: string;
    emails_subtitle: string; // "{product}"
    emails_atelier_help: string;
    plan_7: string;
    plan_3: string;
    plan_posts: string;
    empty_emails: string;
    empty_posts: string;
    empty_generate_hint: string;
    reseaux_subtitle: string;
    reseaux_atelier_help: string;
    articles_subtitle: string;
    articles_empty_title: string;
    articles_empty_body: string;
    articles_empty_cta: string;
    logos_subtitle: string;
    logos_rules: string;
    brand_logo_full: string;
    brand_logo_dark_bg: string;
    brand_logo_icon: string;
    brand_cover: string;
    brand_mockup: string;
    brand_mockup_white: string;
    brand_download: string;
    generer_subtitle: string;
    generer_help: string;
    gen_format_email: string;
    gen_format_post: string;
    gen_format_article: string;
    gen_format_script_court: string;
    gen_format_script_long: string;
    gen_brief_restored: string;
    gen_brief_clear: string;
    gen_label_format: string;
    gen_label_audience: string;
    gen_ph_audience: string;
    gen_help_audience: string;
    gen_label_angle: string;
    gen_ph_angle: string;
    gen_label_tone: string;
    gen_ph_tone: string;
    gen_loading: string;
    gen_submit: string;
    gen_retry: string;
    gen_edit: string;
    gen_edit_done: string;
    gen_edit_hint: string;
    gen_copy_plain: string;
    gen_copy_rich: string;
    gen_make_visual: string;
    gen_disclaimer: string;
    gen_err_audience: string;
    gen_err_rate: string; // "{minutes}"
    gen_err_generic: string;
    gen_err_network: string;
  };
  // ─── EmailCard (preview composant) ───────────────────────────────
  email_card: {
    preheader_inline: string; // "Pré-header : "
    label_subject: string;
    label_preheader: string;
    label_body: string;
    copy_subject: string;
    copy_preheader: string;
    copy_body: string;
    copy_all: string;
    numbered: string; // "Email {n} ·"
    alt_subjects: string; // "Autres objets à tester"
    copy_rich: string; // copie qui garde le gras
    copy_plain: string;
  };

  // ─── PostDayCard ─────────────────────────────────────────────────
  post_card: {
    visual_intro: string; // "Visuel à publier avec le post :"
    generate_visual: string;
    download: string;
    your_visuals: string; // "Tes visuels pour ce post ({count})"
    visual_generated_alt: string;
    download_title: string;
    remove_title: string;
    copy_post: string; // "Copier le post {network}"
    // Kit Atelier : un post = un texte + son visuel (image seule ou
    // carrousel qui défile, avec PDF et zip des images).
    badge_single: string;
    badge_carousel: string; // "Carrousel {count} slides"
    slide_alt: string; // "Slide {n} de {alt}"
    go_to_slide: string; // "Aller à la slide {n}"
    slide_position: string; // "Slide {n}/{total}"
    download_pdf: string;
    download_png_zip: string; // "Les {count} images (PNG)"
    download_png: string;
    copy_text: string;
    comment_link_title: string; // "Ton lien, à coller en premier commentaire"
    copy_link: string;
  };

  // ─── ArticleCard ─────────────────────────────────────────────────
  article_card: {
    open: string; // "Lire"
    close: string; // "Fermer"
    default_title: string; // "Article"
    copy_article: string;
    edit_and_copy: string;
    edit_modal_title: string;
    apply_label: string;
  };

  // ─── VisualGallery ───────────────────────────────────────────────
  visual_gallery: {
    create_your_own_title: string;
    create_your_own_body: string;
    create_button: string;
    singles_title: string; // "Visuels singles (8)"
    singles_subtitle: string;
    carousel_title: string;
    carousel_subtitle: string;
    download_zip: string;
    download: string;
  };

  // ─── LinksManager ────────────────────────────────────────────────
  links_manager: {
    label_field: string; // "Libellé"
    label_field_placeholder: string;
    description_field: string; // "Description (optionnel)"
    description_field_placeholder: string;
    destination_field: string;
    destination_placeholder: string; // "/part-tiquiz-gratuit ou https://{host}/article"
    destination_hint: string; // "Un chemin {host} (ex. /commande)..."
    save: string;
    cancel: string;
    add_link: string;
    edit_title: string; // "Modifier"
    remove_title: string;
  };

  // ─── Admin: ContentAdmin (article / email) ───────────────────────
  content_admin: {
    label_subject: string; // "Objet"
    label_title: string;
    placeholder_email_subject: string;
    placeholder_article_title: string;
    label_preheader: string; // "Pré-en-tête (aperçu boîte mail)"
    placeholder_preheader: string;
    label_content: string;
    empty_content: string; // "Aucun contenu — clique sur..."
    edit_content_button: string;
    placeholder_email_body: string;
    placeholder_article_body: string;
    label_order: string;
    label_published: string;
    save: string;
    cancel: string;
    confirm_delete: string;
    count_singular: string; // "{count} contenu"
    count_plural: string;
    import_defaults: string;
    add: string;
    untitled: string;
    draft: string;
    unpublish: string;
    publish: string;
    edit: string;
    remove: string;
    article_modal_title: string;
    article_modal_apply: string;
  };

  // ─── Admin: PostAdmin ────────────────────────────────────────────
  post_admin: {
    label_day: string; // "Jour / libellé"
    placeholder_day: string;
    label_theme: string;
    placeholder_theme: string;
    label_hook: string;
    placeholder_hook: string;
    label_visual_path: string;
    placeholder_visual_path: string;
    placeholder_caption: string; // "Caption {network}. {AFFILIATE_LINK} est remplacé automatiquement."
    label_order: string;
    label_published: string;
    save: string;
    cancel: string;
    confirm_delete: string;
    count_singular: string;
    count_plural: string;
    import_defaults: string;
    add: string;
    untitled: string;
    draft: string;
    unpublish: string;
    publish: string;
    edit: string;
    remove: string;
  };

  // ─── Admin: VisualAdmin ──────────────────────────────────────────
  visual_admin: {
    count_singular: string;
    count_plural: string;
    add_visuals: string;
    empty_state: string;
    confirm_delete: string;
    remove_title: string;
    visual_alt: string;
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
