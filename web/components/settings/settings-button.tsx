"use client";

import { Sliders } from "lucide-react";

interface SettingsButtonProps {
  onOpen: () => void;
}

export function SettingsButton({ onOpen }: SettingsButtonProps) {
  return (
    <button
      type="button"
      className="flex h-9 items-center gap-2 rounded border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/90 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
      aria-label="Open settings"
    >
      <Sliders className="h-4 w-4" />
      Settings
    </button>
  );
}

