import io
from unittest.mock import Mock
from fastapi import UploadFile
from starlette.datastructures import Headers
import pytest
from apps.api import storage


def test_s3_private_upload_and_signed_download(monkeypatch):
    import asyncio

    client = Mock()
    monkeypatch.setattr(storage, "client", lambda: client)
    monkeypatch.setattr(storage, "STORAGE", "s3")
    monkeypatch.setenv("S3_BUCKET", "test-private-bucket")
    uploaded = {}

    def capture(file, bucket, key, ExtraArgs):
        uploaded.update(body=file.read(), bucket=bucket, key=key, args=ExtraArgs)

    client.upload_fileobj.side_effect = capture
    result = asyncio.run(
        storage.store_upload(
            UploadFile(file=io.BytesIO(b"%PDF-1.4\ntest"), filename="guide.pdf"),
            "randomid",
        )
    )
    assert result[0] == "guide.pdf" and uploaded["key"] == "private/randomid"
    assert (
        uploaded["args"]["ServerSideEncryption"] == "AES256"
        and "ACL" not in uploaded["args"]
    )

    class Asset:
        id = "randomid"
        mime = "application/pdf"

    storage.download_url(Asset())
    assert client.generate_presigned_url.call_args.kwargs["ExpiresIn"] == 60
    assert (
        client.generate_presigned_url.call_args.kwargs["Params"]["Key"]
        == "private/randomid"
    )
