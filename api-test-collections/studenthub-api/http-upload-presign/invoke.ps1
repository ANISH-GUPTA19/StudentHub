if (-not $env:TOKEN) { throw 'Set TOKEN to a JWT, for example: $env:TOKEN = "<token>"' }
$body = @{ type = 'image'; filename = 'test-image.jpg'; contentType = 'image/jpeg' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/api/uploads/presign' -Headers @{ Authorization = "Bearer $env:TOKEN" } -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
