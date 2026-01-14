"use client";

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
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAgeSeconds}`;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [internalOpen, setInternalOpen] = React.useState(() => {
    const cookie = getCookie(SIDEBAR_COOKIE_NAME);
    if (cookie === "true") return true;
    if (cookie === "false") return false;
    return defaultOpen;
  });

  const open = openProp ?? internalOpen;
  const setOpen = React.useCallback(
    (value: boolean) => {
      if (setOpenProp) {
        setOpenProp(value);
        return;
      }
      setInternalOpen(value);
      setCookie(SIDEBAR_COOKIE_NAME, String(value), SIDEBAR_COOKIE_MAX_AGE);
    },
    [setOpenProp],
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((v) => !v);
      return;
    }
    setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextValue>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

const sidebarVariants = cva(
  "fixed top-0 bottom-0 z-30 hidden w-[--sidebar-width] flex-col border-r bg-sidebar transition-all duration-300 ease-in-out data-[state=collapsed]:w-[--sidebar-width-icon] md:flex",
  {
    variants: {
      variant: {
        default: "bg-sidebar text-sidebar-foreground",
        floating:
          "bg-sidebar text-sidebar-foreground border-r shadow-sm rounded-xl my-4 ml-4 h-[calc(100svh-2rem)]",
        inset:
          "bg-sidebar text-sidebar-foreground border-r shadow-sm my-4 ml-4 h-[calc(100svh-2rem)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Sidebar({
  className,
  children,
  variant,
}: React.ComponentProps<"div"> & VariantProps<typeof sidebarVariants>) {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-[--sidebar-width] p-0">
          <div className={cn("flex h-full flex-col", className)}>{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className={cn(sidebarVariants({ variant }), className)} data-state={state}>
      {children}
    </div>
  );
}

export function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9", className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  const { state } = useSidebar();

  return (
    <main
      data-state={state}
      className={cn(
        "relative flex min-h-svh flex-1 flex-col bg-background transition-all duration-300 ease-in-out md:pl-[--sidebar-width] data-[state=collapsed]:md:pl-[--sidebar-width-icon]",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar, state } = useSidebar();

  return (
    <button
      type="button"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute -right-4 top-4 z-40 hidden h-10 w-10 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent md:flex",
        className,
      )}
      {...props}
    >
      <span className="sr-only">Toggle Sidebar</span>
      <span className="text-xs text-muted-foreground">
        {state === "expanded" ? "—" : "+"}
      </span>
    </button>
  );
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-2 py-2 text-sidebar-foreground",
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
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-2 py-2 text-sidebar-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

export function SidebarGroupLabel({
  className,
  asChild,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      className={cn(
        "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring focus-visible:ring-2 data-[state=collapsed]:opacity-0 data-[state=collapsed]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupAction({
  className,
  asChild,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground/70 outline-none ring-sidebar-ring focus-visible:ring-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=collapsed]:opacity-0 data-[state=collapsed]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("w-full text-sm", className)} {...props} />;
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li className={cn("group/menu-item relative", className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=collapsed]:justify-center data-[state=collapsed]:px-2",
  {
    variants: {
      variant: {
        default: "",
        outline:
          "border border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      },
      size: {
        default: "h-9",
        sm: "h-8",
        lg: "h-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function SidebarMenuButton({
  asChild,
  isActive,
  variant,
  size,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const content = (
    <Comp
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) return content;

  if (state === "expanded") return content;

  const tooltipContent =
    typeof tooltip === "string" ? (
      <TooltipContent side="right" align="center">
        {tooltip}
      </TooltipContent>
    ) : (
      <TooltipContent side="right" align="center" {...tooltip} />
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      {!isMobile ? tooltipContent : null}
    </Tooltip>
  );
}

export function SidebarMenuAction({
  asChild,
  showOnHover,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
}) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/70 outline-none ring-sidebar-ring focus-visible:ring-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        showOnHover &&
          "opacity-0 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "absolute right-2 top-1/2 flex h-5 -translate-y-1/2 items-center justify-center rounded-md bg-sidebar-accent px-1.5 text-xs font-medium text-sidebar-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSkeleton({
  showIcon = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 rounded-md px-2",
        className,
      )}
      {...props}
    >
      {showIcon ? <Skeleton className="h-5 w-5 rounded-md" /> : null}
      <Skeleton className="h-4 w-full rounded-md" />
    </div>
  );
}

export function SidebarMenuSub({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarMenuSubItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return <li className={cn("group/menu-sub-item relative", className)} {...props} />;
}

export function SidebarMenuSubButton({
  asChild,
  size = "md",
  isActive,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
}) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-active={isActive}
      className={cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground/80 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "h-6 text-xs",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <div className="px-2">
      <Input
        className={cn(
          "h-8 w-full border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus-visible:ring-sidebar-ring",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function SidebarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn("mx-2 w-auto bg-sidebar-border", className)}
      {...props}
    />
  );
}

export function SidebarItem({
  title,
  icon: Icon,
  isActive,
  onClick,
}: {
  title: string;
  icon: React.ElementType;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={onClick} isActive={isActive}>
        <Icon className="h-4 w-4" />
        <span className="truncate">{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
