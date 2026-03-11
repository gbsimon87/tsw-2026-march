function apiResponse(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

module.exports = {
  apiResponse,
};
