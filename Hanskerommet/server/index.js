const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const API_BASE =
  'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';

app.get('/car', async (req, res) => {
  const apiKey = process.env.SVV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing SVV_API_KEY' });
  }

  const plate = String(req.query.plate || '').replace(/\s/g, '');
  if (!plate) {
    return res.status(400).json({ error: 'Missing plate' });
  }

  const url = `${API_BASE}?kjennemerke=${encodeURIComponent(plate)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'SVV-Authorization': `Apikey ${apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `API Error: ${response.status}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Request failed' });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
