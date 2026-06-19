from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

import firestore_backend


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "mnunesnails.db"
FIRESTORE = None
SESSION_COOKIE = "mnunes_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
ALLOWED_STATUS = {"Confirmado", "Alterado", "Pendente", "Cancelado"}
PASSWORD_ITERATIONS = 180_000
DEFAULT_ADMIN = {
    "name": "Administrador",
    "phone": "00000000000",
    "password": "admin123",
}
DEFAULT_SERVICES = [
    {
        "name": "Manicure cl\u00e1ssica",
        "legacy_name": "Manicure classica",
        "description": "Cutilagem cuidadosa, esmalta\u00e7\u00e3o tradicional e finaliza\u00e7\u00e3o brilhante.",
        "price": "R$ 35",
        "duration": "45 min",
    },
    {
        "name": "Banho em gel",
        "description": "Refor\u00e7o e prote\u00e7\u00e3o para unhas naturais com acabamento elegante.",
        "price": "R$ 55",
        "duration": "60 min",
    },
    {
        "name": "Esmalta\u00e7\u00e3o em gel",
        "legacy_name": "Esmaltacao em gel",
        "description": "Durabilidade prolongada com brilho intenso e secagem r\u00e1pida.",
        "price": "R$ 65",
        "duration": "70 min",
    },
    {
        "name": "Spa das m\u00e3os",
        "legacy_name": "Spa das maos",
        "description": "Esfolia\u00e7\u00e3o, hidrata\u00e7\u00e3o profunda e massagem relaxante.",
        "price": "R$ 50",
        "duration": "50 min",
    },
    {
        "name": "Blindagem",
        "description": "Camada protetora que ajuda a evitar quebras e melhora a resist\u00eancia.",
        "price": "R$ 60",
        "duration": "70 min",
    },
    {
        "name": "Pacote premium",
        "description": "Manicure, spa das m\u00e3os e nail art delicada em uma \u00fanica reserva.",
        "price": "R$ 95",
        "duration": "90 min",
    },
]
DEFAULT_DAY_SLOTS = [
    f"{hour:02d}:{minute:02d}"
    for hour in range(8, 19)
    for minute in (0, 30)
    if hour < 18 or minute == 0
]
WORKDAY_START_MINUTES = 8 * 60
WORKDAY_END_MINUTES = 18 * 60
WEEKDAYS_PT = {
    0: "Segunda-feira",
    1: "Terca-feira",
    2: "Quarta-feira",
    3: "Quinta-feira",
    4: "Sexta-feira",
    5: "Sabado",
    6: "Domingo",
}


def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file()


class AuthError(Exception):
    pass


class ForbiddenError(Exception):
    pass


def use_firestore():
    backend = os.environ.get("DATABASE_BACKEND", "").strip().lower()
    return backend == "firestore" or bool(
        os.environ.get("FIREBASE_SERVICE_ACCOUNT") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )


def get_firestore():
    global FIRESTORE
    if FIRESTORE is None:
        FIRESTORE = firestore_backend.FirestoreBackend(ROOT)
    return FIRESTORE


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_phone(phone):
    return re.sub(r"\D", "", phone or "")


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()
    return salt, password_hash


def verify_password(password, salt, expected_hash):
    if not salt or not expected_hash:
        return False

    _, password_hash = hash_password(password, salt)
    return hmac.compare_digest(password_hash, expected_hash)


def ensure_column(connection, table, column, definition):
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }

    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def init_database():
    if use_firestore():
        get_firestore().init_database()
        return

    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              phone_normalized TEXT NOT NULL UNIQUE,
              whatsapp TEXT NOT NULL DEFAULT '',
              password_salt TEXT,
              password_hash TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
              id TEXT PRIMARY KEY,
              user_id INTEGER NOT NULL,
              service TEXT NOT NULL,
              appointment_date TEXT NOT NULL,
              appointment_time TEXT NOT NULL,
              notes TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'Confirmado',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS admins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              phone_normalized TEXT NOT NULL UNIQUE,
              password_salt TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              actor_type TEXT NOT NULL,
              actor_id INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS availability_slots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              date_label TEXT NOT NULL,
              appointment_time TEXT NOT NULL,
              is_available INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(date_label, appointment_time)
            );

            CREATE TABLE IF NOT EXISTS services (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              description TEXT NOT NULL DEFAULT '',
              price TEXT NOT NULL DEFAULT '',
              duration TEXT NOT NULL DEFAULT '',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_appointments_user_id
              ON appointments(user_id);

            CREATE INDEX IF NOT EXISTS idx_appointments_date_time
              ON appointments(appointment_date, appointment_time);

            CREATE INDEX IF NOT EXISTS idx_sessions_actor
              ON sessions(actor_type, actor_id);
            """
        )
        ensure_column(connection, "users", "whatsapp", "whatsapp TEXT NOT NULL DEFAULT ''")
        ensure_column(connection, "users", "password_salt", "password_salt TEXT")
        ensure_column(connection, "users", "password_hash", "password_hash TEXT")
        ensure_default_admin(connection)
        ensure_default_services(connection)
        ensure_availability_window(connection)


def ensure_default_admin(connection):
    has_admin = connection.execute("SELECT id FROM admins LIMIT 1").fetchone()

    if has_admin:
        return

    salt, password_hash = hash_password(DEFAULT_ADMIN["password"])
    timestamp = now_iso()
    connection.execute(
        """
        INSERT INTO admins (
          name, phone, phone_normalized, password_salt,
          password_hash, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            DEFAULT_ADMIN["name"],
            DEFAULT_ADMIN["phone"],
            normalize_phone(DEFAULT_ADMIN["phone"]),
            salt,
            password_hash,
            timestamp,
            timestamp,
        ),
    )


def ensure_default_services(connection):
    timestamp = now_iso()

    for service in DEFAULT_SERVICES:
        legacy_name = service.get("legacy_name", service["name"])
        existing_current = connection.execute(
            "SELECT id FROM services WHERE name = ? LIMIT 1",
            (service["name"],),
        ).fetchone()

        if existing_current:
            continue

        existing_legacy = connection.execute(
            "SELECT id FROM services WHERE name = ? LIMIT 1",
            (legacy_name,),
        ).fetchone()

        if existing_legacy:
            connection.execute(
                """
                UPDATE services
                   SET name = ?,
                       description = ?,
                       price = ?,
                       duration = ?,
                       updated_at = ?
                 WHERE id = ?
                """,
                (
                    service["name"],
                    service["description"],
                    service["price"],
                    service["duration"],
                    timestamp,
                    existing_legacy["id"],
                ),
            )
            continue

        connection.execute(
            """
            INSERT OR IGNORE INTO services (
              name, description, price, duration, is_active, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """,
            (
                service["name"],
                service["description"],
                service["price"],
                service["duration"],
                timestamp,
                timestamp,
            ),
        )


def row_to_user(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "phone": row["phone"],
        "whatsapp": row["whatsapp"] if "whatsapp" in row.keys() else "",
        "appointmentCount": row["appointment_count"] if "appointment_count" in row.keys() else 0,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_admin(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "phone": row["phone"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_appointment(row):
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "name": row["name"],
        "phone": row["phone"],
        "whatsapp": row["whatsapp"] if "whatsapp" in row.keys() else "",
        "service": row["service"],
        "date": row["appointment_date"],
        "time": row["appointment_time"],
        "notes": row["notes"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_service(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": row["price"],
        "duration": row["duration"],
        "isActive": bool(row["is_active"]),
        "appointmentCount": row["appointment_count"] if "appointment_count" in row.keys() else 0,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def time_to_minutes(time_value):
    hour, minute = [int(part) for part in str(time_value).split(":", 1)]
    return hour * 60 + minute


def minutes_to_time(minutes):
    hour = minutes // 60
    minute = minutes % 60
    return f"{hour:02d}:{minute:02d}"


def is_within_workday(time_value):
    minutes = time_to_minutes(time_value)
    return WORKDAY_START_MINUTES <= minutes <= WORKDAY_END_MINUTES


def service_duration_minutes(connection, service_name):
    row = connection.execute(
        "SELECT duration FROM services WHERE name = ?",
        (service_name,),
    ).fetchone()
    duration_text = row["duration"] if row else ""
    match = re.search(r"\d+", duration_text or "")

    return int(match.group(0)) if match else 30


def date_label_for(day):
    weekday = WEEKDAYS_PT[day.weekday()]
    return f"{weekday}, {day.strftime('%d/%m')}"


def availability_sort_key(date_label):
    try:
        _, date_part = date_label.split(", ", 1)
        day, month = [int(part) for part in date_part.split("/")]
        today = datetime.now().date()
        return today.replace(month=month, day=day)
    except (ValueError, TypeError):
        return datetime.max.date()


def upcoming_default_availability():
    dates = {}
    cursor = datetime.now().date()
    end_date = cursor.replace(month=12, day=31)

    while cursor <= end_date:
        dates[date_label_for(cursor)] = DEFAULT_DAY_SLOTS
        cursor += timedelta(days=1)

    return dates


def ensure_availability_window(connection):
    timestamp = now_iso()

    for date_label, slots in upcoming_default_availability().items():
        for appointment_time in slots:
            connection.execute(
                """
                INSERT OR IGNORE INTO availability_slots (
                  date_label, appointment_time, is_available, created_at, updated_at
                )
                VALUES (?, ?, 1, ?, ?)
                """,
                (date_label, appointment_time, timestamp, timestamp),
            )


def row_to_availability_slot(row):
    return {
        "id": row["id"],
        "date": row["date_label"],
        "time": row["appointment_time"],
        "isAvailable": bool(row["is_available"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def validate_user_payload(payload):
    name = str(payload.get("name", "")).strip()
    phone = str(payload.get("phone", "")).strip()
    phone_normalized = normalize_phone(phone)

    if not name:
        raise ValueError("Informe o nome.")

    if len(phone_normalized) < 10:
        raise ValueError("Informe um telefone valido com DDD.")

    return name, phone, phone_normalized


def validate_registration_payload(payload):
    if not str(payload.get("phone", "")).strip() and str(payload.get("whatsapp", "")).strip():
        payload = {**payload, "phone": payload.get("whatsapp", "")}

    name, phone, phone_normalized = validate_user_payload(payload)
    whatsapp = str(payload.get("whatsapp", "")).strip()
    whatsapp_normalized = normalize_phone(whatsapp)

    if len(whatsapp_normalized) < 10:
        raise ValueError("Informe um WhatsApp valido com DDD.")

    return name, phone, phone_normalized, whatsapp


def validate_password_payload(payload):
    password = str(payload.get("password", ""))

    if len(password) < 4:
        raise ValueError("Informe uma senha com pelo menos 4 caracteres.")

    return password


def validate_appointment_details(payload):
    service = str(payload.get("service", "")).strip()
    appointment_date = str(payload.get("date", "")).strip()
    appointment_time = str(payload.get("time", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    status = str(payload.get("status", "Confirmado")).strip() or "Confirmado"

    if not service:
        raise ValueError("Informe o servico.")

    if not appointment_date:
        raise ValueError("Informe o dia.")

    if not appointment_time:
        raise ValueError("Informe o horario.")

    if status not in ALLOWED_STATUS:
        raise ValueError("Status invalido.")

    return {
        "service": service,
        "date": appointment_date,
        "time": appointment_time,
        "notes": notes,
        "status": status,
    }


def validate_availability_payload(payload):
    date_label = str(payload.get("date", "")).strip()
    appointment_time = str(payload.get("time", "")).strip()
    is_available = bool(payload.get("isAvailable"))

    if not date_label:
        raise ValueError("Informe o dia.")

    if not appointment_time:
        raise ValueError("Informe o horario.")

    if not re.fullmatch(r"\d{2}:\d{2}", appointment_time):
        raise ValueError("Informe o horario no formato HH:MM.")

    return date_label, appointment_time, is_available


def validate_availability_day_payload(payload):
    date_label = str(payload.get("date", "")).strip()
    is_available = bool(payload.get("isAvailable"))

    if not date_label:
        raise ValueError("Informe o dia.")

    return date_label, is_available


def validate_service_payload(payload, require_name=True):
    name = str(payload.get("name", "")).strip()
    description = str(payload.get("description", "")).strip()
    price = str(payload.get("price", "")).strip()
    duration = str(payload.get("duration", "")).strip()
    is_active = bool(payload.get("isActive", True))

    if require_name and not name:
        raise ValueError("Informe o nome do servico.")

    price_number = re.search(r"\d+(?:[,.]\d{1,2})?", price)
    duration_number = re.search(r"\d+", duration)

    if price_number:
        price = f"R$ {price_number.group(0).replace('.', ',')}"

    if duration_number:
        duration = f"{duration_number.group(0)} min"

    return {
        "name": name,
        "description": description,
        "price": price,
        "duration": duration,
        "isActive": is_active,
    }


def find_user_by_phone(connection, phone_normalized):
    return connection.execute(
        "SELECT * FROM users WHERE phone_normalized = ?",
        (phone_normalized,),
    ).fetchone()


def find_user_by_id(connection, user_id):
    return connection.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()


def upsert_user(connection, name, phone, phone_normalized, whatsapp=""):
    timestamp = now_iso()
    existing = find_user_by_phone(connection, phone_normalized)
    whatsapp = whatsapp or phone

    if existing:
        connection.execute(
            """
            UPDATE users
               SET name = ?, phone = ?, whatsapp = ?, updated_at = ?
             WHERE id = ?
            """,
            (name, phone, whatsapp, timestamp, existing["id"]),
        )
        return existing["id"]

    cursor = connection.execute(
        """
        INSERT INTO users (name, phone, phone_normalized, whatsapp, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (name, phone, phone_normalized, whatsapp, timestamp, timestamp),
    )
    return cursor.lastrowid


def set_user_password(connection, user_id, password):
    salt, password_hash = hash_password(password)
    connection.execute(
        """
        UPDATE users
           SET password_salt = ?,
               password_hash = ?,
               updated_at = ?
         WHERE id = ?
        """,
        (salt, password_hash, now_iso(), user_id),
    )


def update_current_user(connection, user_id, name, phone, phone_normalized):
    existing_owner = find_user_by_phone(connection, phone_normalized)

    if existing_owner and existing_owner["id"] != user_id:
        raise ValueError("Este telefone ja esta vinculado a outro usuario.")

    connection.execute(
        """
        UPDATE users
           SET name = ?, phone = ?, phone_normalized = ?, updated_at = ?
         WHERE id = ?
        """,
        (name, phone, phone_normalized, now_iso(), user_id),
    )
    return user_id


def create_session(actor_type, actor_id):
    if use_firestore():
        return get_firestore().create_session(actor_type, actor_id)

    token = secrets.token_urlsafe(32)

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO sessions (token, actor_type, actor_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, actor_type, actor_id, now_iso()),
        )

    return token


def register_user(payload):
    if use_firestore():
        return get_firestore().register_user(payload)

    name, phone, phone_normalized, whatsapp = validate_registration_payload(payload)
    password = validate_password_payload(payload)

    with get_connection() as connection:
        existing = find_user_by_phone(connection, phone_normalized)

        if existing:
            raise ValueError("Este telefone ja esta cadastrado. Use entrar.")

        user_id = upsert_user(connection, name, phone, phone_normalized, whatsapp)
        set_user_password(connection, user_id, password)
        user = find_user_by_id(connection, user_id)

    token = create_session("user", user["id"])
    return row_to_user(user), token


def login_user(payload):
    if use_firestore():
        return get_firestore().login_user(payload)

    phone = str(payload.get("phone", "")).strip()
    phone_normalized = normalize_phone(phone)
    password = validate_password_payload(payload)

    with get_connection() as connection:
        user = find_user_by_phone(connection, phone_normalized)

        if not user or not verify_password(password, user["password_salt"], user["password_hash"]):
            raise AuthError("Telefone ou senha invalidos.")

    token = create_session("user", user["id"])
    return row_to_user(user), token


def recover_user_password(payload):
    if use_firestore():
        return get_firestore().recover_user_password(payload)

    phone = str(payload.get("phone", "")).strip()
    phone_normalized = normalize_phone(phone)
    password = validate_password_payload(payload)

    with get_connection() as connection:
        user = find_user_by_phone(connection, phone_normalized)

        if not user:
            raise ValueError("Nao encontramos cadastro com este WhatsApp.")

        set_user_password(connection, user["id"], password)

    return {"ok": True}


def login_admin(payload):
    if use_firestore():
        return get_firestore().login_admin(payload)

    phone = str(payload.get("phone", "")).strip()
    phone_normalized = normalize_phone(phone)
    password = validate_password_payload(payload)

    with get_connection() as connection:
        admin = connection.execute(
            "SELECT * FROM admins WHERE phone_normalized = ?",
            (phone_normalized,),
        ).fetchone()

        if not admin or not verify_password(password, admin["password_salt"], admin["password_hash"]):
            raise AuthError("Telefone ou senha de administrador invalidos.")

    token = create_session("admin", admin["id"])
    return row_to_admin(admin), token


def delete_session(token):
    if use_firestore():
        get_firestore().delete_session(token)
        return

    if not token:
        return

    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_user_session(token):
    if use_firestore():
        return get_firestore().get_user_session(token)

    if not token:
        return None

    with get_connection() as connection:
        session = connection.execute(
            "SELECT * FROM sessions WHERE token = ?",
            (token,),
        ).fetchone()

        if not session:
            return None

        if session["actor_type"] == "user":
            user = find_user_by_id(connection, session["actor_id"])

            if not user:
                connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
                return None

            return {"role": "user", "user": row_to_user(user), "id": user["id"]}

        if session["actor_type"] == "admin":
            admin = connection.execute(
                "SELECT * FROM admins WHERE id = ?",
                (session["actor_id"],),
            ).fetchone()

            if not admin:
                connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
                return None

            return {"role": "admin", "admin": row_to_admin(admin), "id": admin["id"]}

    return None


def list_users():
    if use_firestore():
        return get_firestore().list_users()

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
              users.*,
              COUNT(appointments.id) AS appointment_count
            FROM users
            LEFT JOIN appointments ON appointments.user_id = users.id
            GROUP BY users.id
            ORDER BY users.updated_at DESC, users.id DESC
            """
        ).fetchall()
    return [row_to_user(row) for row in rows]


def list_services(include_inactive=False):
    if use_firestore():
        return get_firestore().list_services(include_inactive=include_inactive)

    with get_connection() as connection:
        ensure_default_services(connection)
        query = """
            SELECT
              services.*,
              COUNT(appointments.id) AS appointment_count
            FROM services
            LEFT JOIN appointments
              ON appointments.service = services.name
             AND appointments.status != 'Cancelado'
        """

        if not include_inactive:
            query += " WHERE services.is_active = 1"

        query += " GROUP BY services.id ORDER BY services.id ASC"
        rows = connection.execute(query).fetchall()

    return [row_to_service(row) for row in rows]


def get_service(service_id):
    if use_firestore():
        return get_firestore().get_service(service_id)

    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM services WHERE id = ?",
            (service_id,),
        ).fetchone()

    return row_to_service(row) if row else None


def create_service(payload):
    if use_firestore():
        return get_firestore().create_service(payload)

    data = validate_service_payload(payload)
    timestamp = now_iso()

    with get_connection() as connection:
        try:
            cursor = connection.execute(
                """
                INSERT INTO services (
                  name, description, price, duration, is_active, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["name"],
                    data["description"],
                    data["price"],
                    data["duration"],
                    1 if data["isActive"] else 0,
                    timestamp,
                    timestamp,
                ),
            )
        except sqlite3.IntegrityError:
            raise ValueError("Ja existe um servico com este nome.")

        service_id = cursor.lastrowid

    return get_service(service_id)


def update_service(service_id, payload):
    if use_firestore():
        return get_firestore().update_service(service_id, payload)

    current = get_service(service_id)

    if current is None:
        return None

    data = validate_service_payload(payload, require_name=False)
    name = data["name"] or current["name"]
    timestamp = now_iso()

    with get_connection() as connection:
        try:
            connection.execute(
                """
                UPDATE services
                   SET name = ?,
                       description = ?,
                       price = ?,
                       duration = ?,
                       is_active = ?,
                       updated_at = ?
                 WHERE id = ?
                """,
                (
                    name,
                    data["description"],
                    data["price"],
                    data["duration"],
                    1 if data["isActive"] else 0,
                    timestamp,
                    service_id,
                ),
            )
        except sqlite3.IntegrityError:
            raise ValueError("Ja existe um servico com este nome.")

    return get_service(service_id)


def delete_service(service_id):
    if use_firestore():
        return get_firestore().delete_service(service_id)

    with get_connection() as connection:
        current = get_service(service_id)

        if current is None:
            return False

        connection.execute("DELETE FROM services WHERE id = ?", (service_id,))

    return True


def update_user(user_id, payload):
    if use_firestore():
        return get_firestore().update_user(user_id, payload)

    name, phone, phone_normalized = validate_user_payload(payload)
    whatsapp = str(payload.get("whatsapp", phone)).strip() or phone

    with get_connection() as connection:
        current = find_user_by_id(connection, user_id)

        if current is None:
            return None

        existing_owner = find_user_by_phone(connection, phone_normalized)

        if existing_owner and existing_owner["id"] != user_id:
            raise ValueError("Este telefone ja esta vinculado a outro usuario.")

        connection.execute(
            """
            UPDATE users
               SET name = ?,
                   phone = ?,
                   phone_normalized = ?,
                   whatsapp = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            (name, phone, phone_normalized, whatsapp, now_iso(), user_id),
        )

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
              users.*,
              COUNT(appointments.id) AS appointment_count
            FROM users
            LEFT JOIN appointments ON appointments.user_id = users.id
            WHERE users.id = ?
            GROUP BY users.id
            """,
            (user_id,),
        ).fetchone()

    return row_to_user(row)


def delete_user(user_id):
    if use_firestore():
        return get_firestore().delete_user(user_id)

    with get_connection() as connection:
        current = find_user_by_id(connection, user_id)

        if current is None:
            return False

        connection.execute("DELETE FROM users WHERE id = ?", (user_id,))

    return True


def dynamic_slots_for_date(connection, date_label):
    rows = connection.execute(
        """
        SELECT service, appointment_time
        FROM appointments
        WHERE appointment_date = ?
          AND status != 'Cancelado'
        """,
        (date_label,),
    ).fetchall()
    slots = set(DEFAULT_DAY_SLOTS)

    for row in rows:
        appointment_end = time_to_minutes(row["appointment_time"]) + service_duration_minutes(connection, row["service"])

        if WORKDAY_START_MINUTES <= appointment_end <= WORKDAY_END_MINUTES:
            slots.add(minutes_to_time(appointment_end))

    return sorted(slots, key=time_to_minutes)


def list_availability():
    if use_firestore():
        return get_firestore().list_availability()

    with get_connection() as connection:
        ensure_availability_window(connection)
        default_dates = upcoming_default_availability()
        rows = connection.execute(
            """
            SELECT *
            FROM availability_slots
            ORDER BY id ASC
            """
        ).fetchall()
        manual_availability = {
            (row["date_label"], row["appointment_time"]): bool(row["is_available"])
            for row in rows
        }
        dates = []

        for date_label in sorted(default_dates.keys(), key=availability_sort_key):
            date_group = {"date": date_label, "slots": []}

            for appointment_time in dynamic_slots_for_date(connection, date_label):
                is_manual_available = manual_availability.get((date_label, appointment_time), True)
                date_group["slots"].append(
                    {
                        "time": appointment_time,
                        "isAvailable": is_manual_available and not is_slot_occupied(connection, date_label, appointment_time),
                    }
                )

            dates.append(date_group)

    return dates


def set_availability(payload):
    if use_firestore():
        return get_firestore().set_availability(payload)

    date_label, appointment_time, is_available = validate_availability_payload(payload)
    timestamp = now_iso()

    with get_connection() as connection:
        if is_available and is_slot_occupied(connection, date_label, appointment_time):
            raise ValueError("Este horario tem agendamento ativo. Cancele o agendamento para liberar.")

        connection.execute(
            """
            INSERT INTO availability_slots (
              date_label, appointment_time, is_available, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(date_label, appointment_time)
            DO UPDATE SET
              is_available = excluded.is_available,
              updated_at = excluded.updated_at
            """,
            (date_label, appointment_time, 1 if is_available else 0, timestamp, timestamp),
        )

    return {"date": date_label, "time": appointment_time, "isAvailable": is_available}


def set_day_availability(payload):
    if use_firestore():
        return get_firestore().set_day_availability(payload)

    date_label, is_available = validate_availability_day_payload(payload)
    timestamp = now_iso()

    with get_connection() as connection:
        ensure_availability_window(connection)

        for appointment_time in DEFAULT_DAY_SLOTS:
            slot_is_available = is_available and not is_slot_occupied(connection, date_label, appointment_time)
            connection.execute(
                """
                INSERT INTO availability_slots (
                  date_label, appointment_time, is_available, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(date_label, appointment_time)
                DO UPDATE SET
                  is_available = excluded.is_available,
                  updated_at = excluded.updated_at
                """,
                (date_label, appointment_time, 1 if slot_is_available else 0, timestamp, timestamp),
            )

    return {"date": date_label, "isAvailable": is_available}


def appointment_blocks_slot(connection, appointment, slot_time):
    slot_start = time_to_minutes(slot_time)
    appointment_start = time_to_minutes(appointment["appointment_time"])
    appointment_end = appointment_start + service_duration_minutes(connection, appointment["service"])

    return appointment_start <= slot_start < appointment_end


def is_slot_occupied(connection, date_label, appointment_time, ignored_appointment_id=None):
    rows = connection.execute(
        """
        SELECT id, service, appointment_time
        FROM appointments
        WHERE appointment_date = ?
          AND status != 'Cancelado'
        """,
        (date_label,),
    ).fetchall()

    return any(
        row["id"] != ignored_appointment_id and appointment_blocks_slot(connection, row, appointment_time)
        for row in rows
    )


def appointment_overlaps_existing(connection, date_label, appointment_time, service_name, ignored_appointment_id=None):
    appointment_start = time_to_minutes(appointment_time)
    appointment_end = appointment_start + service_duration_minutes(connection, service_name)

    if appointment_end > WORKDAY_END_MINUTES:
        return True

    rows = connection.execute(
        """
        SELECT id, service, appointment_time
        FROM appointments
        WHERE appointment_date = ?
          AND status != 'Cancelado'
        """,
        (date_label,),
    ).fetchall()

    for row in rows:
        if row["id"] == ignored_appointment_id:
            continue

        existing_start = time_to_minutes(row["appointment_time"])
        existing_end = existing_start + service_duration_minutes(connection, row["service"])

        if appointment_start < existing_end and existing_start < appointment_end:
            return True

    return False


def is_slot_available(connection, date_label, appointment_time, service_name=None, ignored_appointment_id=None):
    ensure_availability_window(connection)

    if date_label not in upcoming_default_availability() or not is_within_workday(appointment_time):
        return False

    if appointment_time in DEFAULT_DAY_SLOTS:
        row = connection.execute(
            """
            SELECT is_available
            FROM availability_slots
            WHERE date_label = ? AND appointment_time = ?
            """,
            (date_label, appointment_time),
        ).fetchone()

        if not row or not row["is_available"]:
            return False

    if service_name:
        return not appointment_overlaps_existing(
            connection,
            date_label,
            appointment_time,
            service_name,
            ignored_appointment_id=ignored_appointment_id,
        )

    return not is_slot_occupied(connection, date_label, appointment_time, ignored_appointment_id=ignored_appointment_id)


def list_appointments(session, filters=None):
    if use_firestore():
        return get_firestore().list_appointments(session, filters)

    filters = filters or {}
    conditions = []
    params = []

    if session["role"] == "user":
        conditions.append("appointments.user_id = ?")
        params.append(session["id"])

    status = str(filters.get("status", "")).strip()
    if status and status in ALLOWED_STATUS:
        conditions.append("appointments.status = ?")
        params.append(status)

    appointment_date = str(filters.get("date", "")).strip()
    if appointment_date:
        conditions.append("appointments.appointment_date = ?")
        params.append(appointment_date)

    search = str(filters.get("search", "")).strip()
    if search:
        like = f"%{search}%"
        conditions.append(
            """
            (
              users.name LIKE ?
              OR users.phone LIKE ?
              OR users.whatsapp LIKE ?
              OR users.phone_normalized LIKE ?
              OR appointments.service LIKE ?
            )
            """
        )
        params.extend([like, like, like, like, like])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
              appointments.*,
              users.name,
              users.phone,
              users.whatsapp
            FROM appointments
            JOIN users ON users.id = appointments.user_id
            {where}
            ORDER BY appointments.created_at DESC
            """,
            params,
        ).fetchall()
    return [row_to_appointment(row) for row in rows]


def get_appointment(appointment_id):
    if use_firestore():
        return get_firestore().get_appointment(appointment_id)

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
              appointments.*,
              users.name,
              users.phone,
              users.whatsapp
            FROM appointments
            JOIN users ON users.id = appointments.user_id
            WHERE appointments.id = ?
            """,
            (appointment_id,),
        ).fetchone()

    if row is None:
        return None

    return row_to_appointment(row)


def assert_can_access_appointment(session, appointment):
    if appointment is None:
        return

    if session["role"] == "admin":
        return

    if appointment["userId"] != session["id"]:
        raise ForbiddenError("Voce nao tem acesso a este agendamento.")


def resolve_appointment_user(connection, payload, session=None, current_user_id=None):
    name, phone, phone_normalized = validate_user_payload(payload)

    if session and session["role"] == "user":
        return update_current_user(connection, session["id"], name, phone, phone_normalized)

    if current_user_id and session and session["role"] == "user":
        return current_user_id

    existing = find_user_by_phone(connection, phone_normalized)

    if existing and not session:
        raise ValueError("Este telefone ja esta cadastrado. Entre na sua conta para agendar.")

    return upsert_user(connection, name, phone, phone_normalized)


def create_appointment(payload, session=None):
    if use_firestore():
        return get_firestore().create_appointment(payload, session=session)

    details = validate_appointment_details(payload)
    appointment_id = str(uuid.uuid4())
    timestamp = now_iso()

    with get_connection() as connection:
        if not is_slot_available(connection, details["date"], details["time"], service_name=details["service"]):
            raise ValueError("Este horario nao esta livre.")

        user_id = resolve_appointment_user(connection, payload, session=session)
        connection.execute(
            """
            INSERT INTO appointments (
              id, user_id, service, appointment_date, appointment_time,
              notes, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                appointment_id,
                user_id,
                details["service"],
                details["date"],
                details["time"],
                details["notes"],
                details["status"],
                timestamp,
                timestamp,
            ),
        )

    return get_appointment(appointment_id)


def update_appointment(appointment_id, payload, session):
    if use_firestore():
        return get_firestore().update_appointment(appointment_id, payload, session)

    current = get_appointment(appointment_id)

    if current is None:
        return None

    assert_can_access_appointment(session, current)
    details = validate_appointment_details(payload)
    timestamp = now_iso()

    with get_connection() as connection:
        if details["status"] != "Cancelado" and not is_slot_available(
            connection,
            details["date"],
            details["time"],
            service_name=details["service"],
            ignored_appointment_id=appointment_id,
        ):
            raise ValueError("Este horario nao esta livre.")

        user_id = resolve_appointment_user(
            connection,
            payload,
            session=session,
            current_user_id=current["userId"],
        )
        connection.execute(
            """
            UPDATE appointments
               SET user_id = ?,
                   service = ?,
                   appointment_date = ?,
                   appointment_time = ?,
                   notes = ?,
                   status = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            (
                user_id,
                details["service"],
                details["date"],
                details["time"],
                details["notes"],
                details["status"],
                timestamp,
                appointment_id,
            ),
        )

    return get_appointment(appointment_id)


def duplicate_appointment(appointment_id, session):
    if use_firestore():
        return get_firestore().duplicate_appointment(appointment_id, session)

    current = get_appointment(appointment_id)

    if current is None:
        return None

    assert_can_access_appointment(session, current)
    payload = {
        "name": current["name"],
        "phone": current["phone"],
        "service": current["service"],
        "date": current["date"],
        "time": current["time"],
        "notes": current["notes"],
        "status": "Pendente",
    }
    return create_appointment(payload, session=session if session["role"] == "user" else None)


def cancel_appointment(appointment_id, session):
    if use_firestore():
        return get_firestore().cancel_appointment(appointment_id, session)

    current = get_appointment(appointment_id)

    if current is None:
        return None

    assert_can_access_appointment(session, current)
    timestamp = now_iso()

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE appointments
               SET status = ?,
                   updated_at = ?
             WHERE id = ?
            """,
            ("Cancelado", timestamp, appointment_id),
        )

    return get_appointment(appointment_id)


def delete_appointment(appointment_id, session):
    if use_firestore():
        return get_firestore().delete_appointment(appointment_id, session)

    current = get_appointment(appointment_id)

    if current is None:
        return False

    assert_can_access_appointment(session, current)

    if current["status"] != "Cancelado":
        raise ValueError("Cancele o agendamento antes de excluir. O horario so e liberado ao cancelar.")

    with get_connection() as connection:
        connection.execute("DELETE FROM appointments WHERE id = ?", (appointment_id,))

    return True


class MnunesHandler(SimpleHTTPRequestHandler):
    server_version = "MnunesNailsHTTP/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/auth/me":
            session = self.current_session()
            self.send_json({"authenticated": bool(session), "session": session})
            return

        if parsed.path == "/api/users":
            session = self.require_session("admin")
            if session is None:
                return

            self.send_json({"users": list_users()})
            return

        if parsed.path == "/api/availability":
            self.send_json({"availability": list_availability()})
            return

        if parsed.path == "/api/services":
            session = self.current_session()
            include_inactive = bool(session and session["role"] == "admin")
            self.send_json({"services": list_services(include_inactive=include_inactive)})
            return

        if parsed.path == "/api/appointments":
            session = self.require_session()
            if session is None:
                return

            filters = self.get_filters(parsed)
            self.send_json({"appointments": list_appointments(session, filters)})
            return

        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/auth/register":
            self.handle_auth(register_user)
            return

        if parsed.path == "/api/auth/login":
            self.handle_auth(login_user)
            return

        if parsed.path == "/api/auth/recover-password":
            try:
                self.send_json(recover_user_password(self.read_json()))
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            return

        if parsed.path == "/api/auth/admin-login":
            self.handle_auth(login_admin)
            return

        if parsed.path == "/api/auth/logout":
            token = self.session_token()
            delete_session(token)
            self.send_json(
                {"ok": True},
                cookies=[self.clear_session_cookie()],
            )
            return

        if parsed.path == "/api/appointments":
            session = self.require_session()
            if session is None:
                return

            try:
                appointment = create_appointment(self.read_json(), session=session)
                self.send_json({"appointment": appointment}, status=201)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            return

        if parsed.path == "/api/availability":
            session = self.require_session("admin")
            if session is None:
                return

            try:
                slot = set_availability(self.read_json())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            self.send_json({"slot": slot})
            return

        if parsed.path == "/api/availability/day":
            session = self.require_session("admin")
            if session is None:
                return

            try:
                day = set_day_availability(self.read_json())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            self.send_json({"day": day})
            return

        if parsed.path == "/api/services":
            session = self.require_session("admin")
            if session is None:
                return

            try:
                service = create_service(self.read_json())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            self.send_json({"service": service}, status=201)
            return

        match = re.fullmatch(r"/api/appointments/([^/]+)/duplicate", parsed.path)
        if match:
            session = self.require_session()
            if session is None:
                return

            try:
                appointment = duplicate_appointment(match.group(1), session)
            except (ForbiddenError, firestore_backend.ForbiddenError) as error:
                self.send_json({"error": str(error)}, status=403)
                return

            if appointment is None:
                self.send_json({"error": "Agendamento nao encontrado."}, status=404)
                return

            self.send_json({"appointment": appointment}, status=201)
            return

        match = re.fullmatch(r"/api/appointments/([^/]+)/cancel", parsed.path)
        if match:
            session = self.require_session()
            if session is None:
                return

            try:
                appointment = cancel_appointment(match.group(1), session)
            except (ForbiddenError, firestore_backend.ForbiddenError) as error:
                self.send_json({"error": str(error)}, status=403)
                return

            if appointment is None:
                self.send_json({"error": "Agendamento nao encontrado."}, status=404)
                return

            self.send_json({"appointment": appointment})
            return

        self.send_json({"error": "Rota nao encontrada."}, status=404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        service_match = re.fullmatch(r"/api/services/(\d+)", parsed.path)

        if service_match:
            session = self.require_session("admin")
            if session is None:
                return

            try:
                service = update_service(int(service_match.group(1)), self.read_json())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            if service is None:
                self.send_json({"error": "Servico nao encontrado."}, status=404)
                return

            self.send_json({"service": service})
            return

        user_match = re.fullmatch(r"/api/users/(\d+)", parsed.path)

        if user_match:
            session = self.require_session("admin")
            if session is None:
                return

            try:
                user = update_user(int(user_match.group(1)), self.read_json())
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return

            if user is None:
                self.send_json({"error": "Usuario nao encontrado."}, status=404)
                return

            self.send_json({"user": user})
            return

        match = re.fullmatch(r"/api/appointments/([^/]+)", parsed.path)

        if not match:
            self.send_json({"error": "Rota nao encontrada."}, status=404)
            return

        session = self.require_session()
        if session is None:
            return

        try:
            appointment = update_appointment(match.group(1), self.read_json(), session)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)
            return
        except (ForbiddenError, firestore_backend.ForbiddenError) as error:
            self.send_json({"error": str(error)}, status=403)
            return

        if appointment is None:
            self.send_json({"error": "Agendamento nao encontrado."}, status=404)
            return

        self.send_json({"appointment": appointment})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        service_match = re.fullmatch(r"/api/services/(\d+)", parsed.path)

        if service_match:
            session = self.require_session("admin")
            if session is None:
                return

            if not delete_service(int(service_match.group(1))):
                self.send_json({"error": "Servico nao encontrado."}, status=404)
                return

            self.send_json({"ok": True})
            return

        user_match = re.fullmatch(r"/api/users/(\d+)", parsed.path)

        if user_match:
            session = self.require_session("admin")
            if session is None:
                return

            if not delete_user(int(user_match.group(1))):
                self.send_json({"error": "Usuario nao encontrado."}, status=404)
                return

            self.send_json({"ok": True})
            return

        appointment_match = re.fullmatch(r"/api/appointments/([^/]+)", parsed.path)

        if appointment_match:
            session = self.require_session("admin")
            if session is None:
                return

            try:
                was_deleted = delete_appointment(appointment_match.group(1), session)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
                return
            except (ForbiddenError, firestore_backend.ForbiddenError) as error:
                self.send_json({"error": str(error)}, status=403)
                return

            if not was_deleted:
                self.send_json({"error": "Agendamento nao encontrado."}, status=404)
                return

            self.send_json({"ok": True})
            return

        self.send_json({"error": "Rota nao encontrada."}, status=404)

    def handle_auth(self, auth_function):
        try:
            actor, token = auth_function(self.read_json())
            role = "admin" if auth_function == login_admin else "user"
            self.send_json(
                {"ok": True, "role": role, "actor": actor},
                cookies=[self.session_cookie(token)],
            )
        except (AuthError, firestore_backend.AuthError) as error:
            self.send_json({"error": str(error)}, status=401)
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)

    def get_filters(self, parsed):
        query = parse_qs(parsed.query)
        return {
            "status": (query.get("status") or [""])[0],
            "date": (query.get("date") or [""])[0],
            "search": (query.get("search") or [""])[0],
        }

    def session_token(self):
        cookie_header = self.headers.get("Cookie", "")
        cookie = SimpleCookie(cookie_header)
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""

    def current_session(self):
        return get_user_session(self.session_token())

    def require_session(self, role=None):
        session = self.current_session()

        if not session:
            self.send_json({"error": "Login necessario."}, status=401)
            return None

        if role and session["role"] != role:
            self.send_json({"error": "Acesso nao permitido."}, status=403)
            return None

        return session

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))

        if length == 0:
            return {}

        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body)

    def send_json(self, payload, status=200, cookies=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))

        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)

        self.end_headers()
        self.wfile.write(body)

    def session_cookie(self, token):
        return f"{SESSION_COOKIE}={token}; Path=/; Max-Age={SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax"

    def clear_session_cookie(self):
        return f"{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"

    def serve_static(self, request_path):
        path = request_path or "/"

        if path == "/":
            path = "/index.html"

        if path.endswith("/"):
            path += "index.html"

        requested = (ROOT / path.lstrip("/")).resolve()

        if not str(requested).startswith(str(ROOT)) or not requested.is_file():
            self.send_error(404, "Arquivo nao encontrado")
            return

        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        if requested.suffix in {".html", ".css", ".js"}:
            content_type += "; charset=utf-8"

        body = requested.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), format % args))


def main():
    init_database()
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "5500"))
    server = ThreadingHTTPServer((host, port), MnunesHandler)
    print(f"Servidor em http://{host}:{port}/")
    if use_firestore():
        store = get_firestore()
        print(f"Banco de dados Firestore: projeto={store.project_id}, database={store.database_id}")
    else:
        print(f"Banco de dados em {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
