import { themeFonts, type ThemeFont } from "@/constants/typography";
import { useTheme } from "@/context/ThemeContext";

// Returns the active theme's font-family roles. Pair with useColors().
export function useType(): ThemeFont {
  const { themeName } = useTheme();
  return themeFonts[themeName];
}
