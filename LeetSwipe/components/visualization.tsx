/**
 * Draws the data structure a reel step is operating on.
 *
 * One component per shape, dispatched on `visualization.kind`. Everything is
 * plain Views — no canvas, no SVG — because these are small, regular layouts and
 * React Native's flexbox draws them faster than a drawing surface would, on the
 * web build too.
 *
 * Cells animate on status change rather than on mount, so stepping through a
 * reel reads as one structure evolving instead of a new picture each time.
 */
import { useEffect, useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import type { VizCell, VizEdge, VizNode, VizStatus, Visualization } from '@/api/reels';
import { COLORS } from '@/constants/colors';

/** Status → fill, border, and text. `eliminated` recedes; `found` celebrates. */
const STATUS_STYLE: Record<VizStatus, { bg: string; border: string; text: string }> = {
  normal: { bg: COLORS.card, border: COLORS.border, text: COLORS.text },
  active: { bg: '#1d3a5f', border: COLORS.accent, text: '#cfe4ff' },
  visited: { bg: '#1a2430', border: '#33415280', text: COLORS.muted },
  eliminated: { bg: '#141922', border: '#242c38', text: '#4d5967' },
  found: { bg: '#14402c', border: COLORS.correct, text: '#8ff0bb' },
};

function styleFor(status?: VizStatus) {
  return STATUS_STYLE[status ?? 'normal'] ?? STATUS_STYLE.normal;
}

/**
 * A cell that eases into its new colours when its status changes.
 *
 * The animation is driven by a counter rather than the status string so that
 * re-entering a status (active → visited → active) still animates.
 */
function AnimatedCell({ cell, size }: { cell: VizCell; size: number }) {
  const palette = styleFor(cell.status);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [cell.status, cell.value, enter]);

  const scale = enter.interpolate({
    inputRange: [0, 1],
    // Only the cell the current line touches pops; the rest settle quietly.
    outputRange: [cell.status === 'active' || cell.status === 'found' ? 0.82 : 0.97, 1],
  });

  return (
    <View style={styles.cellColumn}>
      <Animated.View
        style={[
          styles.cell,
          {
            width: size,
            height: size,
            backgroundColor: palette.bg,
            borderColor: palette.border,
            transform: [{ scale }],
            opacity: cell.status === 'eliminated' ? 0.45 : 1,
          },
        ]}>
        <Text
          numberOfLines={1}
          style={[styles.cellText, { color: palette.text, fontSize: size > 44 ? 16 : 13 }]}>
          {String(cell.value)}
        </Text>
      </Animated.View>
      {/* Reserve the label row always, so cells don't jump as pointers move. */}
      <Text numberOfLines={1} style={styles.cellLabel}>
        {cell.label ?? ''}
      </Text>
    </View>
  );
}

function CellRow({ cells, horizontal }: { cells: VizCell[]; horizontal?: boolean }) {
  // Size cells from the actual screen so the whole row fits without clipping —
  // a fixed size overflowed and cut the edge cells on 375px-wide phones.
  const { width } = useWindowDimensions();
  const gap = 6;
  const available = Math.min(width, 460) - 56 - (cells.length - 1) * gap;
  const size = Math.max(26, Math.min(52, Math.floor(available / Math.max(cells.length, 1))));
  const body = (
    <View style={styles.row}>
      {cells.map((cell, i) => (
        <AnimatedCell key={`${i}-${cell.value}`} cell={cell} size={size} />
      ))}
    </View>
  );
  // Scroll only remains as a fallback for pathological cell counts.
  if (!horizontal || size > 26) return body;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
      {body}
    </ScrollView>
  );
}

/** A queue, drawn with its ends labelled — the whole point of BFS is the order. */
function QueueView({ cells }: { cells: VizCell[] }) {
  if (cells.length === 0) {
    return <Text style={styles.emptyNote}>queue empty</Text>;
  }
  return (
    <View style={styles.queueWrap}>
      <Text style={styles.endLabel}>front</Text>
      <CellRow cells={cells} horizontal />
      <Text style={styles.endLabel}>back</Text>
    </View>
  );
}

/**
 * A tree or small graph.
 *
 * Nodes are placed by breadth level derived from the edge list, which keeps the
 * layout honest for the trees and tiny graphs reels actually use, and avoids
 * pulling in a force-directed layout library for five nodes.
 */
function GraphView({ nodes, edges }: { nodes: VizNode[]; edges: VizEdge[] }) {
  const levels: string[][] = [];
  const placed = new Set<string>();
  const childrenOf = (id: string) => edges.filter((e) => e.from === id).map((e) => e.to);

  const roots = nodes.filter((n) => !edges.some((e) => e.to === n.id)).map((n) => n.id);
  let frontier = roots.length ? roots : nodes.slice(0, 1).map((n) => n.id);
  while (frontier.length && levels.length < 6) {
    levels.push(frontier);
    frontier.forEach((id) => placed.add(id));
    frontier = [...new Set(frontier.flatMap(childrenOf))].filter((id) => !placed.has(id));
  }
  // Anything unreachable still gets drawn rather than silently disappearing.
  const orphans = nodes.filter((n) => !placed.has(n.id)).map((n) => n.id);
  if (orphans.length) levels.push(orphans);

  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <View style={styles.graphWrap}>
      {levels.map((level, depth) => (
        <View key={depth} style={styles.graphLevel}>
          {depth > 0 && <View style={styles.levelConnector} />}
          <View style={styles.row}>
            {level.map((id) => {
              const node = byId.get(id);
              if (!node) return null;
              const palette = styleFor(node.status);
              return (
                <View
                  key={id}
                  style={[
                    styles.node,
                    { backgroundColor: palette.bg, borderColor: palette.border },
                  ]}>
                  <Text style={[styles.cellText, { color: palette.text }]}>{String(node.value)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A comparison table — used by the "why is this O(n)" closing steps. */
function TableView({
  columns,
  rows,
  highlight,
}: {
  columns: string[];
  rows: (string | number)[][];
  highlight: number;
}) {
  return (
    <View style={styles.table}>
      <View style={[styles.tableRow, styles.tableHead]}>
        {columns.map((c) => (
          <Text key={c} style={[styles.tableCell, styles.tableHeadCell]} numberOfLines={2}>
            {c}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[styles.tableRow, i === highlight && styles.tableRowActive]}>
          {row.map((cell, j) => (
            <Text
              key={j}
              numberOfLines={2}
              style={[styles.tableCell, i === highlight && styles.tableCellActive]}>
              {String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function VisualizationView({ viz }: { viz: Visualization }) {
  const { kind, state, caption } = viz;

  let body: React.ReactNode = null;
  switch (kind) {
    case 'array':
    case 'stack':
    case 'linkedlist':
      body = <CellRow cells={state.cells ?? []} horizontal />;
      break;
    case 'queue':
      body = <QueueView cells={state.cells ?? []} />;
      break;
    case 'matrix':
      body = (
        <View>
          {(state.rows ?? []).map((row, i) => (
            <CellRow key={i} cells={row.map((v) => ({ value: v }))} />
          ))}
        </View>
      );
      break;
    case 'tree':
    case 'graph':
      body = <GraphView nodes={state.nodes ?? []} edges={state.edges ?? []} />;
      break;
    case 'table':
      body = (
        <TableView
          columns={state.columns ?? []}
          rows={state.rows ?? []}
          highlight={state.highlight ?? -1}
        />
      );
      break;
    case 'none':
    default:
      body = null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.body}>{body}</View>
      {!!caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', minHeight: 150 },
  body: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  scrollRow: { paddingHorizontal: 4, alignItems: 'center' },
  cellColumn: { alignItems: 'center' },
  cell: {
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  cellLabel: {
    marginTop: 4,
    height: 14,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent,
  },
  emptyNote: { color: COLORS.muted, fontStyle: 'italic', fontSize: 13 },
  queueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  endLabel: { color: COLORS.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  graphWrap: { alignItems: 'center' },
  graphLevel: { alignItems: 'center' },
  levelConnector: { width: 1.5, height: 16, backgroundColor: COLORS.border },
  node: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    overflow: 'hidden',
    minWidth: 260,
  },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border },
  tableHead: { borderTopWidth: 0, backgroundColor: '#141922' },
  tableRowActive: { backgroundColor: '#1d3a5f' },
  tableCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
  },
  tableHeadCell: { color: COLORS.text, fontWeight: '700', fontSize: 11 },
  tableCellActive: { color: '#cfe4ff', fontWeight: '700' },
  caption: {
    marginTop: 14,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
