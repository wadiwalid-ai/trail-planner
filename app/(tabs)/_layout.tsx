import { Tabs } from "expo-router";
import React from "react";
import { AppTabBar } from "@/components/AppTabBar";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Explore" }} />
      <Tabs.Screen name="plan" options={{ title: "AI Planner" }} />
      <Tabs.Screen name="record" options={{ title: "Record" }} />
      <Tabs.Screen name="trips" options={{ title: "My Trips" }} />
      <Tabs.Screen name="gear" options={{ title: "Gear", href: null }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
