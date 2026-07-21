import { Stack } from "expo-router";

export default function ConvoyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: "card" }} />
      <Stack.Screen name="join" options={{ presentation: "card" }} />
    </Stack>
  );
}
