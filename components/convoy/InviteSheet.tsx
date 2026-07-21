import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useType } from "@/hooks/useType";
import * as haptics from "@/lib/haptics";

interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  code: string;
  convoyName: string;
}

export default function InviteSheet({
  visible,
  onClose,
  code,
  convoyName,
}: InviteSheetProps) {
  const colors = useColors();
  const type = useType();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState<boolean>(false);

  const message = `Join my convoy "${convoyName}" — invite code: ${code}`;

  const flashCopied = useCallback(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const handleShare = useCallback(async () => {
    haptics.tapLight();
    if (Platform.OS === "web") {
      try {
        const nav = typeof navigator !== "undefined" ? navigator : undefined;
        if (nav && typeof (nav as Navigator).share === "function") {
          await (nav as Navigator).share({ text: message });
          return;
        }
        if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(code);
          flashCopied();
        }
      } catch {
        // user cancelled / unsupported — ignore
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      // user cancelled — ignore
    }
  }, [message, code, flashCopied]);

  const handleCopy = useCallback(async () => {
    haptics.tapLight();
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          flashCopied();
          return;
        }
      } catch {
        // fall through to share
      }
    }
    // Native has no bundled clipboard module — fall back to the share sheet,
    // which exposes a "Copy" action on every platform.
    try {
      await Share.share({ message: code });
    } catch {
      // ignore
    }
  }, [code, message, flashCopied]);

  const s = styles(colors);
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: bottomInset + 24 }]}>
        <View style={s.handle} />

        <View style={s.titleRow}>
          <View style={s.titleIcon}>
            <Ionicons name="person-add" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { fontFamily: type.displayBold }]}>
              Invite to convoy
            </Text>
            <Text
              style={[s.subtitle, { fontFamily: type.regular }]}
              numberOfLines={1}
            >
              Share this code so friends can join {convoyName}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={s.codeBox}>
          <Text style={[s.codeLabel, { fontFamily: type.mono }]}>
            INVITE CODE
          </Text>
          <Text selectable style={[s.code, { fontFamily: type.monoMedium }]}>
            {code}
          </Text>
        </View>

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.actionBtn, s.shareBtn]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Ionicons
              name="share-outline"
              size={20}
              color={colors.onPrimary}
            />
            <Text
              style={[
                s.shareLabel,
                { color: colors.onPrimary, fontFamily: type.semibold },
              ]}
            >
              Share invite
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.copyBtn]}
            onPress={handleCopy}
            activeOpacity={0.85}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={20}
              color={copied ? colors.success : colors.text}
            />
            <Text
              style={[
                s.copyLabel,
                {
                  color: copied ? colors.success : colors.text,
                  fontFamily: type.semibold,
                },
              ]}
            >
              {copied ? "Copied" : "Copy"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.scrim },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: colors.radiusXl,
      borderTopRightRadius: colors.radiusXl,
      padding: 20,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 18,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    titleIcon: {
      width: 40,
      height: 40,
      borderRadius: colors.radiusSm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "1F",
    },
    title: { fontSize: 18, color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    codeBox: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingVertical: 22,
      paddingHorizontal: 16,
      alignItems: "center",
      marginBottom: 16,
    },
    codeLabel: {
      fontSize: 11,
      letterSpacing: 2,
      color: colors.textMuted,
      marginBottom: 10,
    },
    code: {
      fontSize: 38,
      letterSpacing: 6,
      color: colors.primary,
    },
    actions: { flexDirection: "row", gap: 10 },
    actionBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 15,
      borderRadius: colors.radius,
    },
    shareBtn: { backgroundColor: colors.primary },
    shareLabel: { fontSize: 15 },
    copyBtn: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    copyLabel: { fontSize: 15 },
  });
}
