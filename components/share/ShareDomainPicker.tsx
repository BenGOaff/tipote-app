"use client";

// components/share/ShareDomainPicker.tsx
//
// Small select used at the top of the share/partage section in the
// quiz, survey and popquiz editors. Renders nothing when the user has
// no choice to make (zero verified custom domains → only the main
// host is available). Pair with useShareDomain() — pass its
// `shareDomain`, `shareDomainOptions` and `setShareDomain` straight
// through.

import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  label: string;
  value: string | null;
  options: string[];
  onChange: (next: string) => void;
}

export function ShareDomainPicker({ label, value, options, onChange }: Props) {
  if (options.length <= 1 || !value) return null;
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm font-mono flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((host) => (
            <SelectItem key={host} value={host} className="font-mono text-sm">
              {host}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
