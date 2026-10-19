"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The button of a read (epic #154: « Réessayer », « Actualiser »), `outline`, 44 px. While
 * it reads, its label stays and its icon turns; it is `aria-disabled`, never `disabled`, so
 * it keeps the focus (O5.8), and a press then starts nothing.
 */
export function ReadButton({
  reading,
  onRead,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "disabled"> & { reading: boolean; onRead: () => void }) {
  return (
    <Button
      {...props}
      variant="outline"
      aria-disabled={reading || undefined}
      onClick={() => {
        if (!reading) onRead();
      }}
      className={cn("h-11 gap-2 px-3", className)}
    >
      {reading ? <LoaderCircle aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
      {children}
    </Button>
  );
}
