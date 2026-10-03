import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";

type CircularLoaderProps = {
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
};

export function CircularLoader({
  size = 56,
  strokeWidth = 4,
  label,
  className
}: CircularLoaderProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      style={
        {
          "--circular-circumference": circumference,
          "--circular-offset-start": circumference * 0.85,
          "--circular-offset-mid": circumference * 0.25
        } as CSSProperties
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="circular-loader"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          className="circular-loader__arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.75}
        />
      </svg>
      {label ? <p className="max-w-xs text-center text-sm text-muted-foreground">{label}</p> : null}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
