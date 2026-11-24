import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@/lib/types";

/** Icon next to the source label on a skill card. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Sparkles",
  community: "Globe",
};
