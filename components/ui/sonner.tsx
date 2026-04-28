// components/ui/sonner.tsx
// Sonner toaster wired to the design system.
//
// Two upgrades over the stock shadcn template:
//   - The default toast picks up our card / border / shadow tokens so
//     it sits in the same visual family as Card / SectionCard rather
//     than looking like a third-party library leak.
//   - Each toast variant (success / error / warning / info) gets its
//     own tonal accent (emerald / rose / amber / sky) on the left
//     border + icon. Lets a creator scan the wall of in-flight toasts
//     and immediately spot "ah, that's an alert" vs "that's a save
//     confirmation" without reading.
//
// Usage stays the same — toast.success("Saved"), toast.error("…"),
// toast.warning("…"), toast.info("…") — the variant classes are
// applied automatically by Sonner via classNames.{success,error,…}.

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          // Base toast: card surface + soft shadow so it matches the
          // rest of the SaaS chrome instead of feeling pasted on.
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border/60 group-[.toaster]:shadow-card group-[.toaster]:rounded-xl group-[.toaster]:border-l-4",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full",
          // Tonal left-border + icon color per variant. The 4-px
          // colored stripe is what gives the toast its identity at a
          // glance (matches the InsightsList card pattern).
          success:
            "group-[.toaster]:!border-l-emerald-500 group-[.toast]:[&>[data-icon]]:text-emerald-500",
          error:
            "group-[.toaster]:!border-l-rose-500 group-[.toast]:[&>[data-icon]]:text-rose-500",
          warning:
            "group-[.toaster]:!border-l-amber-500 group-[.toast]:[&>[data-icon]]:text-amber-500",
          info:
            "group-[.toaster]:!border-l-sky-500 group-[.toast]:[&>[data-icon]]:text-sky-500",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
