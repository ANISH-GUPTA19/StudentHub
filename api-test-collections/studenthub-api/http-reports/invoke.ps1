if (-not $env:TOKEN) { throw 'Set TOKEN to a JWT, for example: $env:TOKEN = "<token>"' }
$body = @{ targetType = 'marketplace'; targetId = 'l1'; reason = 'Debug verification' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/reports' -Headers @{ Authorization = "Bearer $env:TOKEN" } -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
