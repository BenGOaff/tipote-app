"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    color?: string;
  }
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const ctx = React.useContext(ChartContext);
  if (!ctx) throw new Error("useChart must be used within a <ChartContainer />");
  return ctx;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactNode;
};

function ChartContainer({ className, config, children, ...props }: ChartContainerProps) {
  return (
    <ChartContext.Provider value={{ config }}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </ChartContext.Provider>
  );
}

type RechartsPayloadItem = {
  dataKey?: string;
  name?: string;
  value?: unknown;
  color?: string;
  payload?: unknown;
};

type RechartsTooltipPayload = RechartsPayloadItem[];

type AdaptedTooltipProps = {
  active?: boolean;
  payload?: unknown;
  label?: unknown;
};

type ChartTooltipContentProps = React.ComponentProps<"div"> &
  AdaptedTooltipProps & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "dot" | "line" | "dashed";
    nameKey?: string;
    labelKey?: string;
  };

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
  (
    {
      active,
      payload,
      label,
      className,
      nameKey,
      labelKey,
      hideLabel = false,
      hideIndicator = false,
      indicator = "dot",
      ...props
    },
    ref,
  ) => {
    const { config } = useChart();

    const safePayload = React.useMemo<RechartsTooltipPayload>(() => (Array.isArray(payload) ? payload : []), [payload]);

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || safePayload.length === 0) return null;

      const item = safePayload[0];
      const key = `${labelKey || item.dataKey || item.name || "value"}`;
      const itemConfig = getPayloadConfigFromPayload(config, item, key);

      // label peut être unknown selon Recharts: on ne force jamais ReactNode ici.
      // On affiche seulement si c'est un string/number ou si une config fournit un label.
      const safeLabel =
        itemConfig.label ??
        (typeof label === "string" || typeof label === "number" ? label : typeof item.name === "string" ? item.name : null);

      if (safeLabel == null) return null;

      return <div className="text-xs font-medium text-foreground">{safeLabel}</div>;
    }, [config, hideLabel, label, labelKey, safePayload]);

    const tooltipItems = React.useMemo(() => {
      if (!active || safePayload.length === 0) return null;

      return safePayload.map((item: RechartsPayloadItem, idx: number) => {
        const key = `${nameKey || item.name || item.dataKey || idx}`;
        const itemConfig = getPayloadConfigFromPayload(config, item, key);
        const indicatorColor = getPayloadColor(item, config, key);

        return (
          <div
            key={key}
            className={cn("flex items-center justify-between gap-4 text-xs text-foreground", className)}
          >
            <div className="flex items-center gap-1.5">
              {!hideIndicator ? (
                <div className="flex h-2.5 w-2.5 items-center justify-center">
                  {indicator === "dot" ? (
                    <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: indicatorColor }} />
                  ) : (
                    <span
                      className={cn(
                        "inline-flex h-0.5 w-4",
                        indicator === "dashed" ? "border-b border-dashed" : "border-b",
                      )}
                      style={{ borderColor: indicatorColor }}
                    />
                  )}
                </div>
              ) : null}

              {itemConfig.icon ? <itemConfig.icon className="h-3 w-3 text-muted-foreground" /> : null}

              <span className="text-xs text-muted-foreground">{itemConfig.label ?? item.name ?? key}</span>
            </div>

            {typeof item.value === "number" ? (
              <span className="font-mono font-medium tabular-nums text-foreground">{item.value.toLocaleString()}</span>
            ) : item.value != null ? (
              <span className="font-mono font-medium tabular-nums text-foreground">{String(item.value)}</span>
            ) : (
              <span className="font-mono font-medium tabular-nums text-foreground">—</span>
            )}
          </div>
        );
      });
    }, [active, className, config, hideIndicator, indicator, nameKey, safePayload]);

    if (!tooltipLabel && !tooltipItems) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      >
        {tooltipLabel}
        {tooltipItems}
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltipContent";

/**
 * Legend
 */
const ChartLegend = RechartsPrimitive.Legend;

type AdaptedLegendProps = {
  payload?: unknown;
  verticalAlign?: "top" | "middle" | "bottom";
};

type ChartLegendContentProps = React.ComponentProps<"div"> &
  AdaptedLegendProps & {
    hideIcon?: boolean;
    nameKey?: string;
  };

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
    const { config } = useChart();

    const safePayload = React.useMemo<RechartsTooltipPayload>(() => (Array.isArray(payload) ? payload : []), [payload]);

    if (safePayload.length === 0) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-center gap-4",
          verticalAlign === "top" ? "pb-3" : "pt-3",
          className,
        )}
      >
        {safePayload.map((item: RechartsPayloadItem, idx: number) => {
          const key = `${nameKey || item.dataKey || item.name || idx}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = getPayloadColor(item, config, key);

          return (
            <div key={key} className="flex items-center gap-1.5">
              {!hideIcon ? (
                <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: indicatorColor }} />
              ) : null}
              {itemConfig.icon ? <itemConfig.icon className="h-3 w-3 text-muted-foreground" /> : null}
              <span className="text-xs text-muted-foreground">{itemConfig.label ?? item.name ?? key}</span>
            </div>
          );
        })}
      </div>
    );
  },
);
ChartLegendContent.displayName = "ChartLegendContent";

/**
 * Helpers
 */
function getPayloadConfigFromPayload(config: ChartConfig, item: RechartsPayloadItem, key: string) {
  const byKey = config[key];
  if (byKey) return byKey;

  const dataKey = typeof item.dataKey === "string" ? item.dataKey : undefined;
  if (dataKey && config[dataKey]) return config[dataKey];

  const name = typeof item.name === "string" ? item.name : undefined;
  if (name && config[name]) return config[name];

  return {};
}

function getPayloadColor(item: RechartsPayloadItem, config: ChartConfig, key: string) {
  const itemConfig = getPayloadConfigFromPayload(config, item, key);

  if (itemConfig.color) return itemConfig.color;

  if (typeof item.color === "string" && item.color) return item.color;

  const fallbackKey = typeof item.dataKey === "string" ? item.dataKey : typeof item.name === "string" ? item.name : key;
  const fallback = config[fallbackKey]?.color;
  if (fallback) return fallback;

  return "currentColor";
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
};
