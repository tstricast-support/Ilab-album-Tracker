import enum
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, create_engine)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
from .config import settings
from datetime import timedelta


SL_TZ_OFFSET = timedelta(hours=5, minutes=30)
db_url = settings.DATABASE_URL

if not db_url:
    raise RuntimeError("DATABASE_URL is missing.")

if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

connect_args = {}

if db_url.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False
    }

engine = create_engine(
    db_url,
    connect_args=connect_args
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

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

class DamageDeptEnum(str, enum.Enum):
    PRINTING   = "PRINTING"
    LAMINATING = "LAMINATING"
    BINDING    = "BINDING"

TIMEOUT_MINUTES: dict[str, int] = {
    "PRINTING":     75,
    "LAMINATING":    75,
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

PAPER_SIZES = ["9x13", "10x16", "12x16", "13x19"]
LOW_STOCK_THRESHOLD = 5

class JobCard(Base):
    __tablename__ = "job_cards"

    id = Column(Integer, primary_key=True, autoincrement=True)

    album_type = Column(String(16), nullable=True)  # NORMAL / STORY / REBIND
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
    box_type         = Column(String(256), nullable=True)  

    payment_by         = Column(String(128), nullable=True)
    payment_updated_at = Column(DateTime,    nullable=True)
    box_pouch_status    = Column(String(32),  nullable=True)

    status_printing      = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_laminating    = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_laser_cutting = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)
    status_binding       = Column(Enum(StageStatusEnum), nullable=False, default=StageStatusEnum.PENDING)

    is_fully_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)

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
    machine       = Column(String(32),  nullable=True)
    is_story      = Column(Boolean, nullable=False, default=False)
    is_rebind     = Column(Boolean, nullable=False, default=False)    

    job = relationship("JobCard", back_populates="logs")

    def __repr__(self) -> str:
        return (
            f"<DepartmentLog id={self.id} job_id={self.job_id} "
            f"dept={self.department} delayed={self.is_delayed}>"
        )

class PaperPrice(Base):
    __tablename__ = "paper_prices"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    label      = Column(String(64), nullable=False, unique=True)   # "9x13 One Side"
    size       = Column(String(16), nullable=False)                # "9x13"
    side_type  = Column(String(4),  nullable=False)                # "OS" / "DS"
    unit_price = Column(Integer,    nullable=False, default=0)
    updated_at = Column(DateTime,   nullable=False, default=datetime.utcnow,
                         onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PaperPrice {self.label}: {self.unit_price}>"


class DamageEntry(Base):
    __tablename__ = "damage_entries"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    department          = Column(Enum(DamageDeptEnum), nullable=False)
    paper_price_id      = Column(Integer, ForeignKey("paper_prices.id"), nullable=False)
    job_no              = Column(String(64),  nullable=True)   # ADD
    customer            = Column(String(256), nullable=True)   # ADD
    operator_name       = Column(String(128), nullable=False)
    reason              = Column(Text, nullable=False)
    quantity            = Column(Integer, nullable=False)
    unit_price_snapshot = Column(Integer, nullable=False)
    total_value         = Column(Integer, nullable=False)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                         onupdate=datetime.utcnow)

    paper_price = relationship("PaperPrice")

    def __repr__(self) -> str:
        return f"<DamageEntry id={self.id} dept={self.department} qty={self.quantity}>"


DEFAULT_PAPER_PRICES = [
    ("9x13",  "OS", 125),
    ("9x13",  "DS", 250),
    ("10x16", "OS", 200),
    ("10x16", "DS", 400),
    ("12x16", "OS", 250),
    ("12x16", "DS", 500),
    ("13x16", "OS", 250),
    ("13x16", "DS", 500),
    ("13x19", "OS", 300),
    ("13x19", "DS", 600),
]

SIDE_LABEL = {"OS": "One Side", "DS": "Double Side"}


def seed_paper_prices():
    db = SessionLocal()
    try:
        existing = {p.size + p.side_type for p in db.query(PaperPrice).all()}
        for size, side, price in DEFAULT_PAPER_PRICES:
            key = size + side
            if key in existing:
                continue
            label = f"{size} {SIDE_LABEL[side]}"
            db.add(PaperPrice(label=label, size=size, side_type=side, unit_price=price))
        db.commit()
    finally:
        db.close()

class PaperStock(Base):
    __tablename__ = "paper_stock"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    size       = Column(String(16), nullable=False, unique=True)
    balance    = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                         onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PaperStock {self.size}: {self.balance}>"


class PaperPacketLog(Base):
    __tablename__ = "paper_packet_logs"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    size         = Column(String(16), nullable=False)
    sheets_added = Column(Integer, nullable=False, default=100)
    created_at   = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at   = Column(DateTime, nullable=False, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PaperPacketLog {self.size} +{self.sheets_added}>"


class PaperUsageEntry(Base):
    __tablename__ = "paper_usage_entries"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    job_no        = Column(String(64),  nullable=False)
    operator_name = Column(String(128), nullable=False)
    paper_size    = Column(String(16),  nullable=False)
    ok_pages      = Column(Integer, nullable=False, default=0)
    print_damage  = Column(Integer, nullable=False, default=0)
    accu_rp       = Column(Integer, nullable=False, default=0)
    bind_rp       = Column(Integer, nullable=False, default=0)
    total_used    = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                         onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PaperUsageEntry job={self.job_no} used={self.total_used}>"


def seed_paper_stock():
    db = SessionLocal()
    try:
        existing = {s.size for s in db.query(PaperStock).all()}
        for size in PAPER_SIZES:
            if size in existing:
                continue
            db.add(PaperStock(size=size, balance=0))
        db.commit()
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    seed_paper_prices()
    seed_paper_stock()


def run_migration():
    from sqlalchemy import text, inspect

    if db_url.startswith("sqlite"):  # type: ignore
        inspector = inspect(engine)

        job_cols = {c["name"] for c in inspector.get_columns("job_cards")}
        with engine.connect() as conn:
            if "album_type" not in job_cols:
                conn.execute(text("ALTER TABLE job_cards ADD COLUMN album_type VARCHAR(16)"))
                conn.commit()

        damage_cols = {c["name"] for c in inspector.get_columns("damage_entries")}
        with engine.connect() as conn:
            if "job_no" not in damage_cols:
                conn.execute(text("ALTER TABLE damage_entries ADD COLUMN job_no VARCHAR(64)"))
                conn.commit()
            if "customer" not in damage_cols:
                conn.execute(text("ALTER TABLE damage_entries ADD COLUMN customer VARCHAR(256)"))
                conn.commit()
        return

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

        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS machine VARCHAR(32);
        """))

        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS payment_by VARCHAR(128);
        """))

        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMP;
        """))

        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS box_pouch_status VARCHAR(32);
        """))
        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
        """))
        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS is_story BOOLEAN DEFAULT FALSE;
        """))

        conn.execute(text("""
            ALTER TABLE department_logs
            ADD COLUMN IF NOT EXISTS is_rebind BOOLEAN DEFAULT FALSE;
        """))
        conn.execute(text("""
            ALTER TABLE job_cards
            ADD COLUMN IF NOT EXISTS album_type VARCHAR(16);
        """))
        conn.execute(text("""
            ALTER TABLE damage_entries
            ADD COLUMN IF NOT EXISTS job_no VARCHAR(64);
        """))

        conn.execute(text("""
            ALTER TABLE damage_entries
            ADD COLUMN IF NOT EXISTS customer VARCHAR(256);
        """))

        conn.commit()

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()