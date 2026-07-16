#!/bin/bash
# Starts the RAG-Lens backend on :8000
cd "$(dirname "$0")"
exec .venv/bin/python -m uvicorn app.main:app --reload --port 8000
