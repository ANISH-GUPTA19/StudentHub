if (-not $env:TOKEN) { throw 'Set TOKEN to a JWT, for example: $env:TOKEN = "<token>"' }
Invoke-RestMethod -Method Get -Uri 'http://localhost:8000/api/roommates/matches' -Headers @{ Authorization = "Bearer $env:TOKEN" } | ConvertTo-Json -Depth 5
