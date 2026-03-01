"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import {
  Activity,
  Bookmark,
  Brain,
  Briefcase,
  Code,
  Coins,
  Eye,
  Flame,
  Globe,
  Hash,
  Heart,
  Lightbulb,
  MessageCircle,
  Microscope,
  Music,
  Newspaper,
  Radar,
  Rocket,
  Shield,
  Star,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Curated set of icons suitable for watchlist identification.
 * Each entry maps a lowercase key (stored in DB) to its Lucide component.
 */
export const WATCHLIST_ICONS: Record<string, LucideIcon> = {
  eye: Eye,
  radar: Radar,
  brain: Brain,
  zap: Zap,
  star: Star,
  heart: Heart,
  flame: Flame,
  rocket: Rocket,
  target: Target,
  shield: Shield,
  globe: Globe,
  users: Users,
  bookmark: Bookmark,
  "trending-up": TrendingUp,
  activity: Activity,
  lightbulb: Lightbulb,
  "message-circle": MessageCircle,
  code: Code,
  coins: Coins,
  briefcase: Briefcase,
  newspaper: Newspaper,
  microscope: Microscope,
  music: Music,
  hash: Hash,
} as const;

export const WATCHLIST_ICON_KEYS = Object.keys(
  WATCHLIST_ICONS,
) as (keyof typeof WATCHLIST_ICONS)[];

/** Resolve icon key to Lucide component. Falls back to Eye. */
export function resolveIcon(key: string): LucideIcon {
  return WATCHLIST_ICONS[key] ?? Eye;
}

// ---------------------------------------------------------------------------
// IconPicker component
// ---------------------------------------------------------------------------

interface IconPickerProps {
  value: string;
  onChange: (iconKey: string) => void;
  /** Tailwind bg class for the trigger badge (e.g. from getAvatarColor) */
  color?: string;
  disabled?: boolean;
}

export function IconPicker({
  value,
  onChange,
  color = "bg-blue-500",
  disabled = false,
}: IconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const Icon = resolveIcon(value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="icon"
          className={cn(
            "relative size-10 rounded-lg",
            color,
            "text-white hover:text-white hover:opacity-90",
          )}
          aria-label="Pick an icon"
        >
          <Icon className="size-5" strokeWidth={1.5} />
        </Button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          className={cn(
            "z-50 rounded-lg border bg-background p-3 shadow-md outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "w-[280px]",
          )}
        >
          <div className="grid grid-cols-6 gap-1">
            {WATCHLIST_ICON_KEYS.map((key) => {
              const ItemIcon = WATCHLIST_ICONS[key]!;
              const isSelected = key === value;
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "flex items-center justify-center rounded-md p-2 transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected &&
                      "ring-2 ring-primary bg-accent text-accent-foreground",
                  )}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  aria-label={key}
                  title={key}
                >
                  <ItemIcon className="size-4" strokeWidth={1.5} />
                </button>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
