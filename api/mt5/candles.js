export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const token = process.env.METAAPI_TOKEN;
  const accountId = process.env.METAAPI_ACCOUNT_ID;
  const host = (process.env.METAAPI_MARKET_DATA_HOST || 'https://mt-market-data-client-api-v1.new-york.agiliumtrade.ai').replace(/\/$/, '');
  const symbol = String(req.query?.symbol || process.env.MT5_SYMBOL || 'EURUSD').trim().toUpperCase();

  if (!token || !accountId) {
    return res.status(503).json({
      ok: false,
      message: 'MT5 is not connected yet. Add METAAPI_TOKEN and METAAPI_ACCOUNT_ID in Vercel Environment Variables.'
    });
  }

  const timeframes = ['5m', '15m', '1h'];

  try {
    const responses = await Promise.all(timeframes.map(async timeframe => {
      const url = host + '/users/current/accounts/' + encodeURIComponent(accountId) +
        '/historical-market-data/symbols/' + encodeURIComponent(symbol) +
        '/timeframes/' + timeframe + '/candles?limit=100';
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'auth-token': token }
      });
      const body = await response.text();
      let data;
      try { data = JSON.parse(body); } catch (_) { data = null; }
      if (!response.ok) {
        throw new Error((data && (data.message || data.error)) || 'MT5 ' + timeframe + ' request failed (' + response.status + ').');
      }
      return { timeframe, candles: Array.isArray(data) ? data : [] };
    }));

    const analyses = responses.map(({ timeframe, candles }) => {
      const valid = candles.filter(c => Number.isFinite(c.open) && Number.isFinite(c.high) &&
        Number.isFinite(c.low) && Number.isFinite(c.close)).sort((a,b) => new Date(a.time) - new Date(b.time));

      if (valid.length < 30) throw new Error('Not enough MT5 ' + timeframe + ' candles for analysis.');

      const closes = valid.map(c => c.close);
      const ema = (period) => {
        const k = 2 / (period + 1);
        let value = closes[0];
        for (let i = 1; i < closes.length; i++) value = closes[i] * k + value * (1 - k);
        return value;
      };
      const ema9 = ema(9);
      const ema21 = ema(21);
      const recent = closes.slice(-10);
      const previous = closes.slice(-20, -10);
      const recentMean = recent.reduce((a,b) => a+b,0) / recent.length;
      const previousMean = previous.reduce((a,b) => a+b,0) / previous.length;
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const delta = closes[i] - closes[i-1];
        if (delta >= 0) gains += delta; else losses -= delta;
      }
      const avgGain = gains / 14, avgLoss = losses / 14;
      const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
      const trend = ema9 > ema21 ? 1 : ema9 < ema21 ? -1 : 0;
      const momentum = recentMean > previousMean ? 1 : recentMean < previousMean ? -1 : 0;
      const rsiBias = rsi >= 55 ? 1 : rsi <= 45 ? -1 : 0;
      const score = Math.round((trend * 50) + (momentum * 30) + (rsiBias * 20));
      return { timeframe, score, ema9, ema21, rsi, close: closes[closes.length - 1] };
    });

    const weights = { '5m': 0.25, '15m': 0.35, '1h': 0.40 };
    const weighted = analyses.reduce((sum, a) => sum + a.score * weights[a.timeframe], 0);
    const score = Math.max(-100, Math.min(100, Math.round(weighted)));
    const signal = score >= 25 ? 'BUY' : score <= -25 ? 'SELL' : 'WAIT';
    const details = analyses.map(a =>
      a.timeframe.toUpperCase() + ': ' + (a.score > 0 ? 'BULLISH' : a.score < 0 ? 'BEARISH' : 'NEUTRAL') +
      ' · EMA9 ' + a.ema9.toFixed(5) + ' / EMA21 ' + a.ema21.toFixed(5) +
      ' · RSI ' + a.rsi.toFixed(1)
    ).join(' | ');

    return res.status(200).json({
      ok: true,
      source: 'MT5 via MetaApi',
      symbol,
      signal,
      score,
      reason: details,
      timeframes: analyses.map(a => ({
        timeframe: a.timeframe,
        score: a.score,
        rsi: Number(a.rsi.toFixed(1)),
        ema9: a.ema9,
        ema21: a.ema21,
        close: a.close
      })),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      message: error.message || 'Unable to read MT5 candle data.'
    });
  }
}
