# Run commands

## Backend

You can run from any directory. Just ensure the virtual environment is activated:

```bash
lsof -ti:8000 | xargs kill -9
source ~/Backend/python/venv/thesis/bin/activate
cd /Users/dubf/Developer/LabFrame/api
uvicorn labframe_api.app:app --reload --port 8000 --log-config logging.yaml
```

## Frontend
cd ui/web
lsof -ti:3000 | xargs kill -9
npm run dev
