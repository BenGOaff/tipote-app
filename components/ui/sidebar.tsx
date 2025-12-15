import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { VariantProps, cva } from "class-variance-authority";
import { PanelLeft } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";

type SidebarCSSVars = React.CSSProperties & {
  ["--sidebar-width"]?: string;
  ["--sidebar-width-mobile"]?: string;
};

type SidebarState = "expanded" | "collapsed";

type SidebarContextValue = {
  state: SidebarState;
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return ctx;
}

function getCookieValue(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookieValue(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAgeSeconds}`;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
};

export function SidebarProvider({
  defaultOpen = true,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();

  const [open, setOpen] = React.useState<boolean>(() => {
    const cookie = getCookieValue(SIDEBAR_COOKIE_NAME);
    if (cookie === "expanded") return true;
    if (cookie === "collapsed") return false;
    return defaultOpen;
  });

  const [openMobile, setOpenMobile] = React.useState(false);

  const state: SidebarState = open ? "expanded" : "collapsed";

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((v) => !v);
      return;
    }
    setOpen((v) => {
      const next = !v;
      setCookieValue(
        SIDEBAR_COOKIE_NAME,
        next ? "expanded" : "collapsed",
        SIDEBAR_COOKIE_MAX_AGE,
      );
      return next;
    });
  }, [isMobile]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen: (next) => {
        setOpen(next);
        setCookieValue(
          SIDEBAR_COOKIE_NAME,
          next ? "expanded" : "collapsed",
          SIDEBAR_COOKIE_MAX_AGE,
        );
      },
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [state, open, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
          style={
            {
              ...style,
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
            } as SidebarCSSVars
          }
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

type SidebarProps = React.ComponentProps<"div"> & {
  collapsible?: "offcanvas" | "icon";
};

export function Sidebar({
  className,
  collapsible = "offcanvas",
  children,
  ...props
}: SidebarProps) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  // Mobile: sheet
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          side="left"
          className={cn(
            "p-0 w-[var(--sidebar-width-mobile)]",
            "bg-sidebar text-sidebar-foreground",
          )}
        >
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop
  return (
    <div
      data-state={state}
      data-collapsible={collapsible}
      className={cn(
        "relative hidden md:flex h-svh flex-col border-r bg-sidebar text-sidebar-foreground",
        "w-[var(--sidebar-width)]",
        collapsible === "icon" &&
          "data-[state=collapsed]:w-[3.5rem] transition-[width] duration-200",
        collapsible === "offcanvas" &&
          "data-[state=collapsed]:-ml-[var(--sidebar-width)] transition-[margin] duration-200",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarRail({ className }: { className?: string }) {
  const { isMobile } = useSidebar();
  if (isMobile) return null;
  return (
    <div
      className={cn(
        "absolute right-0 top-0 h-full w-px bg-border/60",
        className,
      )}
    />
  );
}

export function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleSidebar}
      className={cn("h-9 w-9", className)}
      {...props}
    >
      <PanelLeft className="h-5 w-5" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex-1", className)} {...props} />;
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-2 p-3", className)} {...props} />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("p-2", className)} {...props} />;
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("px-1", className)} {...props} />;
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        "px-3 py-2 text-xs font-medium text-sidebar-foreground/70",
        "data-[hidden=true]:hidden",
        className,
      )}
      data-hidden={state === "collapsed"}
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator className={cn("bg-border/70", className)} {...props} />
  );
}

export function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "h-9 bg-sidebar-accent/30 border-border/60 focus-visible:ring-0 focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li className={cn("list-none", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  cn(
    "group/menu-button flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors",
    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    "focus-visible:ring-2 focus-visible:ring-ring",
    "disabled:pointer-events-none disabled:opacity-50",
  ),
  {
    variants: {
      size: {
        default: "h-10",
        sm: "h-9 text-xs",
        lg: "h-11 text-base",
      },
      variant: {
        default: "",
        ghost: "bg-transparent",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

export function SidebarMenuButton({
  className,
  asChild,
  isActive,
  tooltip,
  size,
  variant,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: React.ReactNode;
  }) {
  const Comp = asChild ? Slot : "button";
  const { state } = useSidebar();

  const button = (
    <Comp
      data-active={isActive ? "true" : "false"}
      className={cn(
        sidebarMenuButtonVariants({ size, variant }),
        isActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        className,
      )}
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        className={cn("text-xs", state !== "collapsed" && "hidden")}
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarMenuSkeleton({
  className,
  showIcon = true,
  ...props
}: React.ComponentProps<typeof Skeleton> & { showIcon?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
      {showIcon ? <Skeleton className="h-5 w-5 rounded-md" /> : null}
      <Skeleton className="h-4 flex-1" {...props} />
    </div>
  );
}

export function SidebarMenuSub({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return <ul className={cn("ml-4 flex flex-col gap-1", className)} {...props} />;
}

export function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li className={cn("list-none", className)} {...props} />;
}

export function SidebarMenuSubButton({
  className,
  asChild,
  isActive,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot : "a";
  return (
    <Comp
      data-active={isActive ? "true" : "false"}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isActive &&
          "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        className,
      )}
      {...props}
    />
  );
}
