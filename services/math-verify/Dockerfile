# Small, and it does not run as root.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

# The service parses expressions that originate from a model. It should not be
# able to write anywhere, reach anything, or run as a user that matters.
RUN useradd --create-home --uid 10001 verifier
USER verifier

EXPOSE 8000

# One worker per core is the usual default and is wrong here: each request can
# burn a core for up to MATH_VERIFY_TIMEOUT seconds, so the pool size is the
# thing that decides whether one slow expression blocks the tutor. Two is
# enough for the traffic this takes, and the timeout bounds the damage.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
