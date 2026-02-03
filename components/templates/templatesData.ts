// components/templates/templatesData.ts
import type { Template } from "@/components/templates/types";

export const templates: Template[] = [
  // CAPTURE TEMPLATES
  {
    id: "capture-ads",
    name: "Capture Ads",
    description:
      "Parfait pour proposer un lead magnet, délivrer le lead magnet, puis segmenter ton audience avant de lui envoyer une offre adaptée.",
    category: ["Business", "Coaching"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/473100/67baf9eba1f77_templatecapture.png",
    shareLink:
      "https://systeme.io/dashboard/share?hash=5164082432a0858bcd087e5c12f2299711af279&type=funnel",
    features: [
      "Page de capture",
      "Page de segmentation",
      "Page vidéo offerte",
      "Page de remerciement",
    ],
    price: "Gratuit",
  },
  {
    id: "dream-team",
    name: "Dream Team",
    description:
      "Idéale pour inscrire tes prospects à un challenge gratuit avec un style luxueux.",
    category: ["Luxe", "Business"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc0aa0b1fd_templatesystemeio.png",
    shareLink:
      "https://systeme.io/funnel/share/4923748e188ebb6eba31a443d32246c2ce97ae1?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de capture", "Page de remerciement"],
  },
  {
    id: "feel-good",
    name: "Feel Good",
    description:
      "Page de capture conçue pour la spiritualité et le bien-être, très facile à personnaliser.",
    category: ["Bien-être", "Coach"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc45fdb593_2025-01-06_12-53-43.png",
    shareLink:
      "https://systeme.io/funnel/share/49237401a889d129fd5da8d83e88b6a8f10e785?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de capture", "Page de remerciement"],
  },
  {
    id: "simple-orange",
    name: "Simple Orange",
    description:
      "Tunnel parfait pour capturer des participants à un challenge avec un design épuré.",
    category: ["Business", "Coach"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc50bafead_2025-01-06_12-56-07.png",
    shareLink:
      "https://systeme.io/funnel/share/492369676efdb1eb2dba30cdc7a7531d850684b?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: [
      "Page de capture",
      "Page de remerciement",
      "Page de vente",
      "Page de commande",
    ],
  },
  {
    id: "up-to-challenge",
    name: "Up to Challenge",
    description:
      "Tunnel de challenge complet avec beaucoup de pages et de la gamification.",
    category: ["Challenge", "Coach"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc5b83fe8c_2025-01-06_12-58-57.png",
    shareLink:
      "https://systeme.io/funnel/share/4923735ec525f51f810498db477d64110f2e63e?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de capture", "Page de remerciement", "Page challenge", "Page de vente"],
  },
  {
    id: "mega-event",
    name: "Mega Event",
    description:
      "Tunnel d'inscription à un événement, avec une page de vente ultra impactante.",
    category: ["Event", "Business"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc6716bee0_2025-01-06_13-01-58.png",
    shareLink:
      "https://systeme.io/funnel/share/4923727465da59184ce558b212d8d76326b5991?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de capture", "Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "golden-business",
    name: "Golden Business",
    description:
      "Tunnel idéal pour un business coach : capture, page de vente, commande et remerciement.",
    category: ["Business", "Coach"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc70b443a1_2025-01-06_13-04-54.png",
    shareLink:
      "https://systeme.io/funnel/share/49236905c8bf7725c4f342a01c904a8f588f0f6?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de capture", "Page de vente", "Page de commande", "Page de remerciement"],
  },
  {
    id: "click-tunnel",
    name: "Click Tunnel",
    description:
      "Tunnel minimaliste et efficace : page de capture, page de vente, page de commande, page de remerciement.",
    category: ["Business", "Coach"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc79967257_2025-01-06_13-07-12.png",
    shareLink: "https://systeme.io/funnel/share/49237457a7cf68db67905282db212f0c5d47e41",
    features: ["Page de capture", "Page de vente", "Page de commande", "Page de remerciement"],
  },
  {
    id: "banger",
    name: "Banger",
    description:
      "Tunnel complet designé pour vendre une offre premium. Très moderne et ultra impactant.",
    category: ["Business", "Premium"],
    type: "capture",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/473100/67b75b59e6705_template-banger-image.png",
    shareLink: "https://systeme.io/funnel/share/5151456e724c974f055850f5fe4fd45e02f4d68",
    features: ["Page de capture", "Page de vente", "Page de commande", "Page de remerciement"],
  },

  // SALES TEMPLATES
  {
    id: "elearning",
    name: "E-Learning",
    description: "Tunnel complet pour vendre une formation en ligne avec un design moderne.",
    category: ["Formation", "Coach"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/473100/678fde1f3ea23_2025-01-21_18-42-04.png",
    shareLink:
      "https://systeme.io/funnel/share/4996973088ce1f0a9defe8e139134afb1adfe13?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "fresh",
    name: "Fresh",
    description: "Page de vente pour un produit/service à la tonalité fun et fraîche.",
    category: ["Lifestyle", "Business"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/473100/6798dbc333c90_2025-01-28_14-05-07.png",
    shareLink:
      "https://systeme.io/funnel/share/5030996488d21093df05bd2eeb0849761c0d683?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de remerciement"],
  },
  {
    id: "funnel-100k",
    name: "Funnel 100K",
    description: "Tunnel complet très corporate, idéal pour des offres à haute valeur.",
    category: ["Business", "Corporate"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc8728fc5d_2025-01-06_13-10-41.png",
    shareLink:
      "https://systeme.io/funnel/share/49236999f3d408a080bc5be5f5761c299b0aa07?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "funnel-fan",
    name: "Funnel Fan",
    description: "Tunnel complet pour vendre une offre avec une tonalité plus fun et décontractée.",
    category: ["Business", "Fun"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc93d609e7_2025-01-06_13-14-18.png",
    shareLink:
      "https://systeme.io/funnel/share/4923723e21865c0db595549db1242ca6f3b35ca?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "funny-sales",
    name: "Funny Sales",
    description: "Tunnel de vente fun et minimaliste.",
    category: ["Business", "Fun"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bc9ebde5da_2025-01-06_13-17-23.png",
    shareLink:
      "https://systeme.io/funnel/share/4923716d8535ecdebce8aebfb4d8a920bb5b0e6?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "loose-weight",
    name: "Loose Weight",
    description: "Tunnel complet pour le marché du fitness/perte de poids.",
    category: ["Fitness", "Coach"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bcaa59bc1c_2025-01-06_13-20-08.png",
    shareLink:
      "https://systeme.io/funnel/share/4923709c992a32ae55d45e4fadc707e56e788c8?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "sweet-zen",
    name: "Sweet Zen",
    description: "Tunnel complet pour le marché du bien-être / spiritualité.",
    category: ["Bien-être", "Coach"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bcb5179e17_2025-01-06_13-23-04.png",
    shareLink:
      "https://systeme.io/funnel/share/4923731703007131679e6bdddc0ad42d54d51c7?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },
  {
    id: "video-master",
    name: "Video Master",
    description: "Tunnel complet idéal pour vendre une offre autour de la vidéo.",
    category: ["Vidéo", "Business"],
    type: "sales",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/3969368/677bcbe6ba940_2025-01-06_13-25-35.png",
    shareLink:
      "https://systeme.io/funnel/share/492371220e0a4b83aea8d7b76d8785b9f7d75cb?sa=sa0007878317200141bbe3de2b6644176621db2c6580",
    features: ["Page de vente", "Page de commande", "Page de confirmation"],
  },

  // BLOG TEMPLATES
  {
    id: "blog-coach",
    name: "Blog Coach",
    description: "Template de blog optimisé pour une activité de coaching.",
    category: ["Blog", "Coach"],
    type: "blog",
    imageUrl:
      "https://d1yei2z3i6k35z.cloudfront.net/473100/68238fa276dd4_template-blog-coach.png",
    shareLink:
      "https://systeme.io/dashboard/share?hash=330286d76e33ad9ea75db5fa7b2d890d874c65&type=blog",
    features: ["Page d'accueil", "Page article", "Page à propos", "Page contact"],
  },
];
