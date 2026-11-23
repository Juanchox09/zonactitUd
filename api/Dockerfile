FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY . .
EXPOSE 4000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4000", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips=*"]
