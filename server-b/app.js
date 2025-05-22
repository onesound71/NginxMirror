const express = require('express');
const app = express();
app.use(express.json());

app.all('*', (req, res) => {
  console.log('Server B (mirror) received:', req.method, req.url);
  res.sendStatus(204);
});

app.listen(3000, () => console.log('Server B running on port 3000')); 