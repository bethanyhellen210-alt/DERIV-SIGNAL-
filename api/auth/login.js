const crypto = require('crypto');

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function cookie(name,value,maxAge) {
  return name+'='+encodeURIComponent(value)+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax';
}
module.exports = async (req,res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
    const clientId = process.env.DERIV_OAUTH_CLIENT_ID;
    if (!clientId) return res.status(500).json({error:'DERIV_OAUTH_CLIENT_ID is not configured in Vercel.'});
    const origin = process.env.DERIV_REDIRECT_URI
      ? new URL(process.env.DERIV_REDIRECT_URI).origin
      : (req.headers['x-forwarded-proto'] || 'https')+'://'+req.headers.host;
    const redirectUri = process.env.DERIV_REDIRECT_URI || origin+'/callback';
    const verifier = base64url(crypto.randomBytes(48));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(32));
    const prompt = req.query && req.query.signup === '1' ? 'registration' : '';
    const auth = new URL('https://auth.deriv.com/oauth2/auth');
    auth.searchParams.set('response_type','code');
    auth.searchParams.set('client_id',clientId);
    auth.searchParams.set('redirect_uri',redirectUri);
    auth.searchParams.set('scope','trade');
    auth.searchParams.set('state',state);
    auth.searchParams.set('code_challenge',challenge);
    auth.searchParams.set('code_challenge_method','S256');
    if (prompt) auth.searchParams.set('prompt',prompt);
    res.setHeader('Set-Cookie',[
      cookie('deriv_oauth_state',state,600),
      cookie('deriv_oauth_verifier',verifier,600)
    ]);
    res.writeHead(302,{Location:auth.toString()});
    res.end();
  } catch (e) {
    res.status(500).json({error:e.message});
  }
};