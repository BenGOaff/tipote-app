"use client";

// components/BonusDocument.tsx
//
// LE RENDU D'UN DOCUMENT GÉNÉRÉ.
//
// "Des cases, des couleurs, des blocs séparés, une logique, facile à
// lire et comprendre, visuellement agréable." (Béné, 5 août 2026)
//
// -- LA DISTINCTION QUI DÉCIDE DE TOUT --------------------------------
//
// J'avais d'abord fait sobre, en invoquant son refus du 3 août sur les
// cartes de couleurs. Elle a corrigé : ce refus valait pour le QUIZ
// PUBLIC d'une créatrice, qui doit ressembler à SA marque et pas à la
// nôtre. Ici on est dans l'Atelier, notre espace membre, que ses
// visiteurs à elle ne verront jamais. Donc on assume le branding.
//
// -- CE QUI DÉCIDE, ET CE QUI PEINT ----------------------------------
//
// La STRUCTURE vient de `lib/bonus/document.ts`, les COULEURS de
// `lib/bonus/accents.ts`, les deux en fonctions pures et testées. Ce
// fichier ne fait que peindre : il ne relit jamais le markdown et
// n'invente aucune couleur. C'est ce qui garantit que le PDF, qui lit
// les mêmes deux modules, ressemble à l'écran.

import { Copy } from "lucide-react";
import { toast } from "sonner";

// LA MISE EN FORME EN LIGNE VIT DANS `document.ts`, en un seul
// exemplaire : elle finit dans un `innerHTML`, donc c'est une regle
// de securite, et une regle enfermee dans un composant n'est pas
// testee (regle du 1er aout).
import { inline, type BonusDoc, type DocBlock } from "@/lib/bonus/document";
import { sectionAccent, type SectionAccent } from "@/lib/bonus/accents";

export function BonusDocument({ doc }: { doc: BonusDoc }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Le titre du document porte la couleur de la marque, en bandeau :
          il annonce qu'on entre dans un livrable, pas dans une note. */}
      {doc.title && (
        <div className="rounded-xl bg-gradient-to-r from-primary to-violet-500 px-5 py-4">
          <h2 className="font-display text-xl font-bold leading-snug text-white">{doc.title}</h2>
        </div>
      )}

      {doc.lead.length > 0 && (
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
          {doc.lead.map((b, i) => (
            <Block key={i} block={b} accent={sectionAccent(0)} />
          ))}
        </div>
      )}

      {doc.sections.map((s, i) => {
        const accent = sectionAccent(i);
        return (
          <section key={i} className="overflow-hidden rounded-xl border border-border bg-background">
            <header className={`flex items-start gap-3 border-b px-4 py-3 ${accent.head}`}>
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${accent.badge}`}
              >
                {i + 1}
              </span>
              <h3 className={`font-display text-[15px] font-semibold leading-snug ${accent.title}`}>
                {s.title}
              </h3>
            </header>
            <div className="flex flex-col gap-3 px-4 py-4 text-[15px] leading-relaxed">
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} accent={accent} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Block({ block, accent }: { block: DocBlock; accent: SectionAccent }) {
  if (block.kind === "para") {
    return <p dangerouslySetInnerHTML={{ __html: inline(block.text, "ecran") }} />;
  }

  if (block.kind === "list") {
    return (
      <ul className="flex flex-col gap-1.5">
        {block.items.map((it, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              className={`mt-2 size-1.5 shrink-0 rounded-full ${accent.badge}`}
              aria-hidden
            />
            <span dangerouslySetInnerHTML={{ __html: inline(it, "ecran") }} />
          </li>
        ))}
      </ul>
    );
  }

  // Les étapes portent leur numéro dans un libellé au lieu de le
  // laisser dans le texte : c'est ce qui rend un plan en 7 jours
  // parcourable d'un coup d'oeil au lieu de se lire comme un paragraphe.
  if (block.kind === "steps") {
    return (
      <ol className="flex flex-col gap-2.5">
        {block.items.map((it, i) => (
          <li key={i} className="flex gap-3">
            <span
              className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${accent.step}`}
            >
              {it.label}
            </span>
            <span dangerouslySetInnerHTML={{ __html: inline(it.text, "ecran") }} />
          </li>
        ))}
      </ol>
    );
  }

  // LE PROMPT A COLLER DANS CLAUDE OU CHATGPT (retour Béné, 5 août
  // 2026). Il a son cadre et son bouton : un prompt qu'on doit
  // reconstituer en recopiant six paragraphes n'est pas un prompt.
  if (block.kind === "code") {
    return <CodeBlock text={block.text} />;
  }

  return (
    <div className={`flex flex-col gap-2 border-l-2 pl-3 ${accent.rule}`}>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
        {block.title}
      </p>
      {block.blocks.map((b, i) => (
        <Block key={i} block={b} accent={accent} />
      ))}
    </div>
  );
}

/**
 * Un bloc à copier tel quel.
 *
 * Le bouton est ici et pas à côté du document : ce qu'elle veut copier,
 * c'est le prompt, pas le chapitre qui l'entoure. `whitespace-pre-wrap`
 * garde les retours à la ligne du prompt, qui en font partie.
 */
function CodeBlock({ text }: { text: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-surface-soft">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => toast.success("Prompt copié. Colle-le dans Claude ou ChatGPT."),
            () => toast.error("La copie a échoué. Sélectionne le texte et copie-le à la main."),
          );
        }}
        className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-surface-soft"
      >
        <Copy className="size-3.5" />
        Copier
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 pr-20 font-mono text-[12.5px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}
