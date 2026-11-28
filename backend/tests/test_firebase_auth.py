import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.services.firebase_auth import require_firebase_user


class FirebaseAuthTests(unittest.TestCase):
    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "swingtrader-test"})
    @patch("backend.services.firebase_auth.verify_firebase_token", return_value={"sub": "firebase-user"})
    def test_returns_uid_from_verified_bearer_token(self, verify_token):
        user_id = require_firebase_user("Bearer valid-token")

        self.assertEqual(user_id, "firebase-user")
        verify_token.assert_called_once()
        self.assertEqual(verify_token.call_args.kwargs["audience"], "swingtrader-test")

    @patch.dict(os.environ, {"FIREBASE_PROJECT_ID": "swingtrader-test"})
    @patch("backend.services.firebase_auth.verify_firebase_token", side_effect=ValueError("invalid"))
    def test_rejects_an_invalid_token(self, _verify_token):
        with self.assertRaises(HTTPException) as raised:
            require_firebase_user("Bearer invalid-token")

        self.assertEqual(raised.exception.status_code, 401)

    def test_requires_a_bearer_token(self):
        with self.assertRaises(HTTPException) as raised:
            require_firebase_user(None)

        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
