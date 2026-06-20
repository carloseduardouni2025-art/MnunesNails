import hashlib
import hmac
import base64
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


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
DEFAULT_TIMEZONE = "America/Sao_Paulo"
WEEKDAYS_PT = {
    0: "Segunda-feira",
    1: "Terca-feira",
    2: "Quarta-feira",
    3: "Quinta-feira",
    4: "Sexta-feira",
    5: "Sabado",
    6: "Domingo",
}


class AuthError(Exception):
    pass


class ForbiddenError(Exception):
    pass


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def app_timezone():
    try:
        return ZoneInfo(os.environ.get("APP_TIMEZONE", DEFAULT_TIMEZONE))
    except Exception:
        return ZoneInfo(DEFAULT_TIMEZONE)


def local_now():
    return datetime.now(app_timezone())


def normalize_phone(phone):
    return re.sub(r"\D", "", phone or "")


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


def date_label_for(day):
    weekday = WEEKDAYS_PT[day.weekday()]
    return f"{weekday}, {day.strftime('%d/%m')}"


def availability_sort_key(date_label):
    try:
        _, date_part = date_label.split(", ", 1)
        day, month = [int(part) for part in date_part.split("/")]
        today = local_now().date()
        return today.replace(month=month, day=day)
    except (ValueError, TypeError):
        return datetime.max.date()


def upcoming_default_availability():
    dates = {}
    cursor = local_now().date()
    end_date = cursor.replace(month=12, day=31)
    while cursor <= end_date:
        dates[date_label_for(cursor)] = DEFAULT_DAY_SLOTS
        cursor += timedelta(days=1)
    return dates


def date_from_label(date_label):
    try:
        _, date_part = str(date_label).split(", ", 1)
        day, month = [int(part) for part in date_part.split("/")]
        today = local_now().date()
        return today.replace(month=month, day=day)
    except (ValueError, TypeError):
        return None


def is_future_slot(date_label, appointment_time):
    appointment_date = date_from_label(date_label)

    if appointment_date is None:
        return False

    now = local_now()
    today = now.date()

    if appointment_date < today:
        return False

    if appointment_date > today:
        return True

    return time_to_minutes(appointment_time) > (now.hour * 60 + now.minute)


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


class FirestoreBackend:
    def __init__(self, root):
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as error:
            raise RuntimeError("Instale firebase-admin para usar Firestore.") from error

        project_id = os.environ.get("FIREBASE_PROJECT_ID", "").strip() or "mnunesnails"
        database_id = os.environ.get("FIREBASE_FIRESTORE_DATABASE", "").strip() or "mnunesnails"
        credentials_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
        credentials_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT") or os.environ.get(
            "GOOGLE_APPLICATION_CREDENTIALS"
        )

        if credentials_path:
            credentials_path = str((root / credentials_path).resolve()) if not os.path.isabs(credentials_path) else credentials_path

        if not credentials_json and not credentials_path:
            raise RuntimeError(
                "Configure FIREBASE_SERVICE_ACCOUNT_JSON ou FIREBASE_SERVICE_ACCOUNT para usar Firestore."
            )

        if not firebase_admin._apps:
            if credentials_json:
                try:
                    credentials_info = json.loads(credentials_json)
                except json.JSONDecodeError:
                    credentials_info = json.loads(base64.b64decode(credentials_json).decode("utf-8"))
                cred = credentials.Certificate(credentials_info)
                app = firebase_admin.initialize_app(cred, {"projectId": project_id})
            elif credentials_path:
                cred = credentials.Certificate(credentials_path)
                app = firebase_admin.initialize_app(cred, {"projectId": project_id})
            else:
                app = firebase_admin.initialize_app(options={"projectId": project_id})
        else:
            app = firebase_admin.get_app()

        self.firestore = firestore
        self.project_id = project_id
        self.database_id = database_id
        self.db = firestore.client(app=app, database_id=database_id)

    def col(self, name):
        return self.db.collection(name)

    def doc_data(self, collection, doc_id):
        snapshot = self.col(collection).document(str(doc_id)).get()
        return snapshot.to_dict() if snapshot.exists else None

    def next_id(self, name):
        counter_ref = self.col("counters").document(name)

        @self.firestore.transactional
        def increment(transaction):
            snapshot = counter_ref.get(transaction=transaction)
            current = int(snapshot.to_dict().get("value", 0)) if snapshot.exists else 0
            next_value = current + 1
            transaction.set(counter_ref, {"value": next_value})
            return next_value

        return increment(self.db.transaction())

    def stream_data(self, collection):
        return [snapshot.to_dict() for snapshot in self.col(collection).stream()]

    def query_one(self, collection, field, op, value):
        query = self.col(collection).where(field, op, value).limit(1).stream()
        for snapshot in query:
            return snapshot.to_dict()
        return None

    def save(self, collection, doc_id, data, merge=False):
        self.col(collection).document(str(doc_id)).set(data, merge=merge)

    def delete(self, collection, doc_id):
        self.col(collection).document(str(doc_id)).delete()

    def init_database(self):
        self.ensure_default_admin()
        self.ensure_default_services()
        self.ensure_availability_window()

    def ensure_default_admin(self):
        if self.stream_data("admins"):
            return
        salt, password_hash = hash_password(DEFAULT_ADMIN["password"])
        timestamp = now_iso()
        admin_id = self.next_id("admins")
        self.save(
            "admins",
            admin_id,
            {
                "id": admin_id,
                "name": DEFAULT_ADMIN["name"],
                "phone": DEFAULT_ADMIN["phone"],
                "phone_normalized": normalize_phone(DEFAULT_ADMIN["phone"]),
                "password_salt": salt,
                "password_hash": password_hash,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )

    def ensure_default_services(self):
        timestamp = now_iso()
        for service in DEFAULT_SERVICES:
            existing_current = self.query_one("services", "name", "==", service["name"])
            if existing_current:
                self.save(
                    "services",
                    existing_current["id"],
                    {
                        "description": existing_current.get("description", service["description"]),
                        "price": existing_current.get("price", service["price"]),
                        "duration": existing_current.get("duration", service["duration"]),
                        "is_active": existing_current.get("is_active", True),
                        "created_at": existing_current.get("created_at", timestamp),
                        "updated_at": existing_current.get("updated_at", timestamp),
                    },
                    merge=True,
                )
                continue
            legacy_name = service.get("legacy_name", service["name"])
            existing_legacy = self.query_one("services", "name", "==", legacy_name)
            if existing_legacy:
                self.save(
                    "services",
                    existing_legacy["id"],
                    {
                        "name": service["name"],
                        "description": service["description"],
                        "price": service["price"],
                        "duration": service["duration"],
                        "is_active": existing_legacy.get("is_active", True),
                        "created_at": existing_legacy.get("created_at", timestamp),
                        "updated_at": timestamp,
                    },
                    merge=True,
                )
                continue
            service_id = self.next_id("services")
            self.save(
                "services",
                service_id,
                {
                    "id": service_id,
                    "name": service["name"],
                    "description": service["description"],
                    "price": service["price"],
                    "duration": service["duration"],
                    "is_active": True,
                    "created_at": timestamp,
                    "updated_at": timestamp,
                },
            )

    def ensure_availability_window(self):
        timestamp = now_iso()
        for date_label, slots in upcoming_default_availability().items():
            for appointment_time in slots:
                doc_id = self.availability_doc_id(date_label, appointment_time)
                if self.doc_data("availability_slots", doc_id):
                    continue
                self.save(
                    "availability_slots",
                    doc_id,
                    {
                        "id": doc_id,
                        "date_label": date_label,
                        "appointment_time": appointment_time,
                        "is_available": True,
                        "created_at": timestamp,
                        "updated_at": timestamp,
                    },
                )

    def availability_doc_id(self, date_label, appointment_time):
        return hashlib.sha1(f"{date_label}|{appointment_time}".encode("utf-8")).hexdigest()

    def row_to_user(self, row, appointment_count=0):
        timestamp = now_iso()
        return {
            "id": row["id"],
            "name": row["name"],
            "phone": row["phone"],
            "whatsapp": row.get("whatsapp", ""),
            "appointmentCount": appointment_count,
            "createdAt": row.get("created_at", timestamp),
            "updatedAt": row.get("updated_at", timestamp),
        }

    def row_to_admin(self, row):
        timestamp = now_iso()
        return {
            "id": row["id"],
            "name": row["name"],
            "phone": row["phone"],
            "createdAt": row.get("created_at", timestamp),
            "updatedAt": row.get("updated_at", timestamp),
        }

    def row_to_service(self, row, appointment_count=0):
        timestamp = now_iso()
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row.get("description", ""),
            "price": row.get("price", ""),
            "duration": row.get("duration", ""),
            "isActive": bool(row.get("is_active", True)),
            "appointmentCount": appointment_count,
            "createdAt": row.get("created_at", timestamp),
            "updatedAt": row.get("updated_at", timestamp),
        }

    def row_to_appointment(self, row):
        user = self.find_user_by_id(row["user_id"]) or {}
        timestamp = now_iso()
        return {
            "id": row["id"],
            "userId": row["user_id"],
            "name": user.get("name", ""),
            "phone": user.get("phone", ""),
            "whatsapp": user.get("whatsapp", ""),
            "service": row["service"],
            "date": row["appointment_date"],
            "time": row["appointment_time"],
            "notes": row.get("notes", ""),
            "status": row["status"],
            "createdAt": row.get("created_at", timestamp),
            "updatedAt": row.get("updated_at", timestamp),
        }

    def find_user_by_phone(self, phone_normalized):
        return self.query_one("users", "phone_normalized", "==", phone_normalized)

    def find_user_by_id(self, user_id):
        return self.doc_data("users", user_id)

    def upsert_user(self, name, phone, phone_normalized, whatsapp=""):
        timestamp = now_iso()
        existing = self.find_user_by_phone(phone_normalized)
        whatsapp = whatsapp or phone
        if existing:
            self.save(
                "users",
                existing["id"],
                {"name": name, "phone": phone, "whatsapp": whatsapp, "updated_at": timestamp},
                merge=True,
            )
            return existing["id"]
        user_id = self.next_id("users")
        self.save(
            "users",
            user_id,
            {
                "id": user_id,
                "name": name,
                "phone": phone,
                "phone_normalized": phone_normalized,
                "whatsapp": whatsapp,
                "password_salt": None,
                "password_hash": None,
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )
        return user_id

    def set_user_password(self, user_id, password):
        salt, password_hash = hash_password(password)
        self.save(
            "users",
            user_id,
            {"password_salt": salt, "password_hash": password_hash, "updated_at": now_iso()},
            merge=True,
        )

    def update_current_user(self, user_id, name, phone, phone_normalized):
        existing_owner = self.find_user_by_phone(phone_normalized)
        if existing_owner and existing_owner["id"] != user_id:
            raise ValueError("Este telefone ja esta vinculado a outro usuario.")
        self.save(
            "users",
            user_id,
            {"name": name, "phone": phone, "phone_normalized": phone_normalized, "updated_at": now_iso()},
            merge=True,
        )
        return user_id

    def create_session(self, actor_type, actor_id):
        token = secrets.token_urlsafe(32)
        self.save(
            "sessions",
            token,
            {"token": token, "actor_type": actor_type, "actor_id": actor_id, "created_at": now_iso()},
        )
        return token

    def register_user(self, payload):
        name, phone, phone_normalized, whatsapp = validate_registration_payload(payload)
        password = validate_password_payload(payload)
        if self.find_user_by_phone(phone_normalized):
            raise ValueError("Este telefone ja esta cadastrado. Use entrar.")
        user_id = self.upsert_user(name, phone, phone_normalized, whatsapp)
        self.set_user_password(user_id, password)
        user = self.find_user_by_id(user_id)
        token = self.create_session("user", user["id"])
        return self.row_to_user(user), token

    def login_user(self, payload):
        phone_normalized = normalize_phone(str(payload.get("phone", "")).strip())
        password = validate_password_payload(payload)
        user = self.find_user_by_phone(phone_normalized)
        if not user or not verify_password(password, user.get("password_salt"), user.get("password_hash")):
            raise AuthError("Telefone ou senha invalidos.")
        token = self.create_session("user", user["id"])
        return self.row_to_user(user), token

    def recover_user_password(self, payload):
        phone_normalized = normalize_phone(str(payload.get("phone", "")).strip())
        password = validate_password_payload(payload)
        user = self.find_user_by_phone(phone_normalized)
        if not user:
            raise ValueError("Nao encontramos cadastro com este WhatsApp.")
        self.set_user_password(user["id"], password)
        return {"ok": True}

    def login_admin(self, payload):
        phone_normalized = normalize_phone(str(payload.get("phone", "")).strip())
        password = validate_password_payload(payload)
        admin = self.query_one("admins", "phone_normalized", "==", phone_normalized)
        if not admin or not verify_password(password, admin.get("password_salt"), admin.get("password_hash")):
            raise AuthError("Telefone ou senha de administrador invalidos.")
        token = self.create_session("admin", admin["id"])
        return self.row_to_admin(admin), token

    def delete_session(self, token):
        if token:
            self.delete("sessions", token)

    def get_user_session(self, token):
        if not token:
            return None
        session = self.doc_data("sessions", token)
        if not session:
            return None
        if session["actor_type"] == "user":
            user = self.find_user_by_id(session["actor_id"])
            if not user:
                self.delete_session(token)
                return None
            return {"role": "user", "user": self.row_to_user(user), "id": user["id"]}
        if session["actor_type"] == "admin":
            admin = self.doc_data("admins", session["actor_id"])
            if not admin:
                self.delete_session(token)
                return None
            return {"role": "admin", "admin": self.row_to_admin(admin), "id": admin["id"]}
        return None

    def active_appointments(self):
        return [row for row in self.stream_data("appointments") if row.get("status") != "Cancelado"]

    def appointment_count_for_user(self, user_id):
        return sum(1 for row in self.stream_data("appointments") if row.get("user_id") == user_id)

    def appointment_count_for_service(self, service_name):
        return sum(1 for row in self.active_appointments() if row.get("service") == service_name)

    def list_users(self):
        rows = self.stream_data("users")
        rows.sort(key=lambda row: (row.get("updated_at", ""), row.get("id", 0)), reverse=True)
        return [self.row_to_user(row, self.appointment_count_for_user(row["id"])) for row in rows]

    def list_services(self, include_inactive=False):
        self.ensure_default_services()
        rows = self.stream_data("services")
        if not include_inactive:
            rows = [row for row in rows if row.get("is_active", True)]
        rows.sort(key=lambda row: row.get("id", 0))
        return [self.row_to_service(row, self.appointment_count_for_service(row["name"])) for row in rows]

    def get_service(self, service_id):
        row = self.doc_data("services", service_id)
        return self.row_to_service(row, self.appointment_count_for_service(row["name"])) if row else None

    def create_service(self, payload):
        data = validate_service_payload(payload)
        if self.query_one("services", "name", "==", data["name"]):
            raise ValueError("Ja existe um servico com este nome.")
        timestamp = now_iso()
        service_id = self.next_id("services")
        self.save(
            "services",
            service_id,
            {
                "id": service_id,
                "name": data["name"],
                "description": data["description"],
                "price": data["price"],
                "duration": data["duration"],
                "is_active": data["isActive"],
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )
        return self.get_service(service_id)

    def update_service(self, service_id, payload):
        current = self.doc_data("services", service_id)
        if current is None:
            return None
        data = validate_service_payload(payload, require_name=False)
        name = data["name"] or current["name"]
        owner = self.query_one("services", "name", "==", name)
        if owner and owner["id"] != service_id:
            raise ValueError("Ja existe um servico com este nome.")
        self.save(
            "services",
            service_id,
            {
                "name": name,
                "description": data["description"],
                "price": data["price"],
                "duration": data["duration"],
                "is_active": data["isActive"],
                "updated_at": now_iso(),
            },
            merge=True,
        )
        return self.get_service(service_id)

    def delete_service(self, service_id):
        if self.doc_data("services", service_id) is None:
            return False
        self.delete("services", service_id)
        return True

    def update_user(self, user_id, payload):
        name, phone, phone_normalized = validate_user_payload(payload)
        whatsapp = str(payload.get("whatsapp", phone)).strip() or phone
        current = self.find_user_by_id(user_id)
        if current is None:
            return None
        existing_owner = self.find_user_by_phone(phone_normalized)
        if existing_owner and existing_owner["id"] != user_id:
            raise ValueError("Este telefone ja esta vinculado a outro usuario.")
        self.save(
            "users",
            user_id,
            {
                "name": name,
                "phone": phone,
                "phone_normalized": phone_normalized,
                "whatsapp": whatsapp,
                "updated_at": now_iso(),
            },
            merge=True,
        )
        return self.row_to_user(self.find_user_by_id(user_id), self.appointment_count_for_user(user_id))

    def delete_user(self, user_id):
        if self.find_user_by_id(user_id) is None:
            return False
        for appointment in self.stream_data("appointments"):
            if appointment.get("user_id") == user_id:
                self.delete("appointments", appointment["id"])
        self.delete("users", user_id)
        return True

    def service_duration_minutes(self, service_name):
        row = self.query_one("services", "name", "==", service_name)
        duration_text = row.get("duration", "") if row else ""
        match = re.search(r"\d+", duration_text or "")
        return int(match.group(0)) if match else 30

    def dynamic_slots_for_date(self, date_label):
        slots = set(DEFAULT_DAY_SLOTS)
        for row in self.active_appointments():
            if row.get("appointment_date") != date_label:
                continue
            appointment_end = time_to_minutes(row["appointment_time"]) + self.service_duration_minutes(row["service"])
            if WORKDAY_START_MINUTES <= appointment_end <= WORKDAY_END_MINUTES:
                slots.add(minutes_to_time(appointment_end))
        return sorted(slots, key=time_to_minutes)

    def appointment_blocks_slot(self, appointment, slot_time):
        slot_start = time_to_minutes(slot_time)
        appointment_start = time_to_minutes(appointment["appointment_time"])
        appointment_end = appointment_start + self.service_duration_minutes(appointment["service"])
        return appointment_start <= slot_start < appointment_end

    def is_slot_occupied(self, date_label, appointment_time, ignored_appointment_id=None):
        return any(
            row["id"] != ignored_appointment_id
            and row.get("appointment_date") == date_label
            and self.appointment_blocks_slot(row, appointment_time)
            for row in self.active_appointments()
        )

    def appointment_overlaps_existing(self, date_label, appointment_time, service_name, ignored_appointment_id=None):
        appointment_start = time_to_minutes(appointment_time)
        appointment_end = appointment_start + self.service_duration_minutes(service_name)
        if appointment_end > WORKDAY_END_MINUTES:
            return True
        for row in self.active_appointments():
            if row.get("appointment_date") != date_label or row["id"] == ignored_appointment_id:
                continue
            existing_start = time_to_minutes(row["appointment_time"])
            existing_end = existing_start + self.service_duration_minutes(row["service"])
            if appointment_start < existing_end and existing_start < appointment_end:
                return True
        return False

    def is_slot_available(self, date_label, appointment_time, service_name=None, ignored_appointment_id=None):
        self.ensure_availability_window()
        if date_label not in upcoming_default_availability() or not is_within_workday(appointment_time):
            return False
        if not is_future_slot(date_label, appointment_time):
            return False
        if appointment_time in DEFAULT_DAY_SLOTS:
            slot = self.doc_data("availability_slots", self.availability_doc_id(date_label, appointment_time))
            if not slot or not slot.get("is_available"):
                return False
        if service_name:
            return not self.appointment_overlaps_existing(
                date_label,
                appointment_time,
                service_name,
                ignored_appointment_id=ignored_appointment_id,
            )
        return not self.is_slot_occupied(date_label, appointment_time, ignored_appointment_id=ignored_appointment_id)

    def list_availability(self):
        self.ensure_availability_window()
        default_dates = upcoming_default_availability()
        manual = {
            (row["date_label"], row["appointment_time"]): bool(row.get("is_available"))
            for row in self.stream_data("availability_slots")
        }
        dates = []
        for date_label in sorted(default_dates.keys(), key=availability_sort_key):
            date_group = {"date": date_label, "slots": []}
            for appointment_time in self.dynamic_slots_for_date(date_label):
                if not is_future_slot(date_label, appointment_time):
                    continue

                is_manual_available = manual.get((date_label, appointment_time), True)
                date_group["slots"].append(
                    {
                        "time": appointment_time,
                        "isAvailable": is_manual_available and not self.is_slot_occupied(date_label, appointment_time),
                    }
                )
            dates.append(date_group)
        return dates

    def set_availability(self, payload):
        date_label, appointment_time, is_available = validate_availability_payload(payload)
        if is_available and self.is_slot_occupied(date_label, appointment_time):
            raise ValueError("Este horario tem agendamento ativo. Cancele o agendamento para liberar.")
        doc_id = self.availability_doc_id(date_label, appointment_time)
        current = self.doc_data("availability_slots", doc_id) or {}
        timestamp = now_iso()
        self.save(
            "availability_slots",
            doc_id,
            {
                "id": doc_id,
                "date_label": date_label,
                "appointment_time": appointment_time,
                "is_available": is_available,
                "created_at": current.get("created_at", timestamp),
                "updated_at": timestamp,
            },
        )
        return {"date": date_label, "time": appointment_time, "isAvailable": is_available}

    def set_day_availability(self, payload):
        date_label, is_available = validate_availability_day_payload(payload)
        timestamp = now_iso()
        for appointment_time in DEFAULT_DAY_SLOTS:
            slot_is_available = is_available and not self.is_slot_occupied(date_label, appointment_time)
            doc_id = self.availability_doc_id(date_label, appointment_time)
            current = self.doc_data("availability_slots", doc_id) or {}
            self.save(
                "availability_slots",
                doc_id,
                {
                    "id": doc_id,
                    "date_label": date_label,
                    "appointment_time": appointment_time,
                    "is_available": slot_is_available,
                    "created_at": current.get("created_at", timestamp),
                    "updated_at": timestamp,
                },
            )
        return {"date": date_label, "isAvailable": is_available}

    def list_appointments(self, session, filters=None):
        filters = filters or {}
        rows = self.stream_data("appointments")
        if session["role"] == "user":
            rows = [row for row in rows if row.get("user_id") == session["id"]]
        status = str(filters.get("status", "")).strip()
        if status and status in ALLOWED_STATUS:
            rows = [row for row in rows if row.get("status") == status]
        appointment_date = str(filters.get("date", "")).strip()
        if appointment_date:
            rows = [row for row in rows if row.get("appointment_date") == appointment_date]
        search = str(filters.get("search", "")).strip().lower()
        if search:
            filtered = []
            for row in rows:
                appointment = self.row_to_appointment(row)
                haystack = " ".join(
                    [
                        appointment["name"],
                        appointment["phone"],
                        appointment["whatsapp"],
                        normalize_phone(appointment["phone"]),
                        appointment["service"],
                    ]
                ).lower()
                if search in haystack:
                    filtered.append(row)
            rows = filtered
        rows.sort(key=lambda row: row.get("created_at", ""), reverse=True)
        return [self.row_to_appointment(row) for row in rows]

    def get_appointment(self, appointment_id):
        row = self.doc_data("appointments", appointment_id)
        return self.row_to_appointment(row) if row else None

    def assert_can_access_appointment(self, session, appointment):
        if appointment is None or session["role"] == "admin":
            return
        if appointment["userId"] != session["id"]:
            raise ForbiddenError("Voce nao tem acesso a este agendamento.")

    def resolve_appointment_user(self, payload, session=None, current_user_id=None):
        name, phone, phone_normalized = validate_user_payload(payload)
        if session and session["role"] == "user":
            return self.update_current_user(session["id"], name, phone, phone_normalized)
        if current_user_id and session and session["role"] == "user":
            return current_user_id
        existing = self.find_user_by_phone(phone_normalized)
        if existing and not session:
            raise ValueError("Este telefone ja esta cadastrado. Entre na sua conta para agendar.")
        return self.upsert_user(name, phone, phone_normalized)

    def create_appointment(self, payload, session=None):
        details = validate_appointment_details(payload)
        appointment_id = str(uuid.uuid4())
        timestamp = now_iso()
        if not self.is_slot_available(details["date"], details["time"], service_name=details["service"]):
            raise ValueError("Este horario nao esta livre.")
        user_id = self.resolve_appointment_user(payload, session=session)
        self.save(
            "appointments",
            appointment_id,
            {
                "id": appointment_id,
                "user_id": user_id,
                "service": details["service"],
                "appointment_date": details["date"],
                "appointment_time": details["time"],
                "notes": details["notes"],
                "status": details["status"],
                "created_at": timestamp,
                "updated_at": timestamp,
            },
        )
        return self.get_appointment(appointment_id)

    def update_appointment(self, appointment_id, payload, session):
        current = self.get_appointment(appointment_id)
        if current is None:
            return None
        self.assert_can_access_appointment(session, current)
        details = validate_appointment_details(payload)
        if details["status"] != "Cancelado" and not self.is_slot_available(
            details["date"],
            details["time"],
            service_name=details["service"],
            ignored_appointment_id=appointment_id,
        ):
            raise ValueError("Este horario nao esta livre.")
        user_id = self.resolve_appointment_user(payload, session=session, current_user_id=current["userId"])
        self.save(
            "appointments",
            appointment_id,
            {
                "user_id": user_id,
                "service": details["service"],
                "appointment_date": details["date"],
                "appointment_time": details["time"],
                "notes": details["notes"],
                "status": details["status"],
                "updated_at": now_iso(),
            },
            merge=True,
        )
        return self.get_appointment(appointment_id)

    def duplicate_appointment(self, appointment_id, session):
        current = self.get_appointment(appointment_id)
        if current is None:
            return None
        self.assert_can_access_appointment(session, current)
        payload = {
            "name": current["name"],
            "phone": current["phone"],
            "service": current["service"],
            "date": current["date"],
            "time": current["time"],
            "notes": current["notes"],
            "status": "Pendente",
        }
        return self.create_appointment(payload, session=session if session["role"] == "user" else None)

    def cancel_appointment(self, appointment_id, session):
        current = self.get_appointment(appointment_id)
        if current is None:
            return None
        self.assert_can_access_appointment(session, current)
        self.save("appointments", appointment_id, {"status": "Cancelado", "updated_at": now_iso()}, merge=True)
        return self.get_appointment(appointment_id)

    def delete_appointment(self, appointment_id, session):
        current = self.get_appointment(appointment_id)
        if current is None:
            return False
        self.assert_can_access_appointment(session, current)
        if current["status"] != "Cancelado":
            raise ValueError("Cancele o agendamento antes de excluir. O horario so e liberado ao cancelar.")
        self.delete("appointments", appointment_id)
        return True
