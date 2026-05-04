#!/usr/bin/env python3
"""
Round 2 patches for Tipote.

Applies three fixes JB asked for on 2026-05-02:
  • JB5 — restore delete dropdown on Mes Quiz card (the single « Gérer »
          button lost edit + delete affordances in a refactor; this
          restores the funnels-style dropdown with Modifier + Voir en
          ligne + Supprimer + confirmation dialog).
  • JB1 — ConsentText fallback. When the stored consent_text matches
          ANY locale's default (often the editor pre-filled the FR
          default and the user never customised), fall back to the
          viewer-locale default so the message reads in the right
          language. Genuine customisations still win.
  • JB4 — Restart button on the result step. The sessionStorage
          persistence we added blocked refresh-to-replay; this surfaces
          an explicit Restart link that clears the session and reloads.

Why a script: the patched files are 95 KB and 65 KB, too heavy to push
through the chat tool. The script does textual replacements anchored on
stable surrounding context, so each change is targeted and the rest of
the file is untouched. It's idempotent — running twice is a no-op.

Run from the Tipote repo root:
    python3 scripts/round2-tipote.py

Then review and commit:
    git diff
    git add components/content/MyContentLovableClient.tsx \
            components/quiz/PublicQuizClient.tsx
    git commit -m "fix(quiz): JB5 delete dropdown + JB1 consent fallback + JB4 restart button"
    git push
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
mc_path = ROOT / "components/content/MyContentLovableClient.tsx"
pq_path = ROOT / "components/quiz/PublicQuizClient.tsx"

if not mc_path.exists() or not pq_path.exists():
    print(f"ERROR: run this from the Tipote repo root. Couldn't find {mc_path} or {pq_path}")
    sys.exit(1)

# ------------------------------------------------------------------
# JB5 — MyContentLovableClient
# ------------------------------------------------------------------
src = mc_path.read_text()

state_anchor = "  const [deleteFunnelConfirm, setDeleteFunnelConfirm] = useState<FunnelListItem | null>(null);"
state_addition = state_anchor + """
  // JB feedback 2026-05-02: the quiz card lost its delete affordance in a
  // refactor. Mirroring the funnels pattern restores it: dropdown with
  // Modifier + Supprimer, plus a confirm dialog so a click can't wipe a
  // quiz with leads accidentally.
  const [deleteQuizConfirm, setDeleteQuizConfirm] = useState<QuizListItem | null>(null);"""
if state_anchor not in src:
    print("ERROR: state anchor not found in MyContentLovableClient")
    sys.exit(1)
if "deleteQuizConfirm" not in src:
    src = src.replace(state_anchor, state_addition, 1)

quiz_button_anchor = '''                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/quiz/${qz.id}`}>{t("ui.manage")}</Link>
                              </Button>'''
quiz_dropdown = '''                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/quiz/${qz.id}`}>
                                      <Edit className="w-4 h-4 mr-2" /> Gérer
                                    </Link>
                                  </DropdownMenuItem>
                                  {isActive && (
                                    <DropdownMenuItem asChild>
                                      <a
                                        href={`/q/${qz.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <ExternalLink className="w-4 h-4 mr-2" /> Voir en ligne
                                      </a>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => setDeleteQuizConfirm(qz)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>'''
if quiz_button_anchor in src:
    src = src.replace(quiz_button_anchor, quiz_dropdown, 1)

dialog_anchor = '                  )}\n                </div>\n              ) : activeFolder === "funnels" ? ('
dialog_replacement = '''                  )}

                  {deleteQuizConfirm && (
                    <Dialog open onOpenChange={() => setDeleteQuizConfirm(null)}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Supprimer ce quiz ?</DialogTitle>
                          <DialogDescription>
                            &laquo; {deleteQuizConfirm.title || (deleteQuizConfirm.mode === "survey" ? "Sondage sans titre" : "Quiz sans titre")} &raquo; et tous ses leads associ&eacute;s seront supprim&eacute;s d&eacute;finitivement. Cette action est irr&eacute;versible.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDeleteQuizConfirm(null)}>
                            Annuler
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={async () => {
                              const id = deleteQuizConfirm.id;
                              setDeleteQuizConfirm(null);
                              try {
                                const res = await fetch(`/api/quiz/${id}`, { method: "DELETE" });
                                if (res.ok) {
                                  router.refresh();
                                  toast({ title: "Quiz supprimé" });
                                } else {
                                  toast({ title: "Suppression échouée", variant: "destructive" as const });
                                }
                              } catch {
                                toast({ title: "Suppression échouée", variant: "destructive" as const });
                              }
                            }}
                          >
                            Supprimer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              ) : activeFolder === "funnels" ? ('''
if dialog_anchor in src and "deleteQuizConfirm &&" not in src.split('activeFolder === "funnels"')[0]:
    src = src.replace(dialog_anchor, dialog_replacement, 1)

mc_path.write_text(src)
print(f"  ✓ patched {mc_path}")

# ------------------------------------------------------------------
# JB1 + JB4 — PublicQuizClient
# ------------------------------------------------------------------
src = pq_path.read_text()

consent_old = '''function ConsentText({ text, privacyUrl, locale }: { text: string | null; privacyUrl: string | null; locale: string | null }) {
  const t = getT(locale);
  const raw = text || t.defaultConsent;'''
consent_new = '''// Set of every locale's default consent text. Used by the heuristic in
// ConsentText below to detect "the stored consent_text was just the
// editor's pre-fill, not a user customisation" so we can fall back to
// the viewer-locale default. JB feedback 2026-05-02.
const ALL_DEFAULT_CONSENTS: ReadonlySet<string> = new Set(
  Object.values(translations).map((entry) => entry.defaultConsent.trim()),
);

function ConsentText({ text, privacyUrl, locale }: { text: string | null; privacyUrl: string | null; locale: string | null }) {
  const t = getT(locale);
  const trimmed = text?.trim() ?? "";
  const isStoredDefault = trimmed.length === 0 || ALL_DEFAULT_CONSENTS.has(trimmed);
  const raw = isStoredDefault ? t.defaultConsent : text!;'''
if consent_old in src:
    src = src.replace(consent_old, consent_new, 1)

type_old = """  continueToResult: string;
  bonusUnlockedContinue: string;"""
type_new = """  continueToResult: string;
  bonusUnlockedContinue: string;
  restartQuiz: string;"""
if "restartQuiz: string;" not in src and type_old in src:
    src = src.replace(type_old, type_new, 1)

RESTART_LABELS = {
    "fr": "Recommencer le quiz",
    "fr_familier": "Recommencer le quiz",
    "fr_vous": "Recommencer le quiz",
    "fr_formel": "Recommencer le quiz",
    "en": "Restart the quiz",
    "es": "Reiniciar el cuestionario",
    "de": "Quiz neu starten",
    "pt": "Reiniciar o quiz",
    "pt_br": "Reiniciar o quiz",
    "pt-BR": "Reiniciar o quiz",
    "it": "Ricomincia il quiz",
    "ar": "أعد بدء الاختبار",
}
trans_start = src.find("const translations: Record<string, QuizTranslations> = {")
trans_end_marker = "\n};\n"
trans_end = src.find(trans_end_marker, trans_start) if trans_start != -1 else -1
if trans_start != -1 and trans_end != -1:
    block = src[trans_start:trans_end]
    if "restartQuiz:" not in block:
        current_locale = [None]
        def transform(line):
            m = re.match(r'^(\s{2,4})([a-zA-Z_-]+)\s*:\s*\{\s*$', line)
            if m:
                current_locale[0] = m.group(2)
                return line
            m2 = re.match(r'^(\s+)bonusUnlockedContinue:\s*"([^"\n]*?)",\s*$', line)
            if m2 and current_locale[0]:
                indent = m2.group(1)
                label = RESTART_LABELS.get(current_locale[0], "Restart the quiz")
                return line + f'\n{indent}restartQuiz: "{label}",'
            return line
        new_block = "\n".join(transform(l) for l in block.split("\n"))
        src = src[:trans_start] + new_block + src[trans_end:]

restart_anchor = """          {quiz.privacy_url && (
            <p className=\"text-xs text-center text-muted-foreground\">
              <a
                href={ensureExternalUrl(quiz.privacy_url)}
                target=\"_blank\"
                rel=\"noopener noreferrer\"
                className=\"underline\"
              >
                {t.privacyPolicy}
              </a>
            </p>
          )}
          </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} />"""
restart_replacement = """          {quiz.privacy_url && (
            <p className=\"text-xs text-center text-muted-foreground\">
              <a
                href={ensureExternalUrl(quiz.privacy_url)}
                target=\"_blank\"
                rel=\"noopener noreferrer\"
                className=\"underline\"
              >
                {t.privacyPolicy}
              </a>
            </p>
          )}

          {/* JB feedback 2026-05-02: surface an explicit Restart link so
              visitors can re-take the quiz on demand. The sessionStorage
              persistence we added blocked refresh-to-replay; this clears
              the saved session and hard-reloads the page. */}
          {!previewData && (
            <button
              type=\"button\"
              onClick={() => {
                try {
                  sessionStorage.removeItem(sessionKey);
                } catch {
                  /* ignore */
                }
                if (typeof window !== \"undefined\") window.location.reload();
              }}
              className=\"block w-full text-xs text-center text-muted-foreground/70 hover:text-foreground underline transition-colors\"
            >
              {t.restartQuiz}
            </button>
          )}
          </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} />"""
if restart_anchor in src and "{t.restartQuiz}" not in src:
    src = src.replace(restart_anchor, restart_replacement, 1)

pq_path.write_text(src)
print(f"  ✓ patched {pq_path}")
print()
print("Done. Run `git diff` to review the changes.")
