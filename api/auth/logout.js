module.exports=(req,res)=>{
  res.setHeader('Set-Cookie','deriv_access_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  res.status(200).json({ok:true});
};