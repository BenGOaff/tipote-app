// components/PageBanner.tsx
// Reusable gradient banner for all dashboard pages — consistent look & feel
import type { ReactNode } from "react";

type PageBannerProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  /** Optional right-side content (badges, actions, etc.) */
  children?: ReactNode;
};

export function PageBanner({ icon, title, subtitle, children }: PageBannerProps) {
  return (
    <div className="gradient-primary text-primary-foreground rounded-xl overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 md:px-6 md:py-5">
        <div className="w-10 h-10 rounded-lg bg-primary-foreground/15 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-display font-semibold leading-tight">{title}</h2>
          <p className="text-sm text-primary-foreground/75 mt-0.5 leading-snug">{subtitle}</p>
        </div>
        {children && <div className="shrink-0 flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
