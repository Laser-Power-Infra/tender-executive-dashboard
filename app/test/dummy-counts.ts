/**
 * Node counts for the /test flow-chart preview.
 *
 * The chart takes counts straight from fetchParticipationCounts, so the preview
 * feeds it the same shape rather than dummy rows: each scenario names its leaf
 * counts and build() rolls them up the tree exactly as the server does.
 */
import type { FlowCounts } from "@/components/ParticipationFlowChart";

interface Leaves {
  raL1Contract: number;
  raL1Pending: number;
  raLost: number;
  raPendingWithDate: number;
  raPendingNoDate: number;
  finL1Contract: number;
  finL1Pending: number;
  finLost: number;
  finNotOpen: number;
  techNotOpen: number;
}

function build(l: Leaves): FlowCounts {
  const weL1 = l.raL1Contract + l.raL1Pending;
  const raDone = weL1 + l.raLost;
  const raPending = l.raPendingWithDate + l.raPendingNoDate;
  const financialWeL1 = l.finL1Contract + l.finL1Pending;
  const financialOpen = financialWeL1 + l.finLost;
  const technicalOpen = financialOpen + l.finNotOpen;

  return {
    withRa: raDone + raPending,
    raDone,
    weL1,
    contractReceived: l.raL1Contract,
    contractPending: l.raL1Pending,
    weLost: l.raLost,
    raPending,
    expRaDate: l.raPendingWithDate,
    withoutRa: technicalOpen + l.techNotOpen,
    technicalOpen,
    financialOpen,
    financialWeL1,
    financialContractReceived: l.finL1Contract,
    financialContractPending: l.finL1Pending,
    financialWeLost: l.finLost,
    financialNotOpen: l.finNotOpen,
    technicalNotOpen: l.techNotOpen,
  };
}

export interface Scenario {
  key: string;
  label: string;
  description: string;
  counts: FlowCounts;
}

export const SCENARIOS: Scenario[] = [
  {
    key: "typical",
    label: "Typical",
    description: "Every branch populated with plausible volumes.",
    counts: build({
      raL1Contract: 12,
      raL1Pending: 19,
      raLost: 63,
      raPendingWithDate: 21,
      raPendingNoDate: 13,
      finL1Contract: 17,
      finL1Pending: 23,
      finLost: 50,
      finNotOpen: 60,
      techNotOpen: 60,
    }),
  },
  {
    key: "lopsided",
    label: "Lopsided",
    description:
      "Almost everything funnels into one leaf; several branches are zero.",
    counts: build({
      raL1Contract: 0,
      raL1Pending: 1,
      raLost: 2,
      raPendingWithDate: 0,
      raPendingNoDate: 0,
      finL1Contract: 0,
      finL1Pending: 0,
      finLost: 0,
      finNotOpen: 0,
      techNotOpen: 487,
    }),
  },
  {
    key: "large",
    label: "Large numbers",
    description: "Four-digit counts, to check number truncation and alignment.",
    counts: build({
      raL1Contract: 1204,
      raL1Pending: 987,
      raLost: 3310,
      raPendingWithDate: 1450,
      raPendingNoDate: 640,
      finL1Contract: 2201,
      finL1Pending: 1876,
      finLost: 4120,
      finNotOpen: 2988,
      techNotOpen: 3745,
    }),
  },
  {
    key: "sparse",
    label: "Sparse",
    description: "Single-digit counts with several empty leaves.",
    counts: build({
      raL1Contract: 1,
      raL1Pending: 0,
      raLost: 3,
      raPendingWithDate: 2,
      raPendingNoDate: 0,
      finL1Contract: 0,
      finL1Pending: 1,
      finLost: 4,
      finNotOpen: 0,
      techNotOpen: 2,
    }),
  },
  {
    key: "gap",
    label: "Sibling gap",
    description:
      "Children deliberately under-sum their parent, the real drop-off case: rejected and disqualified dockets match neither Technical Open nor Technical Not Open.",
    counts: {
      ...build({
        raL1Contract: 2,
        raL1Pending: 2,
        raLost: 8,
        raPendingWithDate: 1,
        raPendingNoDate: 2,
        finL1Contract: 6,
        finL1Pending: 10,
        finLost: 281,
        finNotOpen: 20,
        techNotOpen: 55,
      }),
      withoutRa: 403,
    },
  },
  {
    key: "empty",
    label: "Empty",
    description: "No counts at all - the chart must not produce NaN geometry.",
    counts: {},
  },
];
