# ── Stage 1: Build frontend ────────────────────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + serve frontend ──────────────────────────────
FROM python:3.12-slim

# Set consistent cache dirs so models are found at runtime
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface
ENV NLTK_DATA=/app/.cache/nltk_data

WORKDIR /app

# System deps for scipy, spacy, wordcloud, etc. — remove after install
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (heaviest dep, cached separately)
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY backend/requirements-prod.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Remove build-essential to reduce image size
RUN apt-get purge -y build-essential && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# Download NLTK data to explicit path
RUN python -c "import nltk; nltk.download('punkt_tab', download_dir='/app/.cache/nltk_data'); nltk.download('stopwords', download_dir='/app/.cache/nltk_data')"

# Pre-download HuggingFace sentiment model so it's cached in the image
RUN python -c "from transformers import AutoModelForSequenceClassification, AutoTokenizer; AutoTokenizer.from_pretrained('cardiffnlp/twitter-roberta-base-sentiment-latest'); AutoModelForSequenceClassification.from_pretrained('cardiffnlp/twitter-roberta-base-sentiment-latest')"

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Expose port (Railway uses $PORT)
EXPOSE 8000

# Start the server (shell form so $PORT is expanded by Railway)
CMD python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
