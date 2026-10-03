import type { Platform } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";

export type PriceRow = {
  id?: string;
  platform: Platform;
  restaurantName: string;
  itemName: string;
  itemPrice: string;
  packagingFee: string;
  deliveryFee: string;
  platformFee: string;
  taxes: string;
  discount: string;
  finalPrice: string;
};

function rupees(value: string) {
  return `₹${Number(value).toFixed(0)}`;
}

function rowKey(row: PriceRow, index: number) {
  return row.id ?? `${row.platform}-${row.restaurantName}-${row.itemName}-${index}`;
}

function PriceTableBody({ rows }: { rows: PriceRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Component</Th>
          {rows.map((row, index) => (
            <Th key={rowKey(row, index)}>{row.platform}</Th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td>Restaurant</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{row.restaurantName}</Td>
          ))}
        </tr>
        <tr>
          <Td>Item</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{row.itemName}</Td>
          ))}
        </tr>
        <tr>
          <Td>Item Price</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{rupees(row.itemPrice)}</Td>
          ))}
        </tr>
        <tr>
          <Td>Packaging</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{rupees(row.packagingFee)}</Td>
          ))}
        </tr>
        <tr>
          <Td>Delivery</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{rupees(row.deliveryFee)}</Td>
          ))}
        </tr>
        <tr>
          <Td>Platform Fee</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{rupees(row.platformFee)}</Td>
          ))}
        </tr>
        <tr>
          <Td>Taxes</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>{rupees(row.taxes)}</Td>
          ))}
        </tr>
        <tr>
          <Td>Discount</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)}>-{rupees(row.discount)}</Td>
          ))}
        </tr>
        <tr className="font-semibold">
          <Td>Final Price</Td>
          {rows.map((row, index) => (
            <Td key={rowKey(row, index)} className="font-display text-lg">
              {rupees(row.finalPrice)}
            </Td>
          ))}
        </tr>
      </tbody>
    </Table>
  );
}

export function PriceTable({
  rows,
  framed = true,
  emptyLabel,
  warning
}: {
  rows: PriceRow[];
  framed?: boolean;
  emptyLabel?: string;
  warning?: string | null;
}) {
  if (rows.length === 0) {
    if (!emptyLabel) {
      return null;
    }

    return (
      <div className="space-y-3">
        {warning ? (
          <p className="rounded-md border border-[hsl(36_90%_70%)] bg-[hsl(36_90%_90%)] px-4 py-3 text-sm text-[hsl(28_70%_28%)]">
            {warning}
          </p>
        ) : null}
        <div className="rounded-lg border border-dashed border-border bg-card/50 px-6 py-10 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      </div>
    );
  }

  const cheapest = rows.reduce((best, row) =>
    Number(row.finalPrice) < Number(best.finalPrice) ? row : best
  );
  const costliest = rows.reduce((best, row) =>
    Number(row.finalPrice) > Number(best.finalPrice) ? row : best
  );
  const difference = Number(costliest.finalPrice) - Number(cheapest.finalPrice);
  const platforms = new Set(rows.map((row) => row.platform));
  const partial = platforms.size < 2;

  if (!framed) {
    return <PriceTableBody rows={rows} />;
  }

  return (
    <section className="rounded-lg border border-border bg-card/85 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Latest comparison</h2>
        {partial ? (
          <Badge variant="warning">Partial · only {[...platforms].join(", ")}</Badge>
        ) : (
          <Badge variant="success">
            {cheapest.platform} cheaper by {rupees(String(difference))}
          </Badge>
        )}
      </div>
      {warning || partial ? (
        <p className="border-b border-border px-6 py-3 text-sm text-[hsl(28_70%_28%)]">
          {warning ||
            "Only one platform returned prices. For Zomato, save a delivery address in the Zomato app, then compare again."}
        </p>
      ) : null}
      <div className="p-6">
        <PriceTableBody rows={rows} />
      </div>
    </section>
  );
}
