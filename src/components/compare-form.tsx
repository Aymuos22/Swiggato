"use client";

import { useActionState } from "react";
import { Search } from "lucide-react";
import { useFormStatus } from "react-dom";

import { comparePricesAction } from "@/lib/actions/compare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type AddressOption = {
  id: string;
  label: string;
};

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={disabled || pending} className="h-11 min-w-[160px]">
      <Search className="h-4 w-4" />
      {pending ? "Comparing…" : "Compare"}
    </Button>
  );
}

export function CompareForm({
  addresses,
  ready,
  groqConfigured
}: {
  addresses: AddressOption[];
  ready: boolean;
  groqConfigured: boolean;
}) {
  const [state, action] = useActionState(comparePricesAction, {});
  const canSubmit = ready && groqConfigured;

  return (
    <form
      action={action}
      data-no-loader="true"
      data-loader-label="Comparing prices…"
      className="grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end"
    >
      <div className="grid gap-2">
        <Label htmlFor="query">What are you craving?</Label>
        <Input
          id="query"
          name="query"
          placeholder="cheapest spicy chicken biryani near home under 350"
          required
          disabled={!canSubmit}
          className="h-12 text-base"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="addressId">Deliver to</Label>
        <Select id="addressId" name="addressId" required defaultValue={addresses[0]?.id} disabled={!canSubmit}>
          {addresses.map((address) => (
            <option key={address.id} value={address.id}>
              {address.label}
            </option>
          ))}
        </Select>
      </div>
      <SubmitButton disabled={!canSubmit} />
      {"clarifiedQuery" in state && state.clarifiedQuery ? (
        <p className="text-sm text-muted-foreground md:col-span-3">Understood as: {state.clarifiedQuery}</p>
      ) : null}
      {"error" in state && state.error ? (
        <p className="text-sm text-destructive md:col-span-3">{state.error}</p>
      ) : null}
      {"warning" in state && state.warning ? (
        <p className="text-sm text-[hsl(28_70%_28%)] md:col-span-3">{state.warning}</p>
      ) : null}
      {"comparisonId" in state && state.comparisonId && !state.error ? (
        <p className="text-sm font-medium text-[hsl(175_55%_22%)] md:col-span-3">
          Comparison saved. Scroll for the Swiggy vs Zomato breakdown.
        </p>
      ) : null}
    </form>
  );
}
