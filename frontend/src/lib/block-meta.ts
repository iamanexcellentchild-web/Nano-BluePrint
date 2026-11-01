import type { Library } from "./types";
import {
  Activity,
  Database,
  GitBranch,
  Plug,
  Settings2,
  Table2,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";

const byCategory: Record<string, LucideIcon> = {
  data: Database,
  actor: UserRound,
  trigger: Zap,
  logic: GitBranch,
  action: Activity,
  integration: Plug,
};

const byType: Record<string, LucideIcon> = {
  entity: Table2,
  actor: UserRound,
  event: Zap,
  condition: GitBranch,
};

/** Block types get a specific icon when we know one, otherwise their category's. */
export const iconFor = (blockType: string, category: string): LucideIcon =>
  byType[blockType] ?? byCategory[category] ?? Settings2;

const FALLBACK_COLOR = "#667085";

export const categoryColor = (library: Library | null, category: string): string =>
  library?.categories[category]?.color ?? FALLBACK_COLOR;
