const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const teamSchema = new mongoose.Schema(
  {
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    players: { type: [playerSchema], default: [] },
  },
  { timestamps: true }
);

teamSchema.index({ ownerUserId: 1, name: 1 });

const Team = mongoose.models.Team || mongoose.model('Team', teamSchema);

async function createTeam(input) {
  return Team.create(input);
}

async function listTeamsByOwner(ownerUserId) {
  return Team.find({ ownerUserId }).sort({ createdAt: -1 });
}

async function findTeamByIdAndOwner(teamId, ownerUserId) {
  return Team.findOne({ _id: teamId, ownerUserId });
}

async function saveTeam(team) {
  return team.save();
}

module.exports = {
  createTeam,
  listTeamsByOwner,
  findTeamByIdAndOwner,
  saveTeam,
};
