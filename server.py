from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json
import mimetypes
import re
import sqlite3
import uuid
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "mnunesnails.db"
ALLOWED_STATUS = {"Confirmado", "Alterado", "Pendente", "Cancelado"}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_phone(phone):
    return re.sub(r"\D", "", phone or "")


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_database():
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              phone_normalized TEXT NOT NULL UNIQUE,
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

            CREATE INDEX IF NOT EXISTS idx_appointments_user_id
              ON appointments(user_id);

            CREATE INDEX IF NOT EXISTS idx_appointments_date_time
              ON appointments(appointment_date, appointment_time);
            """
        )


def row_to_user(row):
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
        "service": row["service"],
        "date": row["appointment_date"],
        "time": row["appointment_time"],
        "notes": row["notes"],
        "status": row["status"],
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


def validate_appointment_payload(payload):
    name, phone, phone_normalized = validate_user_payload(payload)
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
        "name": name,
        "phone": phone,
        "phone_normalized": phone_normalized,
        "service": service,
        "date": appointment_date,
        "time": appointment_time,
        "notes": notes,
        "status": status,
    }


def upsert_user(connection, name, phone, phone_normalized):
    timestamp = now_iso()
    existing = connection.execute(
        "SELECT * FROM users WHERE phone_normalized = ?",
        (phone_normalized,),
    ).fetchone()

    if existing:
        connection.execute(
            """
            UPDATE users
               SET name = ?, phone = ?, updated_at = ?
             WHERE id = ?
            """,
            (name, phone, timestamp, existing["id"]),
        )
        return existing["id"]

    cursor = connection.execute(
        """
        INSERT INTO users (name, phone, phone_normalized, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (name, phone, phone_normalized, timestamp, timestamp),
    )
    return cursor.lastrowid


def list_users():
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM users ORDER BY updated_at DESC, id DESC"
        ).fetchall()
    return [row_to_user(row) for row in rows]


def list_appointments():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
              appointments.*,
              users.name,
              users.phone
            FROM appointments
            JOIN users ON users.id = appointments.user_id
            ORDER BY appointments.created_at DESC
            """
        ).fetchall()
    return [row_to_appointment(row) for row in rows]


def get_appointment(appointment_id):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
              appointments.*,
              users.name,
              users.phone
            FROM appointments
            JOIN users ON users.id = appointments.user_id
            WHERE appointments.id = ?
            """,
            (appointment_id,),
        ).fetchone()

    if row is None:
        return None

    return row_to_appointment(row)


def create_appointment(payload):
    data = validate_appointment_payload(payload)
    appointment_id = str(uuid.uuid4())
    timestamp = now_iso()

    with get_connection() as connection:
        user_id = upsert_user(
            connection,
            data["name"],
            data["phone"],
            data["phone_normalized"],
        )
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
                data["service"],
                data["date"],
                data["time"],
                data["notes"],
                data["status"],
                timestamp,
                timestamp,
            ),
        )

    return get_appointment(appointment_id)


def update_appointment(appointment_id, payload):
    data = validate_appointment_payload(payload)
    timestamp = now_iso()

    with get_connection() as connection:
        current = connection.execute(
            "SELECT id FROM appointments WHERE id = ?",
            (appointment_id,),
        ).fetchone()

        if current is None:
            return None

        user_id = upsert_user(
            connection,
            data["name"],
            data["phone"],
            data["phone_normalized"],
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
                data["service"],
                data["date"],
                data["time"],
                data["notes"],
                data["status"],
                timestamp,
                appointment_id,
            ),
        )

    return get_appointment(appointment_id)


def duplicate_appointment(appointment_id):
    current = get_appointment(appointment_id)

    if current is None:
        return None

    payload = {
        "name": current["name"],
        "phone": current["phone"],
        "service": current["service"],
        "date": current["date"],
        "time": current["time"],
        "notes": current["notes"],
        "status": "Pendente",
    }
    return create_appointment(payload)


def cancel_appointment(appointment_id):
    timestamp = now_iso()

    with get_connection() as connection:
        current = connection.execute(
            "SELECT id FROM appointments WHERE id = ?",
            (appointment_id,),
        ).fetchone()

        if current is None:
            return None

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


class MnunesHandler(SimpleHTTPRequestHandler):
    server_version = "MnunesNailsHTTP/1.0"

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/users":
            self.send_json({"users": list_users()})
            return

        if parsed.path == "/api/appointments":
            self.send_json({"appointments": list_appointments()})
            return

        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/appointments":
            try:
                appointment = create_appointment(self.read_json())
                self.send_json({"appointment": appointment}, status=201)
            except ValueError as error:
                self.send_json({"error": str(error)}, status=400)
            return

        match = re.fullmatch(r"/api/appointments/([^/]+)/duplicate", parsed.path)
        if match:
            appointment = duplicate_appointment(match.group(1))

            if appointment is None:
                self.send_json({"error": "Agendamento nao encontrado."}, status=404)
                return

            self.send_json({"appointment": appointment}, status=201)
            return

        match = re.fullmatch(r"/api/appointments/([^/]+)/cancel", parsed.path)
        if match:
            appointment = cancel_appointment(match.group(1))

            if appointment is None:
                self.send_json({"error": "Agendamento nao encontrado."}, status=404)
                return

            self.send_json({"appointment": appointment})
            return

        self.send_json({"error": "Rota nao encontrada."}, status=404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/appointments/([^/]+)", parsed.path)

        if not match:
            self.send_json({"error": "Rota nao encontrada."}, status=404)
            return

        try:
            appointment = update_appointment(match.group(1), self.read_json())
        except ValueError as error:
            self.send_json({"error": str(error)}, status=400)
            return

        if appointment is None:
            self.send_json({"error": "Agendamento nao encontrado."}, status=404)
            return

        self.send_json({"appointment": appointment})

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))

        if length == 0:
            return {}

        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
    server = ThreadingHTTPServer(("127.0.0.1", 5500), MnunesHandler)
    print("Servidor em http://localhost:5500/")
    print(f"Banco de dados em {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
