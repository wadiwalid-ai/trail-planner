import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import Svg, {
  Path,
  Rect,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useUnits } from "@/context/UnitsContext";
import {
  buildProfile,
  type TrackPoint,
  type TechnicalSection,
} from "@/lib/trackAnalysis";

const CHART_HEIGHT = 120;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 6;

type Metric = "elevation" | "speed";

const TECHNICAL_COLOR = "#C0392B";

function buildAreaPath(
  pts: { x: number; y: number | null }[],
  width: number,
  height: number,
): { line: string; area: string } {
  let line = "";
  let area = "";
  let started = false;
  let firstX = 0;
  let lastX = 0;
  for (const p of pts) {
    if (p.y == null) continue;
    if (!started) {
      line += `M ${p.x} ${p.y}`;
      area += `M ${p.x} ${height} L ${p.x} ${p.y}`;
      firstX = p.x;
      started = true;
    } else {
      line += ` L ${p.x} ${p.y}`;
      area += ` L ${p.x} ${p.y}`;
    }
    lastX = p.x;
  }
  if (started) {
    area += ` L ${lastX} ${height} L ${firstX} ${height} Z`;
  }
  return { line, area };
}

function Chart({
  samples,
  technical,
  totalDistance,
  color,
  testID,
}: {
  samples: { distanceMeters: number; value: number | null }[];
  technical: { startD: number; endD: number }[];
  totalDistance: number;
  color: string;
  testID?: string;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);

  const values = samples
    .map((s) => s.value)
    .filter((v): v is number => v != null);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const range = maxV - minV || 1;

  const innerW = Math.max(width - PAD_X * 2, 1);
  const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const distSpan = totalDistance || 1;

  const xFor = (d: number) => PAD_X + (d / distSpan) * innerW;
  const yFor = (v: number) =>
    PAD_TOP + innerH - ((v - minV) / range) * innerH;

  const projected = samples.map((s) => ({
    x: xFor(s.distanceMeters),
    y: s.value == null ? null : yFor(s.value),
  }));

  const { line, area } = buildAreaPath(projected, width, PAD_TOP + innerH);

  const gradId = `grad-${testID ?? color.replace("#", "")}`;

  return (
    <View
      style={{ height: CHART_HEIGHT }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      testID={testID}
    >
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.32} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* baseline grid */}
          {[0.25, 0.5, 0.75].map((f) => (
            <Line
              key={f}
              x1={PAD_X}
              x2={width - PAD_X}
              y1={PAD_TOP + innerH * f}
              y2={PAD_TOP + innerH * f}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="3 4"
            />
          ))}

          {/* technical section highlight bands */}
          {technical.map((t, i) => {
            const x1 = xFor(t.startD);
            const x2 = xFor(t.endD);
            return (
              <Rect
                key={i}
                x={x1}
                y={PAD_TOP}
                width={Math.max(x2 - x1, 2)}
                height={innerH}
                fill={TECHNICAL_COLOR}
                opacity={0.14}
              />
            );
          })}

          {area ? <Path d={area} fill={`url(#${gradId})`} /> : null}
          {line ? (
            <Path d={line} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
          ) : null}
        </Svg>
      )}
    </View>
  );
}

export default function TrackProfile({
  points,
  technical,
  accentColor,
}: {
  points: TrackPoint[];
  technical: TechnicalSection[];
  accentColor: string;
}) {
  const colors = useColors();
  const units = useUnits();
  const [metric, setMetric] = useState<Metric>("elevation");

  const profile = useMemo(() => buildProfile(points), [points]);
  const totalDistance =
    profile.length > 0 ? profile[profile.length - 1].distanceMeters : 0;

  const technicalBands = useMemo(
    () =>
      technical.map((t) => ({
        startD: profile[t.startIdx]?.distanceMeters ?? 0,
        endD: profile[t.endIdx]?.distanceMeters ?? 0,
      })),
    [technical, profile],
  );

  const hasElevation = profile.some((p) => p.altitudeMeters != null);
  const hasSpeed = profile.some((p) => p.speedMps != null);

  // Auto-pick a metric that actually has data.
  const activeMetric: Metric =
    metric === "elevation" && !hasElevation && hasSpeed
      ? "speed"
      : metric === "speed" && !hasSpeed && hasElevation
        ? "elevation"
        : metric;

  if (!hasElevation && !hasSpeed) {
    return null;
  }

  const samples = profile.map((p) => ({
    distanceMeters: p.distanceMeters,
    value: activeMetric === "elevation" ? p.altitudeMeters : p.speedMps,
  }));

  const values = samples
    .map((s) => s.value)
    .filter((v): v is number => v != null);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 0;

  const fmtV = (v: number) =>
    activeMetric === "elevation"
      ? units.formatElevation(v) ?? `${Math.round(v)} m`
      : units.formatSpeed(v) ?? `${v.toFixed(1)} m/s`;

  const s = styles(colors);

  return (
    <View>
      {/* Metric toggle */}
      <View style={s.toggleRow}>
        {(["elevation", "speed"] as Metric[]).map((m) => {
          const disabled = m === "elevation" ? !hasElevation : !hasSpeed;
          const active = activeMetric === m;
          return (
            <Text
              key={m}
              onPress={disabled ? undefined : () => setMetric(m)}
              style={[
                s.toggleChip,
                {
                  color: active ? "#fff" : colors.textSecondary,
                  backgroundColor: active ? accentColor : colors.surface,
                  borderColor: active ? accentColor : colors.border,
                  opacity: disabled ? 0.4 : 1,
                },
              ]}
              testID={`profile-toggle-${m}`}
            >
              {m === "elevation" ? "Elevation" : "Speed"}
            </Text>
          );
        })}
        {technical.length > 0 && (
          <View style={s.legendItem}>
            <View style={[s.legendSwatch, { backgroundColor: TECHNICAL_COLOR }]} />
            <Text style={[s.legendText, { color: colors.textMuted }]}>Technical</Text>
          </View>
        )}
      </View>

      <View style={s.axisRow}>
        <Text style={[s.axisLabel, { color: colors.textMuted }]}>{fmtV(maxV)}</Text>
      </View>

      <Chart
        samples={samples}
        technical={technicalBands}
        totalDistance={totalDistance}
        color={accentColor}
        testID={`profile-chart-${activeMetric}`}
      />

      <View style={s.axisRowBetween}>
        <Text style={[s.axisLabel, { color: colors.textMuted }]}>{fmtV(minV)}</Text>
        <Text style={[s.axisLabel, { color: colors.textMuted }]}>
          {units.formatDistance(totalDistance) ?? `${(totalDistance / 1000).toFixed(1)} km`}
        </Text>
      </View>
    </View>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    toggleChip: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      overflow: "hidden",
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: "auto",
    },
    legendSwatch: { width: 12, height: 12, borderRadius: 3, opacity: 0.5 },
    legendText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    axisRow: { marginBottom: 2 },
    axisRowBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 2,
    },
    axisLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  });
}
