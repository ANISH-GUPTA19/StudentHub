# StudentHub

StudentHub is a React and FastAPI platform for hostel discovery, roommate matching, mess dining, marketplace listings, and messaging.

## Frontend

```powershell
npm --prefix services/web install
npm --prefix services/web run build
```

## Backend

```powershell
python -m venv services/studenthub-api/.venv
services/studenthub-api/.venv/Scripts/python -m pip install -r services/studenthub-api/requirements.txt
services/studenthub-api/.venv/Scripts/python -m uvicorn app.main:app --app-dir services/studenthub-api --reload
```

## Docker

```powershell
docker compose up --build
```
