# Templates d'emails Supabase / Supabase Email Templates

Ces templates sont à copier-coller manuellement dans :
**Supabase Dashboard → Authentication → Email Templates**

---

## Fichiers disponibles

| Fichier | Template Supabase | Événement |
|---|---|---|
| `invite.html` | **Invite user** | Admin invite un utilisateur |
| `magic-link.html` | **Magic Link** et **Confirm signup** | Connexion par lien magique |
| `reset-password.html` | **Reset Password** | Réinitialisation du mot de passe |

## Pourquoi les emails sont bilingues (FR + EN) ?

Supabase ne supporte pas nativement les emails multilingues dynamiques.
Les templates sont donc rédigés en **français + anglais** pour couvrir les deux principales langues de la plateforme.

Pour un vrai multilingue par langue d'utilisateur, il faudrait passer par un service d'email tiers (SendGrid, Postmark, Resend) intégré via une Edge Function Supabase.

## Variable disponible dans les templates Supabase

- `{{ .ConfirmationURL }}` — L'URL complète du lien d'action
- `{{ .Email }}` — L'email de l'utilisateur
- `{{ .Token }}` — Le token OTP (si besoin)
- `{{ .SiteURL }}` — L'URL de votre site
