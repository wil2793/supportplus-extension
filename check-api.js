process.stdout.write("Starting...\n");
fetch('https://macropayapi.supportplus.mx/tickets/web/active-profiles-by-resolution-group/19', {
  headers: { accept: 'application/json', authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODA3NjcxNTEsImVtYWlsIjoid2lsbGlhbS5hbHB1Y2hlQG1hY3JvcGF5Lm14IiwidXNlcklkIjpudWxsLCJyb2xlSWQiOjIxfQ.YrU_6VKoyimIUJRPD_5GIDLEtFY9fVIhfAc3f7yrzz4' }
}).then(r => { process.stdout.write("Status: " + r.status + "\n"); return r.text(); }).then(t => { process.stdout.write("Body: " + t.substring(0, 200) + "\n"); process.exit(0); }).catch(e => { process.stdout.write("ERR: " + e.message + "\n"); process.exit(1); });
