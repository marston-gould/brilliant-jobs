Deno.serve(async (req) => {
  const auth = req.headers.get('x-migration-token');
  if (auth !== 'mig-v650-remote-scope') {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const { sql } = await req.json();

  const mgmtToken = 'sbp_42bc893aa3dfde17a742f048de0a6244d843a58a';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  const mgmtResp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mgmtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  
  const body = await mgmtResp.text();
  return new Response(JSON.stringify({ 
    mgmt_status: mgmtResp.status, 
    body: body.slice(0, 1000) 
  }), { status: 200 });
});
