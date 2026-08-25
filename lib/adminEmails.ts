// lib/adminEmails.ts
// Liste centralisée des emails autorisés à accéder au tableau de bord admin.
// Utilisée par : middleware.ts, app/admin/page.tsx, app/api/admin/users/route.ts

export const ADMIN_EMAILS: readonly string[] = [
  "hello@ethilife.fr",
  "hello@tipote.com",
  "contact@blagardette.com",
  "blagardette@gmail.com",
];

// QUI ON PRÉVIENT, ET C'EST UNE AUTRE QUESTION QUE "QUI A LE DROIT".
//
// `ADMIN_EMAILS` dit qui peut ENTRER dans le tableau de bord. Ça ne dit
// rien de qui doit être PRÉVENU, et les QUATRE adresses ci-dessus
// arrivent dans la même boîte.
//
// -- BÉNÉ, 25 AOÛT 2026 -----------------------------------------------
//
// "Je reçois toujours ce genre de mails en double c'est normal ?"
//
// Non. Le cron des seuils fiscaux bouclait sur `ADMIN_EMAILS` et envoyait
// donc QUATRE messages distincts pour une seule alerte. Aucune boîte de
// réception ne peut les regrouper : ce sont quatre emails différents.
//
// Pour prévenir une autre personne, ajoute son adresse ici.
export const ADMIN_ALERT_EMAILS: readonly string[] = [
  "blagardette@gmail.com",
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
