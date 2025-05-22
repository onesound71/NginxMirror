const express = require('express');
const app = express();
app.use(express.json());

app.all('*', (req, res) => {
  console.log('Server A received:', req.method, req.url);
  res.send('Handled by Server A');
});

app.listen(3000, () => console.log('Server A running on port 3000')); 