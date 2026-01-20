import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

export const config = {
  verify_jwt: false,
};

const API_BASE =
  'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const apiKey = Deno.env.get('SVV_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing SVV_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const body = await req.json().catch(() => ({}));
  const plate = String(body?.plate || '').replace(/\s/g, '');
  if (!plate) {
    return new Response(JSON.stringify({ error: 'Missing plate' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const url = `${API_BASE}?kjennemerke=${encodeURIComponent(plate)}`;
  const response = await fetch(url, {
    headers: {
      'SVV-Authorization': `Apikey ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: `API Error: ${response.status}` }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
