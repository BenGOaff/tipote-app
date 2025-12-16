import { redirect } from "next/navigation";

// Backward-compatible route: older UI links to /dashboard.
// The actual dashboard is served at /app (see app/app/page.tsx).
export default function DashboardRedirect() {
  redirect("/app");
}
