$body = @{ name = 'Debug Student'; email = "debug-$([guid]::NewGuid())@example.com"; password = 'Debug123!'; role = 'student' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/auth/register' -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
