"use client";

import * as React from "react";
import type { SettingsDescriptor, SettingsField } from "@agent-cad/types";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SettingsValues = Record<string, unknown>;

export interface SettingsFormProps {
  descriptor: SettingsDescriptor;
  values: SettingsValues;
  onChange: (key: string, value: unknown) => void;
  /** Render only these field keys (compact chat panel). Omit to render everything. */
  only?: string[];
  /** Hide the "Advanced" disclosure entirely (compact mode renders primary fields only). */
  hideAdvanced?: boolean;
  disabled?: boolean;
  className?: string;
}

/** The effective value for a field: explicit override, else the descriptor default. */
function valueOf(field: SettingsField, values: SettingsValues): unknown {
  const v = values[field.key];
  return v === undefined || v === null ? field.default : v;
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SettingsField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  switch (field.input_type) {
    case "slider":
    case "percent": {
      const num = typeof value === "number" ? value : Number(value ?? field.min ?? 0);
      const min = field.min ?? 0;
      const max = field.max ?? (field.input_type === "percent" ? 100 : 100);
      const step = field.step ?? 1;
      return (
        <div className="flex items-center gap-3">
          <Slider
            value={[num]}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={([v]) => onChange(v)}
            className="flex-1"
          />
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {num}
            {field.input_type === "percent" ? "%" : field.unit ? ` ${field.unit}` : ""}
          </span>
        </div>
      );
    }
    case "number": {
      const num = typeof value === "number" ? value : (value ?? "");
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={num as number | string}
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            step={field.step ?? undefined}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="h-8"
          />
          {field.unit ? <span className="text-xs text-muted-foreground">{field.unit}</span> : null}
        </div>
      );
    }
    case "select": {
      const str = value == null ? "" : String(value);
      return (
        <Select value={str} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "toggle":
      return <Switch checked={Boolean(value)} onCheckedChange={onChange} disabled={disabled} />;
    case "text":
    default:
      return (
        <Input
          value={value == null ? "" : String(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-8"
        />
      );
  }
}

function FieldRow({
  field,
  values,
  onChange,
  disabled,
}: {
  field: SettingsField;
  values: SettingsValues;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const value = valueOf(field, values);
  const inline = field.input_type === "toggle";
  return (
    <div className={cn("flex gap-3", inline ? "items-center justify-between" : "flex-col")}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={field.key} className="text-xs text-muted-foreground">
          {field.label}
        </Label>
        {field.help ? <span className="text-[11px] text-subtle-foreground">{field.help}</span> : null}
      </div>
      <FieldControl field={field} value={value} onChange={(v) => onChange(field.key, v)} disabled={disabled} />
    </div>
  );
}

/**
 * Schema-driven settings renderer (§3a). It iterates `descriptor.fields` and
 * renders each by `input_type`, binding controls **by `field.key`** (the exact
 * SliceSettings request key) — it has zero knowledge of any specific field, so a
 * different printer or a renamed field is a data change with no UI edit.
 */
export function SettingsForm({
  descriptor,
  values,
  onChange,
  only,
  hideAdvanced,
  disabled,
  className,
}: SettingsFormProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // Honour depends_on gating generically (e.g. support_threshold gates on support).
  const visible = (field: SettingsField): boolean => {
    if (only && !only.includes(field.key)) return false;
    if (field.depends_on) {
      const dep = descriptor.fields.find((f) => f.key === field.depends_on!.field);
      if (dep && valueOf(dep, values) !== field.depends_on.equals) return false;
    }
    return true;
  };

  const fields = descriptor.fields.filter(visible);
  const primary = fields.filter((f) => !f.advanced);
  const advanced = hideAdvanced ? [] : fields.filter((f) => f.advanced);

  // Order groups per the descriptor; only render groups that have visible primary fields.
  const groupOrder = descriptor.groups.map((g) => g.id);
  const groupsWithFields = [...new Set(primary.map((f) => f.group))].sort(
    (a, b) => groupOrder.indexOf(a) - groupOrder.indexOf(b),
  );
  const groupLabel = (id: string) => descriptor.groups.find((g) => g.id === id)?.label ?? id;

  return (
    <div className={cn("space-y-5", className)}>
      {groupsWithFields.map((gid) => (
        <div key={gid} className="space-y-3">
          {descriptor.groups.length > 1 && !only ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle-foreground">
              {groupLabel(gid)}
            </p>
          ) : null}
          {primary
            .filter((f) => f.group === gid)
            .map((field) => (
              <FieldRow key={field.key} field={field} values={values} onChange={onChange} disabled={disabled} />
            ))}
        </div>
      ))}

      {advanced.length > 0 ? (
        <div className="space-y-3 border-t pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Advanced ({advanced.length})
          </button>
          {showAdvanced
            ? advanced.map((field) => (
                <FieldRow key={field.key} field={field} values={values} onChange={onChange} disabled={disabled} />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
