from backend.database import engine, Base, seed_data, SessionLocal
from backend import models

def run_migrations():
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(staff)"))
        columns = [row[1] for row in result.fetchall()]
        print("Columns:", columns)
        trans = conn.begin()
        try:
            if "whatsapp_enabled" not in columns:
                conn.execute(text("ALTER TABLE staff ADD COLUMN whatsapp_enabled BOOLEAN DEFAULT 0 NOT NULL"))
            trans.commit()
            print("Migration successful")
        except Exception as e:
            trans.rollback()
            print("Migration failed:", e)

run_migrations()
Base.metadata.create_all(bind=engine)
db = SessionLocal()
seed_data(db)
print("Staff:", db.query(models.Staff).count())
print("Allocations:", db.query(models.Allocation).count())
