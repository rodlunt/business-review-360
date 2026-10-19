import express from "express";
import { requireSameOrganization } from "../middleware/auth.js";
import Vote from "../models/Vote.js";
import { formatServerError } from "../utils/formatServerError.js";

const router = express.Router();

// Upvote or change vote for an idea
router.post("/idea/:ideaId", requireSameOrganization, async (req, res) => {
  try {
    let vote = await Vote.findOne({ where: { ideaId: req.params.ideaId, userId: req.user.id } });
    if (vote) {
      // Change vote (for now, only upvote is allowed)
      vote.value = 1;
      await vote.save();
      return res.json(vote);
    }
    vote = await Vote.create({
      ideaId: req.params.ideaId,
      userId: req.user.id,
      value: 1,
      tenant_id: req.user.tenant_id,
    });
    res.status(201).json(vote);
  } catch (err) {
    res.status(500).json(formatServerError(err, "Failed to vote", "[Votes:upvote]"));
  }
});

// Remove vote
router.delete("/idea/:ideaId", requireSameOrganization, async (req, res) => {
  try {
    const vote = await Vote.findOne({ where: { ideaId: req.params.ideaId, userId: req.user.id } });
    if (!vote) return res.status(404).json({ error: "Vote not found" });
    await vote.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json(formatServerError(err, "Failed to remove vote", "[Votes:remove]"));
  }
});

export default router;
