FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    libmagic1 \
    patch \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create directories
RUN mkdir -p /app/uploads /app/chroma_data /app/data

EXPOSE 8000

# Production start command.
# `sh -c` is required so ${PORT} expands — Render injects PORT at runtime and
# the exec form of CMD does not perform variable substitution.
# Falls back to 8000 so local `docker run` / docker-compose keep working.
# NOTE: no --reload here. docker-compose.yml overrides this command for local dev.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
