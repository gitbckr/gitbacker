from celery import Celery

from app.config import REDIS_URL

celery = Celery("gitbacker", broker=REDIS_URL)
