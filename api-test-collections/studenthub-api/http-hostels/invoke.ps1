Invoke-RestMethod -Method Get -Uri 'http://localhost:8000/api/hostels' | ConvertTo-Json -Depth 5
