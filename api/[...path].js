// Titik masuk serverless Vercel: teruskan semua /api/* ke app Express di server.js.
// Static (public/) disajikan langsung oleh Vercel/CDN, bukan lewat fungsi ini.
module.exports = require('../server.js');
