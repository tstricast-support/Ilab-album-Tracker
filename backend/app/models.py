import enum
import os
from dotenv import load_dotenv
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, create_engine)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
load_dotenv()  # Load environment variables from .env file

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://localhost/ilab_prod"   # used only on your local machine
)
print(f"Database_url: {DATABASE_URL}")

# Railway gives a URL starting with postgres:// but SQLAlchemy
# requires postgresql:// — this one line fixes that.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, echo=False)

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
    "PRINTING":      75,
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
    operator_name = Column(String(128), nullable=True)   # for PRINTING + LASER_CUTTING
    under_whom    = Column(String(128), nullable=True)   # for PRINTING only

    job = relationship("JobCard", back_populates="logs")

    def __repr__(self) -> str:
        return (
            f"<DepartmentLog id={self.id} job_id={self.job_id} "
            f"dept={self.department} delayed={self.is_delayed}>"
        )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)


def run_migration() -> None:
    """
    PostgreSQL-safe migration. Runs on startup, safe to run multiple times.
    ADD COLUMN IF NOT EXISTS means it will never crash even if columns already exist.
    """
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS delay_reason TEXT;
        """))
        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS delay_reason_at TIMESTAMP;
        """))
        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS operator_name VARCHAR(128);
        """))
        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS under_whom VARCHAR(128);
        """))
        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS box_type VARCHAR(256);
        """))
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()