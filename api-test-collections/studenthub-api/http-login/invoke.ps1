param([string]$Email = 'debug@example.com', [string]$Password = 'Debug123!')
$body = @{ email = $Email; password = $Password } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/auth/login' -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
