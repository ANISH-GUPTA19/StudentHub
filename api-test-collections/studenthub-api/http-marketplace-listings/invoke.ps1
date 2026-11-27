Invoke-RestMethod -Method Get -Uri 'http://localhost:8000/api/marketplace/listings' | ConvertTo-Json -Depth 5
