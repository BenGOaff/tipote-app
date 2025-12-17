// app/onboarding/page.tsx
import OnboardingForm from './OnboardingForm';

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl">
        <OnboardingForm />
      </div>
    </div>
  );
}
