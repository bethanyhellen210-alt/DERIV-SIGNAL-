function token(req){
  const m=String(req.headers.cookie||'').match(/(?:^|; )deriv_access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
module.exports=async(req,res)=>{
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const t=token(req);
  if(!t) return res.status(401).json({error:'Not connected to Deriv.'});
  const accountId=String(req.body?.account_id||'');
  if(!/^[A-Za-z0-9]+$/.test(accountId)) return res.status(400).json({error:'Invalid Deriv account ID.'});
  const r=await fetch('https://api.derivws.com/trading/v1/options/accounts/'+encodeURIComponent(accountId)+'/otp',{method:'POST',headers:{Authorization:'Bearer '+t}});
  const data=await r.json();
  if(!r.ok) return res.status(r.status).json({error:data?.errors?.[0]?.message||'Unable to create authenticated Deriv WebSocket session.'});
  res.status(200).json({ok:true,url:data?.data?.url,expires_in:data?.data?.expires_in||120});
};