// components/ui/chart.tsx
import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";
import type {
  AdaptedLegendProps,
  AdaptedTooltipProps,
  RechartsPayloadItem,
  RechartsTooltipPayload,
} from "./recharts.types";

const THEMES = { light: "", dark: ".dark" } as const;

type IconType = React.ComponentType<{ className?: string }>;

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: IconType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>;

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactNode;
};

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const chartId = React.useId();
    const resolvedId = id ?? chartId;
    const uniqueId = `chart-${resolvedId}`;

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          data-chart={uniqueId}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl bg-card p-4 shadow-sm ring-1 ring-border",
            className,
          )}
          {...props}
        >
          {children}
        </div>
        <ChartStyle id={uniqueId} config={config} />
      </ChartContext.Provider>
    );
  },
);
ChartContainer.displayName = "ChartContainer";

type ChartStyleProps = {
  id: string;
  config: ChartConfig;
};

function ChartStyle({ id, config }: ChartStyleProps) {
  const cssVars = React.useMemo(() => {
    const entries: Array<{ selector: string; color: string }> = [];

    for (const [key, itemConfig] of Object.entries(config)) {
      const colorConfig =
        itemConfig.theme && typeof itemConfig.theme === "object"
          ? itemConfig.theme
          : { light: itemConfig.color, dark: itemConfig.color };

      for (const [theme, color] of Object.entries(colorConfig)) {
        if (!color) continue;

        const selector =
          theme === "dark"
            ? `${THEMES.dark} [data-chart=${id}] [data-chart-series="${key}"]`
            : `[data-chart=${id}] [data-chart-series="${key}"]`;

        entries.push({ selector, color });
      }
    }

    const grouped: Record<string, string[]> = {};
    for (const { selector, color } of entries) {
      grouped[selector] ||= [];
      grouped[selector].push(color);
    }

    return Object.entries(grouped)
      .map(([selector, colors]) => {
        const block = colors
          .map((color, index) => {
            const variable = `--color-${index + 1}`;
            const value =
              color.startsWith("hsl(") ? color.replace(/hsl\(|\)/g, "") : color;
            return `${variable}: ${value};`;
          })
          .join("\n");
        return `${selector} {${block}}`;
      })
      .join("\n");
  }, [id, config]);

  if (!cssVars) return null;

  return <style dangerouslySetInnerHTML={{ __html: cssVars }} />;
}

/**
 * Tooltip
 */
const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.ComponentProps<"div"> &
  AdaptedTooltipProps & {
    nameKey?: string;
    labelKey?: string;
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
  };

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

    const safePayload: RechartsTooltipPayload = Array.isArray(payload) ? payload : [];

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || safePayload.length === 0) return null;

      const item = safePayload[0];
      const key = `${labelKey || item.dataKey || item.name || "value"}`;
      const itemConfig = getPayloadConfigFromPayload(config, item, key);

      // label peut être unknown selon Recharts: on ne force jamais ReactNode ici.
      const labelFromConfig =
        !labelKey && typeof label === "string"
          ? config[label]?.label
          : itemConfig.label;

      if (!labelFromConfig) return null;

      return (
        <div className="grid gap-1.5">
          <div className="text-[0.7rem] uppercase text-muted-foreground">{labelFromConfig}</div>
          {label != null ? (
            <div className="font-mono text-[0.7rem] text-muted-foreground">
              {typeof label === "string" || typeof label === "number" ? label : ""}
            </div>
          ) : null}
        </div>
      );
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
                    <span
                      className="inline-flex h-2 w-2 rounded-full"
                      style={{ backgroundColor: indicatorColor }}
                    />
                  ) : (
                    <span
                      className={cn("inline-flex h-0.5 w-4", indicator === "dashed" ? "border-b border-dashed" : "border-b")}
                      style={{ borderColor: indicatorColor }}
                    />
                  )}
                </div>
              ) : null}

              {itemConfig.icon ? <itemConfig.icon className="h-3 w-3 text-muted-foreground" /> : null}

              <span className="text-xs text-muted-foreground">{itemConfig.label ?? item.name ?? key}</span>
            </div>

            {typeof item.value === "number" ? (
              <span className="font-mono font-medium tabular-nums text-foreground">
                {item.value.toLocaleString()}
              </span>
            ) : item.value != null ? (
              <span className="font-mono font-medium tabular-nums text-foreground">
                {String(item.value)}
              </span>
            ) : null}
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

type ChartLegendContentProps = React.ComponentProps<"div"> &
  AdaptedLegendProps & {
    hideIcon?: boolean;
    nameKey?: string;
  };

const ChartLegendContent = React.forwardRef<HTMLDivElement, ChartLegendContentProps>(
  ({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
    const { config } = useChart();
    const safePayload: RechartsTooltipPayload = Array.isArray(payload) ? payload : [];

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
            <div
              key={key}
              className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
            >
              {!hideIcon && itemConfig.icon ? <itemConfig.icon /> : null}

              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: indicatorColor }} />
                <span className="text-xs text-muted-foreground">
                  {itemConfig.label ?? item.value ?? item.name ?? key}
                </span>
              </div>
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
  // 1) direct match
  if (key in config) return config[key];

  // 2) if item.name points to a config entry
  if (item.name && item.name in config) return config[item.name];

  // 3) if item.dataKey points to a config entry
  if (item.dataKey && item.dataKey in config) return config[item.dataKey];

  // 4) fallback
  return { label: key };
}

function getPayloadColor(item: RechartsPayloadItem, config: ChartConfig, key: string): string {
  const itemConfig = getPayloadConfigFromPayload(config, item, key);

  // theme override
  if ("theme" in itemConfig && itemConfig.theme) {
    const color = itemConfig.theme.light || itemConfig.theme.dark;
    if (color) return color.startsWith("hsl(") ? color : `hsl(${color})`;
  }

  // direct color
  if ("color" in itemConfig && itemConfig.color) {
    return itemConfig.color.startsWith("hsl(") ? itemConfig.color : `hsl(${itemConfig.color})`;
  }

  // recharts item-provided color
  if (item.color) return item.color;

  return "hsl(var(--primary))";
}

export {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
};
