// components/ui/recharts.types.ts
import type { LegendProps, TooltipProps } from "recharts";

/**
 * Recharts injecte des "payload items" au runtime,
 * mais les types varient beaucoup selon les versions.
 * On normalise ici le minimum dont nos composants ont besoin.
 */
export type RechartsPayloadItem = {
  name?: string;
  dataKey?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

export type RechartsTooltipPayload = RechartsPayloadItem[];

/**
 * Props normalisées pour notre contenu custom de Tooltip / Legend.
 * On ne dépend PAS des champs internes Recharts qui changent avec les versions.
 */
export type AdaptedTooltipProps = Omit<TooltipProps<number, string>, "payload"> & {
  payload?: RechartsTooltipPayload;
  label?: unknown;
  active?: boolean;
};

export type AdaptedLegendProps = Omit<LegendProps, "payload"> & {
  payload?: RechartsTooltipPayload;
  verticalAlign?: "top" | "bottom" | "middle";
};
