function token(req){
  const m=String(req.headers.cookie||'').match(/(?:^|; )deriv_access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
module.exports=async(req,res)=>{
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const t=token(req);
  if(!t) return res.status(401).json({authenticated:false,error:'Not connected to Deriv.'});
  const r=await fetch('https://api.derivws.com/trading/v1/options/accounts',{headers:{Authorization:'Bearer '+t}});
  const data=await r.json();
  if(!r.ok) return res.status(r.status).json({authenticated:false,error:data?.errors?.[0]?.message||'Unable to load Deriv accounts.'});
  const raw=Array.isArray(data.data)?data.data:(data.data?[data.data]:[]);
  res.status(200).json({authenticated:true,accounts:raw.map(a=>({
    account_id:a.account_id,account_type:a.account_type,balance:Number(a.balance||0),
    currency:a.currency||'USD',status:a.status||'unknown',group:a.group||''
  }))});
};