// src/components/shared/LoadingSpinner.tsx
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface LoadingSpinnerProps {
  fullScreen?: boolean;
  className?: string;
}

export function LoadingSpinner({ fullScreen, className }: LoadingSpinnerProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-center",
        fullScreen && "fixed inset-0 bg-white/80 z-50",
        !fullScreen && "py-12",
        className
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
    </div>
  );
}
