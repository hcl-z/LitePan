FROM node:20-bookworm-slim AS web-builder

ENV NODE_ENV=development

WORKDIR /build/web

COPY web/package.json web/package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com && npm ci --include=dev

COPY web/ ./
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip install --no-cache-dir -r requirements.txt \
    && rm -rf /root/.cache/pip \
    && find /usr/local/lib/python3.11 -name "*.pyc" -delete \
    && find /usr/local/lib/python3.11 -name "__pycache__" -delete

COPY . ./
COPY --from=web-builder /build/web/static /app/web/static

RUN mkdir -p /app/data /app/log /app/strm /app/plugins

EXPOSE 5211

CMD ["python", "main.py"]
