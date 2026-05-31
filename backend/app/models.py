import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, create_engine, event
)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker

DATABASE_URL = "sqlite:///./ilab_prod.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, _connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class PriorityEnum(str, enum.Enum):
    NORMAL = "NORMAL"
    URGENT = "URGENT"


class StageStatusEnum(str, enum.Enum):
    PENDING     = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED   = "COMPLETED"
    SKIPPED     = "SKIPPED"


class DeliveryTypeEnum(str, enum.Enum):
    PRONTO   = "PRONTO"
    CUSTOMER = "CUSTOMER"
    PICKME   = "PICKME"
    BUS      = "BUS"


class DepartmentEnum(str, enum.Enum):
    PRINTING      = "PRINTING"
    LAMINATING    = "LAMINATING"
    LASER_CUTTING = "LASER_CUTTING"
    BINDING       = "BINDING"


TIMEOUT_MINUTES: dict[str, int] = {
    "PRINTING":      1,
    "LAMINATING":    60,
    "LASER_CUTTING": 45,
    "BINDING":       90,
}

PRESET_DELAY_REASONS: dict[str, list[str]] = {
    "PRINTING": [
        "Machine breakdown",
        "Ink/toner finished",
        "Paper jam",
        "Busy with thank-you cards",
        "Waiting for paper stock",
        "Colour calibration issue",
        "Other",
    ],
    "LAMINATING": [
        "Laminate roll finished",
        "Machine heating issue",
        "Waiting for printing to finish",
        "Bubble/quality issue — redo",
        "Machine breakdown",
        "Other",
    ],
    "LASER_CUTTING": [
        "Laser cover not yet arrived",
        "Machine breakdown",
        "Design file issue",
        "Waiting for material",
        "Power issue",
        "Other",
    ],
    "BINDING": [
        "Laser cover not yet arrived",
        "Waiting for laminating",
        "Rexing material finished",
        "Staff unavailable",
        "Quality check failed — redo",
        "Machine breakdown",
        "Other",
    ],
}


class JobCard(Base):
    __tablename__ = "job_cards"

    id = Column(Integer, primary_key=True, autoincrement=True)

    job_no        = Column(String(64),  nullable=False, unique=True, index=True)
    customer      = Column(String(256), nullable=False)
    couple_name   = Column(String(256), nullable=True)
    order_no      = Column(String(128), nullable=True)
    order_date    = Column(DateTime,    nullable=False, default=datetime.utcnow)
    dele_date     = Column(DateTime,    nullable=False)
    delivery_type = Column(Enum(DeliveryTypeEnum), nullable=False)
    priority      = Column(Enum(PriorityEnum), nullable=False, default=PriorityEnum.NORMAL)
    special_note  = Column(Text, nullable=True)

    print_size       = Column(String(128), nullable=True)
    print_pages      = Column(String(64),  nullable=True)
    laser_cover_type = Column(String(256), nullable=True)
    laminate_type    = Column(String(256), nullable=True)
    bind_rexing_no   = Column(String(128), nullable=True)
    box_type         = Column(String(256), nullable=True)   # ← NEW

    status_printing      = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_laminating    = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_laser_cutting = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_binding       = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)

    is_fully_completed = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                        onupdate=datetime.utcnow)

    logs = relationship(
        "DepartmentLog", back_populates="job", cascade="all, delete-orphan"
    )

    @property
    def binding_unlocked(self) -> bool:
        lam_done = str(self.status_laminating)   == str(StageStatusEnum.COMPLETED)
        laser_ok = str(self.status_laser_cutting) in (
            str(StageStatusEnum.COMPLETED),
            str(StageStatusEnum.SKIPPED),
        )
        return bool(lam_done and laser_ok)

    def __repr__(self) -> str:
        return f"<JobCard id={self.id} job_no={self.job_no!r} priority={self.priority}>"


class DepartmentLog(Base):
    __tablename__ = "department_logs"

    id               = Column(Integer,  primary_key=True, autoincrement=True)
    job_id           = Column(Integer,  ForeignKey("job_cards.id"), nullable=False, index=True)
    department       = Column(Enum(DepartmentEnum), nullable=False)
    entered_at       = Column(DateTime, nullable=False, default=datetime.utcnow)
    exited_at        = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer,  nullable=True)
    is_delayed       = Column(Boolean,  nullable=False, default=False)
    delay_reason     = Column(Text,     nullable=True)
    delay_reason_at  = Column(DateTime, nullable=True)

    job = relationship("JobCard", back_populates="logs")

    def __repr__(self) -> str:
        return (
            f"<DepartmentLog id={self.id} job_id={self.job_id} "
            f"dept={self.department} delayed={self.is_delayed}>"
        )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def run_migration() -> None:
    
    import sqlite3
    db_path = DATABASE_URL.replace("sqlite:///", "")
    conn    = sqlite3.connect(db_path)
    cursor  = conn.cursor()

    cursor.execute("PRAGMA table_info(department_logs)")
    dl_cols = {row[1] for row in cursor.fetchall()}

    cursor.execute("PRAGMA table_info(job_cards)")
    jc_cols = {row[1] for row in cursor.fetchall()}

    if "delay_reason" not in dl_cols:
        cursor.execute("ALTER TABLE department_logs ADD COLUMN delay_reason TEXT")
        print("[migration] Added: department_logs.delay_reason")

    if "delay_reason_at" not in dl_cols:
        cursor.execute("ALTER TABLE department_logs ADD COLUMN delay_reason_at DATETIME")
        print("[migration] Added: department_logs.delay_reason_at")

    if "box_type" not in jc_cols:
        cursor.execute("ALTER TABLE job_cards ADD COLUMN box_type VARCHAR(256)")
        print("[migration] Added: job_cards.box_type")

    conn.commit()
    conn.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()