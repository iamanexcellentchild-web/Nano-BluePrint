FROM python:3.12-slim
WORKDIR /app
COPY core /app/core
COPY backend /app/backend
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8000
