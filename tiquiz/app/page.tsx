import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          <span className="gradient-primary bg-clip-text text-transparent">Tiquiz</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Cree des quiz lead magnet viraux en quelques minutes grace a l&apos;IA.
          Capture des emails, segmente tes leads, automatise avec Systeme.io.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-11 px-8 rounded-lg gradient-primary text-white font-medium hover:opacity-90 transition-opacity shadow-glow"
          >
            Commencer
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 px-8 rounded-lg border bg-background font-medium hover:bg-muted transition-colors"
          >
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
