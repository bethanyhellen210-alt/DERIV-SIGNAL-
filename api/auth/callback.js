function parseCookies(header) {
  const out={};
  String(header||'').split(';').forEach(part=>{
    const i=part.indexOf('=');
    if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}
function clearCookie(name){ return name+'=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'; }
function tokenCookie(token,maxAge){
  return 'deriv_access_token='+encodeURIComponent(token)+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax';
}
module.exports = async (req,res)=>{
  try {
    const q=req.query||{};
    if(q.error) return res.status(400).send('<h2>Deriv login cancelled</h2><p>'+String(q.error_description||q.error)+'</p><p><a href="/">Return to ELISY254</a></p>');
    const cookies=parseCookies(req.headers.cookie);
    if(!q.code || !q.state || q.state!==cookies.deriv_oauth_state) return res.status(400).send('<h2>OAuth state verification failed</h2><p>Please start the Deriv login again.</p>');
    const clientId=process.env.DERIV_OAUTH_CLIENT_ID;
    if(!clientId) return res.status(500).send('DERIV_OAUTH_CLIENT_ID is not configured.');
    const origin=process.env.DERIV_REDIRECT_URI ? new URL(process.env.DERIV_REDIRECT_URI).origin : (req.headers['x-forwarded-proto']||'https')+'://'+req.headers.host;
    const redirectUri=process.env.DERIV_REDIRECT_URI || origin+'/callback';
    const body=new URLSearchParams({
      grant_type:'authorization_code',
      client_id:clientId,
      code:q.code,
      code_verifier:cookies.deriv_oauth_verifier||'',
      redirect_uri:redirectUri
    });
    const r=await fetch('https://auth.deriv.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const data=await r.json();
    if(!r.ok || !data.access_token) return res.status(502).send('<h2>Deriv token exchange failed</h2><p>'+String(data.error_description||data.error||'Unknown error')+'</p>');
    const maxAge=Math.max(300,Number(data.expires_in||3600));
    res.setHeader('Set-Cookie',[
      tokenCookie(data.access_token,maxAge),
      clearCookie('deriv_oauth_state'),
      clearCookie('deriv_oauth_verifier')
    ]);
    res.writeHead(302,{Location:'/'});
    res.end();
  } catch(e) { res.status(500).send('<h2>Authentication error</h2><p>'+String(e.message)+'</p>'); }
};