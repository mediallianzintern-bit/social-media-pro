// Client-safe presentation metadata. Colour is referenced by CSS variable so
// light/dark swap in one place (see the chart tokens in styles.css) — the slot
// order is fixed and must never be re-mapped.
import { Instagram, Linkedin, type LucideIcon } from "lucide-react";

import type { PlatformId } from "@/lib/analytics-types";

export interface PlatformMeta {
  id: PlatformId;
  label: string;
  icon: LucideIcon;
  /** CSS variable holding this platform's series colour. */
  color: string;
  route: string;
  provider: string;
  docsUrl: string;
}

export const PLATFORM_META: Record<PlatformId, PlatformMeta> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    color: "var(--chart-1)",
    route: "/instagram",
    provider: "apify/instagram-profile-scraper",
    docsUrl: "https://apify.com/apify/instagram-profile-scraper",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    color: "var(--chart-2)",
    route: "/linkedin",
    provider: "harvestapi/linkedin-profile-scraper",
    docsUrl: "https://apify.com/harvestapi/linkedin-profile-scraper",
  },
};
