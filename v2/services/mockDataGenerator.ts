import { EpcTenderRecord, CurrentStatus, ManagementDecision, TypeOfTender, EMDExchangeMode } from "@/types/tender";

/**
 * Generates a realistic dataset of 1,120 records to match the exact visual state of the mockup.
 * This includes the exact 5 records visible in the screenshot and balances the remaining 
 * 1,115 records to sum up precisely to the KPI cards.
 */
export const generateMockTenders = (): EpcTenderRecord[] => {
  const records: EpcTenderRecord[] = [];

  // 1. Add the exact 5 records visible in the screenshot
  const exactRecords: EpcTenderRecord[] = [
    {
      slNo: 1,
      docketNo: "D-2026-001",
      tenderSubmittedDate: new Date("2026-01-15"),
      tenderNoNitNo: "ONGC/2026/VALVE/44",
      nameOfTheClient: "ONGC Petro Additions",
      tenderFor: "Supply of Ball Valves",
      typeOfTender: TypeOfTender.OPEN,
      estimatedCostRs: 15000000, // 1.5 Cr
      emdAmountRs: 300000,
      lastDateOfSubmission: new Date("2026-01-14"),
      tenderOpeningDate: new Date("2026-01-15"),
      costOfTenderFeeRs: 10000,
      bidValidityDays: 90,
      contractPeriodDays: 180,
      managementDecision: ManagementDecision.GO,
      participated: true,
      tenderPrepareBy: "Arjun Mishra",
      currentStatus: CurrentStatus.SUBMITTED,
      reverseAuctionApplicable: true,
      reverseAuctionDate: new Date("2026-06-28"), // RA in 3 days
      emdPaymentMode: EMDExchangeMode.BG,
      bgNoUtrNo: "BG/ONGC/9981",
      emdValidity: new Date("2026-07-15"),
      loiPoNoAndDate: "-",
      remarks: "Primary bid submitted, waiting for technocommercial opening.",
      bidValidityExpired: false,
      diffPercentFromL1: null,
      diffPercentFromL2: null,
      reason: null,
      finalRemarks: null
    },
    {
      slNo: 2,
      docketNo: "D-2026-003",
      tenderSubmittedDate: new Date("2026-01-22"),
      tenderNoNitNo: "HPCL/V/123/EXP",
      nameOfTheClient: "HPCL Visakhapatnam",
      tenderFor: "Installation Services",
      typeOfTender: TypeOfTender.LIMITED,
      estimatedCostRs: 42000000, // 4.2 Cr
      emdAmountRs: 840000,
      lastDateOfSubmission: new Date("2026-01-20"),
      tenderOpeningDate: new Date("2026-01-24"),
      costOfTenderFeeRs: 25000,
      bidValidityDays: 120,
      contractPeriodDays: 240,
      managementDecision: ManagementDecision.GO,
      participated: true,
      tenderPrepareBy: "Sriya Iyer",
      currentStatus: CurrentStatus.WON,
      reverseAuctionApplicable: false,
      reverseAuctionDate: null,
      emdPaymentMode: EMDExchangeMode.NEFT,
      bgNoUtrNo: "UTR/HPCL/88212",
      emdValidity: new Date("2026-05-30"),
      loiPoNoAndDate: "PO/2026/001",
      remarks: "L1 bidder. PO received, project kickoff scheduled next week.",
      bidValidityExpired: false,
      diffPercentFromL1: -0.052, // -5.2%
      diffPercentFromL2: 0.021,  // +2.1%
      reason: "Cheapest sourcing of high-pressure valves.",
      finalRemarks: "Won. Contract execution initiated."
    },
    {
      slNo: 3,
      docketNo: "D-2026-015",
      tenderSubmittedDate: new Date("2026-02-05"),
      tenderNoNitNo: "GAIL/3A/822/P",
      nameOfTheClient: "GAIL India Ltd",
      tenderFor: "Control Units",
      typeOfTender: TypeOfTender.OPEN,
      estimatedCostRs: 8500000, // 0.85 Cr
      emdAmountRs: 170000,
      lastDateOfSubmission: new Date("2026-02-04"),
      tenderOpeningDate: new Date("2026-02-08"),
      costOfTenderFeeRs: 5000,
      bidValidityDays: 90,
      contractPeriodDays: 90,
      managementDecision: ManagementDecision.GO,
      participated: true,
      tenderPrepareBy: "Amit Shah",
      currentStatus: CurrentStatus.LOST,
      reverseAuctionApplicable: false,
      reverseAuctionDate: null,
      emdPaymentMode: EMDExchangeMode.BG,
      bgNoUtrNo: "BG/GAIL/4412",
      emdValidity: new Date("2026-05-10"),
      loiPoNoAndDate: "-",
      remarks: "Bid opened, placed L2 behind L1 by 12.4%. EMD release request sent.",
      bidValidityExpired: false,
      diffPercentFromL1: 0.124, // +12.4%
      diffPercentFromL2: 0.082, // +8.2%
      reason: "L1 had local manufacturing freight advantage.",
      finalRemarks: "Lost. Focus on improving logistics costing."
    },
    {
      slNo: 4,
      docketNo: "D-2026-022",
      tenderSubmittedDate: new Date("2026-02-12"),
      tenderNoNitNo: "REL/JAM/2026",
      nameOfTheClient: "Reliance Jamnagar",
      tenderFor: "Special Fittings",
      typeOfTender: TypeOfTender.NOMINATION,
      estimatedCostRs: 21000000, // 2.1 Cr
      emdAmountRs: 0,
      lastDateOfSubmission: new Date("2026-02-10"),
      tenderOpeningDate: new Date("2026-02-14"),
      costOfTenderFeeRs: 0,
      bidValidityDays: 180,
      contractPeriodDays: 360,
      managementDecision: ManagementDecision.GO,
      participated: true,
      tenderPrepareBy: "Vikram Seth",
      currentStatus: CurrentStatus.UNDER_EVALUATION,
      reverseAuctionApplicable: false,
      reverseAuctionDate: null,
      emdPaymentMode: EMDExchangeMode.EXEMPTED,
      bgNoUtrNo: "-",
      emdValidity: null,
      loiPoNoAndDate: "-",
      remarks: "Nomination bid. Price negotiation round completed. Awaiting final award.",
      bidValidityExpired: false,
      diffPercentFromL1: null,
      diffPercentFromL2: null,
      reason: null,
      finalRemarks: null
    },
    {
      slNo: 5,
      docketNo: "D-2026-030",
      tenderSubmittedDate: new Date("2026-02-20"),
      tenderNoNitNo: "IOCL/RE/20/VAL",
      nameOfTheClient: "Indian Oil Corp",
      tenderFor: "Valve Spare Parts",
      typeOfTender: TypeOfTender.OPEN,
      estimatedCostRs: 6500000, // 0.65 Cr
      emdAmountRs: 130000,
      lastDateOfSubmission: new Date("2026-02-18"),
      tenderOpeningDate: new Date("2026-02-22"),
      costOfTenderFeeRs: 2000,
      bidValidityDays: 60,
      contractPeriodDays: 45,
      managementDecision: ManagementDecision.GO,
      participated: true,
      tenderPrepareBy: "Sriya Iyer",
      currentStatus: CurrentStatus.RA_PENDING,
      reverseAuctionApplicable: true,
      reverseAuctionDate: new Date("2026-06-27"), // RA in 2 days
      emdPaymentMode: EMDExchangeMode.BG,
      bgNoUtrNo: "BG/IOCL/8821",
      emdValidity: new Date("2026-07-30"),
      loiPoNoAndDate: "-",
      remarks: "Shortlisted for reverse auction. Scheduled for 27-Jun.",
      bidValidityExpired: false,
      diffPercentFromL1: null,
      diffPercentFromL2: null,
      reason: null,
      finalRemarks: null
    }
  ];

  records.push(...exactRecords);

  // 2. Generate remaining 1,115 records to hit targets
  // TARGET METRICS to balance (including the 5 exact ones):
  // Total Tenders = 1,120 (1,115 more)
  // Won Tenders = 312 (311 more, since row 2 is WON)
  // Under Evaluation = 125 (123 more, since row 4 and row 5 are active eval)
  //   Wait, our Active Eval group in calculations is: SUBMITTED + UNDER_EVALUATION + RA_PENDING.
  //   Let's check the mockup. Mockup card "UNDER EVAL" = 125.
  //   Let's ensure the total count of active tenders equals exactly 125.
  //   We already have: row 1 (SUBMITTED, active), row 4 (UNDER_EVALUATION, active), row 5 (RA_PENDING, active) = 3 active.
  //   So we need 122 more active ones.
  // Reverse Auctions = 42 (40 more, since row 1 and row 5 are RA)
  // EMD Exposure = 2.8 Cr (28,000,000 Rs).
  //   Current active EMDs: row 1 (300,000), row 5 (130,000) = 430,000.
  //   Remaining EMD Exposure to distribute = 27,570,000 Rs.
  // Submitted Value = 142.5 Cr (1,425,000,000 Rs).
  //   Current submitted values: row 1 (15M), row 2 (42M), row 3 (8.5M), row 4 (21M), row 5 (6.5M) = 93M (93,000,000 Rs).
  //   Remaining value to distribute = 1,332,000,000 Rs.
  // LOI Received (MTD) = 4.2 Cr (42,000,000 Rs) in June 2026.
  //   None of our first 5 rows are in June 2026 (they are Jan/Feb).
  //   So we need exactly 42M of WON tenders in June 2026.

  const engineers = ["Arjun Mishra", "Sriya Iyer", "Amit Shah", "Vikram Seth", "Rajesh Patel", "Neha Sharma"];
  const clients = ["ONGC", "HPCL", "GAIL", "IOCL", "NTPC", "BPCL", "BHEL", "Reliance Jamnagar", "Adani Power", "Tata Power"];
  const works = ["Supply of Gate Valves", "Piping Retrofitting Work", "Annual Maintenance of Control Valves", "Supply of Actuators", "Laying of Gas Pipe Network", "Spares for Steam Turbines"];

  let activeTendersCount = 3; // rows 1, 4, 5 are active
  let wonTendersCount = 1; // row 2 is won
  let reverseAuctionsCount = 2; // rows 1, 5 are RA
  let totalValue = 93000000;
  let activeEmdValue = 430000; // rows 1, 5
  let juneLoiValue = 0;

  const targetTenders = 1120;
  const targetWon = 312;
  const targetActive = 125;
  const targetRa = 42;
  const targetValue = 1425000000;
  const targetEmd = 28000000;
  const targetJuneLoi = 42000000;

  // Distribute dates between 01-Jan-2026 and 25-Jun-2026
  const getRandomDate = (start: Date, end: Date): Date => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  };

  // Generate 1115 records
  for (let i = 6; i <= targetTenders; i++) {
    const docketNum = `D-2026-${String(i).padStart(3, "0")}`;
    
    // Determine status based on targets
    let status: CurrentStatus = CurrentStatus.LOST;
    
    if (wonTendersCount < targetWon) {
      status = CurrentStatus.WON;
      wonTendersCount++;
    } else if (activeTendersCount < targetActive) {
      // Pick one of the active statuses
      const activeStats = [CurrentStatus.SUBMITTED, CurrentStatus.UNDER_EVALUATION, CurrentStatus.RA_PENDING];
      status = activeStats[Math.floor(Math.random() * activeStats.length)];
      activeTendersCount++;
    }

    // Determine Reverse Auction
    let ra = false;
    if (reverseAuctionsCount < targetRa) {
      ra = true;
      reverseAuctionsCount++;
    }

    // Determine dates
    // For June MTD LOI Received: if status is WON and we need June LOI value, put it in June.
    let submittedDate: Date;
    if (status === CurrentStatus.WON && juneLoiValue < targetJuneLoi) {
      submittedDate = getRandomDate(new Date("2026-06-01"), new Date("2026-06-25"));
    } else {
      submittedDate = getRandomDate(new Date("2026-01-01"), new Date("2026-06-25"));
    }

    // Determine values to balance Submitted Value
    // Average remaining value per tender = 1,332,000,000 / 1115 = ~1.2M (12,00,000 Rs)
    // We can distribute values around this average.
    let estCost = 0;
    if (status === CurrentStatus.WON && juneLoiValue < targetJuneLoi) {
      // Allocate to hit exactly 42M June LOI Received
      const remainingJuneLoi = targetJuneLoi - juneLoiValue;
      if (remainingJuneLoi > 10000000) {
        estCost = 10000000; // 1 Cr
      } else {
        estCost = remainingJuneLoi;
      }
      juneLoiValue += estCost;
    } else {
      const remainingValue = targetValue - totalValue - (targetTenders - i) * 800000; // save buffer
      if (remainingValue > 5000000) {
        estCost = Math.floor(Math.random() * 4000000) + 1000000; // 10L to 50L
      } else if (remainingValue > 0) {
        estCost = remainingValue;
      } else {
        estCost = 500000; // fallback 5L
      }
    }
    totalValue += estCost;

    // Determine EMD to balance EMD Exposure (only for active tenders)
    // Average remaining EMD for active = 27,570,000 / 122 = ~225,000 Rs
    let emdAmount = 0;
    const isActive = [CurrentStatus.SUBMITTED, CurrentStatus.UNDER_EVALUATION, CurrentStatus.RA_PENDING].includes(status);
    if (isActive) {
      const remainingEmd = targetEmd - activeEmdValue - (targetActive - activeTendersCount) * 50000;
      if (remainingEmd > 150000) {
        emdAmount = Math.floor(Math.random() * 100000) + 150000; // 1.5L to 2.5L
      } else if (remainingEmd > 0) {
        emdAmount = remainingEmd;
      } else {
        emdAmount = 20000;
      }
      activeEmdValue += emdAmount;
    } else {
      // For won/lost, EMD can be anything, doesn't affect exposure
      emdAmount = Math.floor(estCost * 0.02); // 2% of cost
    }

    // Bid variances (only for Won/Lost)
    let diffL1: number | null = null;
    let diffL2: number | null = null;
    if (status === CurrentStatus.WON) {
      diffL1 = -Math.random() * 0.08; // -0% to -8%
      diffL2 = Math.random() * 0.05;  // +0% to +5%
    } else if (status === CurrentStatus.LOST) {
      diffL1 = Math.random() * 0.15;  // +0% to +15%
      diffL2 = Math.random() * 0.10;  // +0% to +10%
    }

    // Other minor fields
    const client = clients[Math.floor(Math.random() * clients.length)];
    const work = works[Math.floor(Math.random() * works.length)];
    const engineer = engineers[Math.floor(Math.random() * engineers.length)];
    const type = Object.values(TypeOfTender)[Math.floor(Math.random() * Object.values(TypeOfTender).length)];
    const decision = Object.values(ManagementDecision)[Math.floor(Math.random() * Object.values(ManagementDecision).length)];
    const emdMode = Object.values(EMDExchangeMode)[Math.floor(Math.random() * Object.values(EMDExchangeMode).length)];

    // Action alert fields
    // Simulate some alerts:
    // EMD Validity expiring in next 15 days for some active rows
    let emdValidity: Date | null = null;
    if (isActive && i % 15 === 0) {
      // Expiring between 25-Jun and 10-Jul
      emdValidity = getRandomDate(new Date("2026-06-26"), new Date("2026-07-10"));
    } else {
      emdValidity = getRandomDate(new Date("2026-07-11"), new Date("2026-12-31"));
    }

    // RA Date in next 7 days
    let raDate: Date | null = null;
    if (ra && i % 10 === 0) {
      // Scheduled between 25-Jun and 02-Jul
      raDate = getRandomDate(new Date("2026-06-26"), new Date("2026-07-02"));
    } else if (ra) {
      raDate = getRandomDate(new Date("2026-07-03"), new Date("2026-12-31"));
    }

    // Bid validity expired (boolean)
    let bidValidityExpired = false;
    if (status === CurrentStatus.LOST && i % 25 === 0) {
      bidValidityExpired = true;
    }

    // LOI/PO No & Date
    let loiPo = "-";
    if (status === CurrentStatus.WON) {
      if (i % 2 === 0) {
        loiPo = `PO/2026/${String(i).padStart(3, "0")}`; // PO Issued
      } else {
        loiPo = `LOI/2026/${String(i).padStart(3, "0")}`; // LOI Issued, PO Pending (helps trigger alert!)
      }
    }

    records.push({
      slNo: i,
      docketNo: docketNum,
      tenderSubmittedDate: submittedDate,
      tenderNoNitNo: `${client}/2026/NIT/${i}`,
      nameOfTheClient: client,
      tenderFor: work,
      typeOfTender: type,
      estimatedCostRs: estCost,
      emdAmountRs: emdAmount,
      lastDateOfSubmission: new Date(submittedDate.getTime() - 2 * 24 * 60 * 60 * 1000),
      tenderOpeningDate: new Date(submittedDate.getTime() + 1 * 24 * 60 * 60 * 1000),
      costOfTenderFeeRs: Math.floor(Math.random() * 5000),
      bidValidityDays: 90,
      contractPeriodDays: 120,
      managementDecision: decision,
      participated: true,
      tenderPrepareBy: engineer,
      currentStatus: status,
      reverseAuctionApplicable: ra,
      reverseAuctionDate: raDate,
      emdPaymentMode: emdMode,
      bgNoUtrNo: emdMode === EMDExchangeMode.BG ? `BG/${client}/${i}` : `UTR/${client}/${i}`,
      emdValidity,
      loiPoNoAndDate: loiPo,
      remarks: "Bid compiled and submitted.",
      bidValidityExpired,
      diffPercentFromL1: diffL1,
      diffPercentFromL2: diffL2,
      reason: status === CurrentStatus.LOST ? "L1 was lower priced." : "Qualified L1.",
      finalRemarks: status === CurrentStatus.WON ? "Project in progress." : "Closed."
    });
  }

  // Adjust total value slightly to hit exactly 142.5 Cr if needed
  const diffVal = targetValue - totalValue;
  if (diffVal !== 0 && records.length > 10) {
    // Add the difference to a random non-fixed record to balance the sum exactly
    const idx = 10 + Math.floor(Math.random() * (records.length - 15));
    if (records[idx].estimatedCostRs !== null) {
      records[idx].estimatedCostRs! += diffVal;
    }
  }

  // Adjust active EMD slightly to hit exactly 2.8 Cr
  const diffEmd = targetEmd - activeEmdValue;
  if (diffEmd !== 0 && records.length > 10) {
    // Add the difference to a random active record to balance the sum exactly
    const activeRecs = records.filter(r => 
      [CurrentStatus.SUBMITTED, CurrentStatus.UNDER_EVALUATION, CurrentStatus.RA_PENDING].includes(r.currentStatus as any) && 
      r.slNo > 5
    );
    if (activeRecs.length > 0) {
      const rec = activeRecs[Math.floor(Math.random() * activeRecs.length)];
      if (rec.emdAmountRs !== null) {
        rec.emdAmountRs! += diffEmd;
      }
    }
  }

  return records;
};
