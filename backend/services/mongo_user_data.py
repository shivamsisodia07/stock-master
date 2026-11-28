import os
import threading

from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError


class MongoDBNotConfigured(RuntimeError):
    pass


_client: MongoClient | None = None
_client_lock = threading.Lock()


def _workspace_collection():
    global _client
    connection_string = os.getenv("MONGODB_URI", "").strip()
    if not connection_string:
        raise MongoDBNotConfigured("MONGODB_URI is not configured on the backend.")
    database_name = os.getenv("MONGODB_DATABASE", "swingtrader").strip()
    if not database_name:
        raise MongoDBNotConfigured("MONGODB_DATABASE must not be empty.")

    with _client_lock:
        if _client is None:
            _client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)
    return _client[database_name]["user_workspace"]


def _empty_data() -> dict:
    return {
        "watchlist": [],
        "alert_rules": [],
        "alert_history": [],
        "alert_delivery": [],
    }


def _result(document: dict | None) -> dict:
    data = document.get("data", {}) if document else {}
    defaults = _empty_data()
    return {
        "data": {key: data.get(key, value) for key, value in defaults.items()},
        "updated_at": int(document.get("updated_at", 0)) if document else 0,
    }


def get_user_workspace(user_id: str) -> dict:
    document = _workspace_collection().find_one({"_id": user_id})
    return _result(document)


def save_user_workspace(user_id: str, data: dict, updated_at: int) -> dict:
    collection = _workspace_collection()
    query = {
        "_id": user_id,
        "$or": [
            {"updated_at": {"$lt": updated_at}},
            {"updated_at": {"$exists": False}},
        ],
    }
    try:
        document = collection.find_one_and_update(
            query,
            {"$set": {"data": data, "updated_at": updated_at}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        document = collection.find_one({"_id": user_id})
    return _result(document)
