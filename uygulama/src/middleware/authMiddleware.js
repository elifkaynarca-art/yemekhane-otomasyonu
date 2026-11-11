const redis = require('../config/redis');

module.exports = async (req, res, next) => {
  const token = req.headers['authorization'] || req.cookies?.token;
  if (!token) return res.status(401).json({ hata: 'Oturum açmanız gerekmektedir.' });

  const sessionData = await redis.get(`oturum:${token}`);
  if (!sessionData) {
    return res.status(401).json({ hata: 'Geçersiz veya süresi dolmuş oturum.' });
  }

  // Oturum süresini her istekte 30 dakika yenile
  await redis.expire(`oturum:${token}`, 1800);
  
  req.user = JSON.parse(sessionData);
  next();
};