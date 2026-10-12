from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

# "local" mode: the app database is the on-device SQLite file and the cloud
# DATABASE_URL is used only by the sync engine. "cloud" mode keeps the
# original behaviour — the app talks directly to the cloud database.
IS_LOCAL = settings.POS_MODE == "local"
ACTIVE_DATABASE_URL = settings.LOCAL_DATABASE_URL if IS_LOCAL else settings.DATABASE_URL


def _build_engine(url: str):
    """Create an engine suited to the dialect.

    SQLite (local/offline mode) needs ``check_same_thread=False`` and no pool
    tuning; Postgres gets a pooled, pre-pinged engine.
    """
    if url.startswith("sqlite"):
        sqlite_engine = create_engine(
            url,
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_pre_ping=True,
        )

        @event.listens_for(sqlite_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

        return sqlite_engine
    return create_engine(
        url,
        pool_size=10,
        max_overflow=20,
        pool_recycle=300,
        pool_pre_ping=True,
    )


engine = _build_engine(ACTIVE_DATABASE_URL)
IS_SQLITE = engine.dialect.name == "sqlite"

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def for_update(query):
    """Apply a row lock where the dialect supports it.

    SQLite serializes writes on its own and rejects ``FOR UPDATE`` syntax, so
    the clause is only attached on Postgres.
    """
    if IS_SQLITE:
        return query
    return query.with_for_update()
