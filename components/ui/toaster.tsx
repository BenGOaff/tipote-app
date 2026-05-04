import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        // JB feedback 2026-05-04: the success "Sauvegardé !" toast hung
        // around for 5s (Radix default) and visually overlapped the
        // header buttons (Publier / Enregistrer). Cap default duration
        // at 2s; destructive toasts get the longer 5s default.
        const duration = props.duration ?? (props.variant === "destructive" ? 5000 : 2000);
        return (
          <Toast key={id} {...props} duration={duration}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
