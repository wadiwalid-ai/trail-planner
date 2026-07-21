import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Thin wrappers around expo-haptics that are safe to call on every platform.
 * On web these are no-ops. Use these everywhere instead of calling expo-haptics
 * directly so motion/feedback stays consistent across the cockpit UI.
 */

const enabled = Platform.OS === "ios" || Platform.OS === "android";

export function tapLight() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function tapMedium() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function tapHeavy() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

export function notifySuccess() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function notifyWarning() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export function notifyError() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function selection() {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}
