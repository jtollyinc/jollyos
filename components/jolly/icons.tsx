"use client";

/**
 * components/jolly/icons — lucide icons by NAME.
 * Module manifests are plain data that crosses the server → client boundary,
 * so they name their icon as a string and this map turns it into a component.
 * Add a line here when a manifest needs a new icon.
 */
import {
  Bot, Brain, LayoutDashboard, Layers, ListChecks, Mic, Newspaper, Settings, Sparkles, UserRound,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import type { IconName } from "@/lib/modules/types";

const ICONS: Record<IconName, ComponentType<LucideProps>> = {
  home: LayoutDashboard,
  bot: Bot,
  newspaper: Newspaper,
  user: UserRound,
  sparkles: Sparkles,
  settings: Settings,
  "list-checks": ListChecks,
  mic: Mic,
  brain: Brain,
  layers: Layers,
};

export function Icon({ name, ...props }: LucideProps & { name: IconName }) {
  const Cmp = ICONS[name] ?? Layers;
  return <Cmp {...props} />;
}
