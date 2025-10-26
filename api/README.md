# LabFrame API

FastAPI facade exposing the LabFrame core services for the new web UI.

## Prerequisites

- Python 3.11+
- Access to the LabFrame core sources as a sibling directory: `../core`
- Existing SQLite database at `../db/database.sqlite` (override with `LABFRAME_DB_PATH`)

## Installation

```bash
cd api
source ~/Backend/python/venv/thesis/bin/activate
pip install -e .
```

## Running the server

```bash
cd api
source ~/Backend/python/venv/thesis/bin/activate
uvicorn labframe_api.app:app --reload --port 8000
```

The server defaults to the database at `../db/database.sqlite`. Override it via
environment variable:

```bash
export LABFRAME_DB_PATH="/absolute/path/to/database.sqlite"
uvicorn labframe_api.app:app --reload --port 8000
```

## Available endpoints

- `GET /health`
- `GET /samples`
- `POST /samples`
- `GET /samples/{sample_id}`
- `GET /samples/{sample_id}/parameters`
- `POST /samples/{sample_id}/parameters`
- `GET /parameters/definitions`
- `GET /parameters/{parameter_name}/history`

These responses mirror the DTOs returned by the LabFrame core and are ready for
consumption by the new frontend.
