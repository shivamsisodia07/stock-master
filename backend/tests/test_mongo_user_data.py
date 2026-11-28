import copy
import unittest
from unittest.mock import patch

from backend.services.mongo_user_data import get_user_workspace, save_user_workspace


class FakeCollection:
    def __init__(self):
        self.documents = {}

    def find_one(self, query):
        document = self.documents.get(query["_id"])
        return copy.deepcopy(document)

    def find_one_and_update(self, query, update, **_kwargs):
        user_id = query["_id"]
        incoming = update["$set"]
        existing = self.documents.get(user_id)
        if existing is None or existing["updated_at"] < incoming["updated_at"]:
            self.documents[user_id] = {"_id": user_id, **copy.deepcopy(incoming)}
        return copy.deepcopy(self.documents[user_id])


class MongoUserDataTests(unittest.TestCase):
    def setUp(self):
        self.collection = FakeCollection()
        self.collection_patcher = patch(
            "backend.services.mongo_user_data._workspace_collection",
            return_value=self.collection,
        )
        self.collection_patcher.start()
        self.addCleanup(self.collection_patcher.stop)

    def test_workspace_is_saved_and_scoped_to_each_user(self):
        saved = save_user_workspace(
            "user-one",
            {"watchlist": ["RELIANCE"], "alert_rules": [], "alert_history": [], "alert_delivery": []},
            100,
        )

        self.assertEqual(saved["data"]["watchlist"], ["RELIANCE"])
        self.assertEqual(get_user_workspace("user-two")["data"]["watchlist"], [])
        self.assertEqual(get_user_workspace("user-one")["updated_at"], 100)

    def test_stale_writes_do_not_replace_newer_workspace_data(self):
        current_data = {"watchlist": ["TCS"], "alert_rules": [], "alert_history": [], "alert_delivery": []}
        stale_data = {"watchlist": ["INFY"], "alert_rules": [], "alert_history": [], "alert_delivery": []}
        save_user_workspace("user-one", current_data, 200)

        result = save_user_workspace("user-one", stale_data, 150)

        self.assertEqual(result["updated_at"], 200)
        self.assertEqual(result["data"]["watchlist"], ["TCS"])


if __name__ == "__main__":
    unittest.main()
