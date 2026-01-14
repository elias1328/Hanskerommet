const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const API_BASE =
  'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';

app.get('/car', async (req, res) => {
  console.log('[GET /car] query', req.query);
  const apiKey = process.env.SVV_API_KEY;
  if (!apiKey) {
    console.warn('[GET /car] Missing SVV_API_KEY');
    return res.status(500).json({ error: 'Missing SVV_API_KEY' });
  }

  const plate = String(req.query.plate || '').replace(/\s/g, '');
  if (!plate) {
    console.warn('[GET /car] Missing plate');
    return res.status(400).json({ error: 'Missing plate' });
  }

  const url = `${API_BASE}?kjennemerke=${encodeURIComponent(plate)}`;
  console.log('[GET /car] Requesting', url);

  try {
    const response = await fetch(url, {
      headers: {
        'SVV-Authorization': `Apikey ${apiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('[GET /car] API Error', response.status);
      return res.status(response.status).json({ error: `API Error: ${response.status}` });
    }

    const data = await response.json();
    console.log('[GET /car] Success');
    return res.json(data);
  } catch (error) {
    console.error('[GET /car] Request failed', error);
    return res.status(500).json({ error: 'Request failed' });
  }
});

const port = Number(process.env.PORT) || 3001;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
