const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
app.use(express.json());
app.use(cors());

// Tüm Web API yolları /api ile başlar (Apache yönlendirmesi için)
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Uygulama servisi ${PORT} portunda çalışıyor.`);
});