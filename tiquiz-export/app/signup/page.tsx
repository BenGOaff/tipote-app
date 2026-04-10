// app/signup/page.tsx
import { Suspense } from "react";
import SignupForm from "@/components/auth/SignupForm";

export const metadata = { title: "Créer un compte – Tiquiz" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
