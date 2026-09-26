"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  toggleParticipationFilter,
  type ParticipationFilter,
} from "@/lib/slices/filtersSlice";
import { resetSelectedDateRange } from "@/lib/slices/filesSlice";
import {
  FLOW_MODE_MIN_WIDTH,
  layoutFlow,
  layoutRail,
  type FlowMode,
} from "@/components/participation-flow/layout";
import {
  ancestorsOf,
  descendantsOf,
  flatten,
  FLOW_TREES,
  type FlowNode,
} from "@/components/participation-flow/tree";
import { FlowEdges } from "@/components/participation-flow/FlowEdges";
import { FlowNodeCard } from "@/components/participation-flow/FlowNodeCard";

interface ParticipationFlowChartProps {
  onClearAssociation?: () => void;
  /** Docket-deduped node counts from fetchParticipationCounts, keyed by node id. */
  serverCounts?: FlowCounts | null;
}

/** Counts keyed by FlowNode.id. */
export type FlowCounts = Record<string, number>;

/** Stable identity, so an unanswered server query does not re-render the tree. */
const EMPTY_COUNTS: FlowCounts = {};

/** Tracks the chart's own width so the layout can adapt to sidebar resizing. */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

interface SubtreeProps {
  tree: FlowNode;
  heading: string;
  tone: string;
  counts: FlowCounts;
  mode: FlowMode;
  containerWidth: number;
  isActive: (filter: ParticipationFilter) => boolean;
  onSelect: (tree: FlowNode, node: FlowNode) => void;
}

function FlowSubtree({
  tree,
  heading,
  tone,
  counts,
  mode,
  containerWidth,
  isActive,
  onSelect,
}: SubtreeProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      mode === "flow" ? layoutFlow(tree) : layoutRail(tree, containerWidth),
    [tree, mode, containerWidth],
  );

  const parentCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const node of flatten(tree)) {
      for (const kid of node.children ?? []) {
        map[kid.id] = counts[node.id] ?? 0;
      }
    }
    return map;
  }, [tree, counts]);

  const { edgeColors, activeIds, emptyIds } = useMemo(() => {
    const colors: Record<string, string> = {};
    const active = new Set<string>();
    const empty = new Set<string>();
    for (const node of flatten(tree)) {
      colors[node.id] = node.edge;
      if (isActive(node.filter)) active.add(node.id);
      if ((counts[node.id] ?? 0) === 0) empty.add(node.id);
    }
    return { edgeColors: colors, activeIds: active, emptyIds: empty };
  }, [tree, counts, isActive]);

  return (
    <div className="space-y-2">
      <div
        className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}
      >
        {heading}
      </div>
      <div className={mode === "flow" ? "overflow-x-auto pb-1" : ""}>
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          <FlowEdges
            layout={layout}
            edgeColors={edgeColors}
            activeIds={activeIds}
            emptyIds={emptyIds}
            hoveredId={hoveredId}
          />
          {layout.nodes.map((positioned) => {
            const id = positioned.node.id;
            const count = counts[id] ?? 0;
            const parentCount = parentCountById[id];
            const share =
              parentCount === undefined || parentCount === 0
                ? null
                : Math.round((count / parentCount) * 100);
            return (
              <FlowNodeCard
                key={id}
                positioned={positioned}
                mode={mode}
                count={count}
                share={share}
                active={isActive(positioned.node.filter)}
                onSelect={() => onSelect(tree, positioned.node)}
                onHover={setHoveredId}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ParticipationFlowChart({
  onClearAssociation,
  serverCounts = null,
}: ParticipationFlowChartProps) {
  const dispatch = useAppDispatch();
  const participationFilters = useAppSelector(
    (s) => s.filters.participationFilters,
  );
  const [containerRef, containerWidth] = useMeasuredWidth();

  // Server-only. There is no client fallback: it was a second implementation of
  // the whole funnel that never ran in production (the EPC pages pass no rows)
  // and that could not see the ancestor chain the counts query now applies.
  const counts = serverCounts ?? EMPTY_COUNTS;

  const isActive = useCallback(
    (filter: ParticipationFilter) => participationFilters.includes(filter),
    [participationFilters],
  );

  /**
   * One handler for every node. Ancestry now comes from the tree data itself,
   * replacing the two hand-maintained parentMap/childrenMap tables and the
   * duplicate handleFinancialWeClick the previous version carried.
   */
  const handleSelect = useCallback(
    (tree: FlowNode, node: FlowNode) => {
      const turningOff = participationFilters.includes(node.filter);

      if (turningOff) {
        // Clearing a node also clears everything below it, so the filter set
        // can never be left narrowed by an orphaned descendant.
        const doomed = [
          node.filter,
          ...descendantsOf(tree, node.id).map((n) => n.filter),
        ];
        for (const filter of doomed) {
          if (participationFilters.includes(filter)) {
            dispatch(toggleParticipationFilter(filter));
          }
        }
      } else {
        if (!participationFilters.includes("participatedTotal")) {
          dispatch(toggleParticipationFilter("participatedTotal"));
        }
        const needed = [
          ...ancestorsOf(tree, node.id).map((n) => n.filter),
          node.filter,
        ];
        for (const filter of needed) {
          if (!participationFilters.includes(filter)) {
            dispatch(toggleParticipationFilter(filter));
          }
        }
      }

      dispatch(resetSelectedDateRange());
      onClearAssociation?.();
    },
    [dispatch, participationFilters, onClearAssociation],
  );

  const mode: FlowMode =
    containerWidth >= FLOW_MODE_MIN_WIDTH ? "flow" : "rail";

  return (
    <div ref={containerRef} className="space-y-5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
        Participation Flow
      </div>

      {containerWidth > 0 &&
        FLOW_TREES.map(({ tree, heading, tone }) => (
          <FlowSubtree
            key={tree.id}
            tree={tree}
            heading={heading}
            tone={tone}
            counts={counts}
            mode={mode}
            containerWidth={containerWidth}
            isActive={isActive}
            onSelect={handleSelect}
          />
        ))}
    </div>
  );
}
