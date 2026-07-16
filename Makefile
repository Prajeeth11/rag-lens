.PHONY: install install-backend install-frontend dev backend frontend clean

PY := python3.12

install: install-backend install-frontend

install-backend:
	cd backend && $(PY) -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

# Starts backend (:8000) and frontend (:5173) together; Ctrl-C stops both.
dev:
	@trap 'kill 0' INT TERM; \
	(cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000) & \
	(cd frontend && npm run dev) & \
	wait

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

clean:
	rm -rf backend/data/chroma backend/data/faiss backend/data/raglens.db backend/data/uploads/*
