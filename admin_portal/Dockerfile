# Build from repository root: docker build -f admin_portal/Dockerfile .
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY admin-requirements.txt ./admin-requirements.txt
RUN pip install --no-cache-dir -r admin-requirements.txt
COPY admin_portal/ ./admin_portal/
RUN useradd --system --user-group bizbug
USER bizbug
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn admin_portal.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers"]
