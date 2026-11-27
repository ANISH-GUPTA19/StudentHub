$response = Invoke-RestMethod -Method Get -Uri 'http://localhost:8000/api/health'
$response | ConvertTo-Json -Depth 5
