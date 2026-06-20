from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server


def main():
    status = server.firestore_runtime_status()

    if not status.get("ready"):
        missing = ", ".join(status.get("missing") or [])
        details = status.get("error") or missing or "configuracao Firebase incompleta"
        raise SystemExit(f"Firestore nao esta pronto: {details}")

    server.init_database()
    status = server.firestore_runtime_status()
    print(
        "Firestore inicializado: "
        f"projectId={status.get('projectId')}, "
        f"databaseId={status.get('databaseId')}"
    )


if __name__ == "__main__":
    main()
