FROM python:3.12-slim

# GUARDA: Carlito (métricas da Calibri) e DejaVu: sem elas, a medida do texto dos slides e dos diagramas erra
RUN apt-get update && apt-get install -y --no-install-recommends fonts-crosextra-carlito fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH POP_SAIDA=/tmp/pop PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
COPY --chown=user . .

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
