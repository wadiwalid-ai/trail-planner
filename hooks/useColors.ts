import themes from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

export function useColors() {
  const { themeName } = useTheme();
  return themes[themeName];
}
