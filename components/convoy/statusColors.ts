import { Ionicons } from "@expo/vector-icons";
import type { ConvoyStatus } from "@/context/ConvoyContext";

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Semantic status tones — these carry MEANING (not theme chrome) so they stay
 * consistent across all four themes. `stopped` intentionally uses the active
 * theme's primary, so it is resolved at call time via `statusColor()`.
 */
const STATUS_HEX: Record<Exclude<ConvoyStatus, "stopped">, string> = {
  moving: "#34d399",
  stuck: "#fbbf24",
  retry: "#38bdf8",
  help: "#f43f5e",
};

/** The HELP emergency tone — exported for the hold button + urgent rows. */
export const HELP_COLOR = STATUS_HEX.help;

/** Resolve a status to its tone. `stopped` adopts the theme's primary. */
export function statusColor(status: ConvoyStatus, primary: string): string {
  return status === "stopped" ? primary : STATUS_HEX[status];
}

/** Human label for a status. */
export function statusLabel(status: ConvoyStatus): string {
  switch (status) {
    case "moving":
      return "Moving";
    case "stopped":
      return "Stopped";
    case "stuck":
      return "Stuck";
    case "retry":
      return "2nd try";
    case "help":
      return "HELP";
  }
}

/** Ionicon glyph for a status. */
export const STATUS_GLYPH: Record<ConvoyStatus, IoniconName> = {
  moving: "navigate",
  stopped: "pause",
  stuck: "warning",
  retry: "refresh",
  help: "alert-circle",
};

/** The four selectable, non-emergency statuses (HELP is the hold button). */
export const NORMAL_STATUSES: Exclude<ConvoyStatus, "help">[] = [
  "moving",
  "stopped",
  "stuck",
  "retry",
];
