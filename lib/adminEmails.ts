// lib/adminEmails.ts
// Liste centralisée des emails autorisés à accéder au tableau de bord admin.
// Utilisée par : middleware.ts, app/admin/page.tsx, app/api/admin/users/route.ts

export const ADMIN_EMAILS: readonly string[] = [
  "hello@ethilife.fr",
  "hello@tipote.com",
  "contact@blagardette.com",
  "blagardette@gmail.com",
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
