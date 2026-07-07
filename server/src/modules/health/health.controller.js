const mongoose = require('mongoose');

// OPT-023: the health check now verifies the DB is actually reachable, not just
// that the process is up. A load balancer / orchestrator polling this endpoint
// will pull an instance out of rotation when its Mongo connection is down
// instead of routing traffic to a server that can only 500.
async function health(_req, res) {
  const timestamp = new Date().toISOString();

  // readyState 1 === connected. If we're not connected there's no point issuing
  // a ping — report unhealthy immediately.
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: 'unavailable', db: 'disconnected', timestamp });
  }

  try {
    await mongoose.connection.db.admin().ping();
  } catch {
    return res.status(503).json({ status: 'unavailable', db: 'error', timestamp });
  }

  return res.status(200).json({ status: 'ok', db: 'ok', timestamp });
}

module.exports = {
  health,
};
