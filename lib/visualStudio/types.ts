// Types partagés du module "Studio visuels" (ImageStudio).
//
// Le module est volontairement AGNOSTIQUE du stockage et de l'app hôte :
// l'hôte fournit un `brandKit` (couleurs/logo/police) + une fonction
// `upload` (qui décide où le fichier atterrit : pipeline TUS self-host,
// bucket, etc.) et récupère l'URL finale via `onApply`. Même composant
// pour affiliate / Tiquiz / Tipote — seuls les props changent.

export type StudioFormatId = "1:1" | "4:5" | "9:16";

export interface StudioFormat {
  id: StudioFormatId;
  /** Libellé court affiché dans le sélecteur. */
  label: string;
  /** Dimensions de RENDU (export), en pixels. Le preview est mis à l'échelle. */
  width: number;
  height: number;
}

/** Identité de marque injectée par l'app hôte. */
export interface BrandKit {
  name: string;
  logoUrl?: string | null;
  /** Couleur des CTA / accents (hex #RRGGBB). */
  primaryColor: string;
  /** Couleur des titres / texte principal (hex). */
  textColor: string;
  /** Couleur d'appoint optionnelle (pops sur fond sombre). */
  accentColor?: string;
  /** Fond par défaut (hex). */
  backgroundColor: string;
  /** Famille de police CSS (doit être chargée par l'app hôte). */
  font?: string;
}

export type BackgroundMode = "solid" | "gradient" | "image";

export interface BackgroundSpec {
  mode: BackgroundMode;
  /** Couleur unie, ou 1ère couleur du dégradé. */
  color: string;
  /** 2ème couleur du dégradé (mode "gradient"). */
  color2?: string;
  /** URL de l'image de fond (mode "image") : upload local, ou fond IA. */
  imageUrl?: string | null;
}

// Identifiants des 3 calques texte de base (l'IA peut les pré-remplir
// via `initialText`). Le rendu/édition réel est géré par Fabric.js.
export type TextLayerId = "kicker" | "headline" | "accent" | "subline" | "cta";

export interface StudioResult {
  /** URL exploitable par l'hôte (renvoyée par `upload`, sinon object URL local). */
  url: string;
  /** Chemin de stockage long terme (TUS) si `upload` le fournit — à PERSISTER
   *  (l'`url` signée, elle, expire). L'hôte re-signe le chemin à l'affichage. */
  storagePath?: string;
  width: number;
  height: number;
  blob: Blob;
  format: StudioFormatId;
}

export interface ImageStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Identité de marque (Tiquiz / Tipote / affiliate). */
  brandKit: BrandKit;

  /** Formats proposés (défaut : les 3). */
  formats?: StudioFormatId[];
  defaultFormat?: StudioFormatId;

  /** Pour "modifier" : image existante chargée comme fond. */
  initialImageUrl?: string | null;
  /** Pré-remplissage des textes (ex: copy proposé par l'IA). */
  initialText?: Partial<Record<TextLayerId, string>>;
  /** Sujet/contexte pré-rempli pour l'IA (ex: le texte du post ciblé) → la
   *  copy générée s'adapte à CE post, pas à un sujet tapé au hasard. */
  initialIntent?: string;

  /**
   * Persiste le PNG produit et renvoie son URL (et, si possible, son chemin
   * de stockage long terme à persister). C'est l'hôte qui décide du backend
   * (pipeline TUS self-host, etc.). Si absent, le module fabrique une object
   * URL locale (preview/téléchargement uniquement).
   */
  upload?: (
    blob: Blob,
    meta: { format: StudioFormatId; width: number; height: number },
  ) => Promise<{ url: string; path?: string } | string>;

  /** Renvoie le résultat à l'appelant (pour l'insérer là où il faut). */
  onApply?: (result: StudioResult) => void;

  title?: string;
  applyLabel?: string;
}
