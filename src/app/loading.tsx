import { CircularLoader } from "@/components/ui/circular-loader";

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[hsl(40_28%_96%/0.92)] backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <CircularLoader size={64} strokeWidth={5} className="gap-0" />
        <p className="text-sm font-medium text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
