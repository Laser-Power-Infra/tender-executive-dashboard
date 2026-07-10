import { DatabaseTenderService } from "../services/databaseTenderService.js";

export class TenderController {
  /**
   * Endpoint: PATCH /api/tenders/:id
   * Updates only tenderUpdateStatus and nextAction.
   */
  static async updateTender(req, res) {
    const { id } = req.params;
    const { tenderUpdateStatus, nextAction, reverseAuctionApplicable } = req.body;

    if (!tenderUpdateStatus) {
      return res.status(400).json({ error: "tenderUpdateStatus is required" });
    }

    const validStatuses = ["OPEN", "CLOSED"];
    if (!validStatuses.includes(tenderUpdateStatus)) {
      return res.status(400).json({ error: "Invalid tenderUpdateStatus value" });
    }

    const validActions = [
      "UPDATE_FROM_AB_LETTER",
      "BG_REFUND_LETTER_TO_BE_SENT",
      "FOLLOW_UP_FOR_FINANCIAL_STATUS",
      "REVERSE_AUCTION_PENDING",
      null
    ];
    if (nextAction !== undefined && !validActions.includes(nextAction)) {
      return res.status(400).json({ error: "Invalid nextAction value" });
    }

    if (reverseAuctionApplicable !== undefined && typeof reverseAuctionApplicable !== "boolean") {
      return res.status(400).json({ error: "reverseAuctionApplicable must be a boolean" });
    }

    try {
      const updated = await DatabaseTenderService.updateTenderStatusAndAction(
        id,
        tenderUpdateStatus,
        nextAction,
        reverseAuctionApplicable
      );
      return res.status(200).json(updated);
    } catch (err) {
      console.error(`[API_ERROR] Failed to update tender ${id}: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
  /**
   * Endpoint: PATCH /api/tenders/:id/diff
   * Updates Diff % from L1 and/or Diff % from L2 (user-editable fields).
   * Sets the corresponding manual-edit flag in the database so the import
   * sync will NOT overwrite these user-provided values on subsequent refreshes.
   */
  static async updateDiffPercents(req, res) {
    const { id } = req.params;
    const { diffPercentFromL1, diffPercentFromL2 } = req.body;

    // Validate: at least one field must be provided
    if (diffPercentFromL1 === undefined && diffPercentFromL2 === undefined) {
      return res.status(400).json({ error: "At least one of diffPercentFromL1 or diffPercentFromL2 must be provided" });
    }

    // Validate types: must be a finite number or null
    const isValidDiff = (v) => v === undefined || v === null || (typeof v === "number" && isFinite(v));
    if (!isValidDiff(diffPercentFromL1) || !isValidDiff(diffPercentFromL2)) {
      return res.status(400).json({ error: "diffPercentFromL1 and diffPercentFromL2 must be a finite number or null" });
    }

    try {
      const updated = await DatabaseTenderService.updateDiffPercents(id, diffPercentFromL1, diffPercentFromL2);
      if (!updated) {
        return res.status(404).json({ error: "Tender not found" });
      }
      return res.status(200).json(updated);
    } catch (err) {
      console.error(`[API_ERROR] Failed to update diff percents for tender ${id}: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  }
}

export function registerTenderRoutes(router) {
  // Register the more-specific /diff route FIRST so Express matches it before /:id
  router.patch("/api/tenders/:id/diff", TenderController.updateDiffPercents);
  router.patch("/api/tenders/:id", TenderController.updateTender);
}
