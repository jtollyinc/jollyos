import { Cloud, Globe, Lock } from "lucide-react";
import { Chip } from "@/components/jolly/Foundation";
import type { Privacy } from "@/lib/providers/types";

/** The same three marks everywhere a privacy tag is shown. */
export function PrivacyChip({ privacy }: { privacy: Privacy }) {
  if (privacy === "local-only") return <Chip tone="warning" icon={Lock}>local only</Chip>;
  if (privacy === "public") return <Chip tone="success" icon={Globe}>public</Chip>;
  return <Chip tone="info" icon={Cloud}>cloud ok</Chip>;
}
