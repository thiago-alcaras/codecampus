"""Private storage. Credentials use the AWS default chain (IAM role preferred)."""

import os
import tempfile
import socket
import struct
from pathlib import Path
from fastapi import HTTPException
from .db import DATA

MAX_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
STORAGE = os.getenv("STORAGE_BACKEND", "local")
SCANNER_HOST = os.getenv("CLAMAV_HOST", "")
if os.getenv("APP_ENV") == "production" and not SCANNER_HOST:
    raise RuntimeError("CLAMAV_HOST is required for production uploads")
if STORAGE not in ("local", "s3"):
    raise RuntimeError("Invalid STORAGE_BACKEND")
if STORAGE == "s3" and not os.getenv("S3_BUCKET"):
    raise RuntimeError("S3_BUCKET is required for S3 storage")
UPLOADS = DATA / "uploads"
UPLOADS.mkdir(exist_ok=True)
TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".zip": "application/zip",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def client():
    import boto3

    return boto3.client("s3", region_name=os.getenv("AWS_REGION", "sa-east-1"))


def object_key(asset_id):
    return f"private/{asset_id}"


def scan_file(file):
    if not SCANNER_HOST:
        return
    try:
        with socket.create_connection(
            (SCANNER_HOST, int(os.getenv("CLAMAV_PORT", "3310"))), timeout=30
        ) as scanner:
            scanner.sendall(b"zINSTREAM\0")
            while chunk := file.read(64 * 1024):
                scanner.sendall(struct.pack("!I", len(chunk)) + chunk)
            scanner.sendall(struct.pack("!I", 0))
            result = b""
            while not result.endswith(b"\0"):
                chunk = scanner.recv(4096)
                if not chunk:
                    break
                result += chunk
                if len(result) > 8192:
                    raise OSError("Scanner response too large")
        if b" FOUND" in result:
            raise HTTPException(422, "Arquivo rejeitado pela verificação de segurança.")
        if not result.endswith(b" OK\0"):
            raise OSError("Scanner did not confirm clean file")
    except (OSError, TimeoutError):
        raise HTTPException(
            503, "Verificação de segurança indisponível. Tente novamente mais tarde."
        )
    finally:
        file.seek(0)


async def store_upload(upload, asset_id):
    name = (
        Path(upload.filename.replace("\\", "/")).name[:200]
        if upload.filename
        else "arquivo"
    )
    suffix = Path(name).suffix.lower()
    if suffix not in TYPES:
        raise HTTPException(
            422,
            "Formato não permitido. Use PDF, texto, ZIP, imagem, vídeo, DOCX ou PPTX.",
        )
    size = 0
    with tempfile.TemporaryFile() as temp:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise HTTPException(
                    413, f"Limite de {MAX_BYTES // 1024 // 1024} MB por arquivo."
                )
            temp.write(chunk)
        if not size:
            raise HTTPException(422, "Arquivo vazio.")
        temp.seek(0)
        head = temp.read(16)
        temp.seek(0)
        signatures = {
            ".pdf": b"%PDF-",
            ".png": b"\x89PNG\r\n\x1a\n",
            ".jpg": b"\xff\xd8\xff",
            ".jpeg": b"\xff\xd8\xff",
            ".zip": b"PK",
            ".docx": b"PK",
            ".pptx": b"PK",
            ".webm": b"\x1a\x45\xdf\xa3",
        }
        if suffix in signatures and not head.startswith(signatures[suffix]):
            raise HTTPException(422, "O conteúdo não corresponde ao formato informado.")
        if suffix == ".mp4" and head[4:8] != b"ftyp":
            raise HTTPException(422, "Vídeo MP4 inválido.")
        from starlette.concurrency import run_in_threadpool

        await run_in_threadpool(scan_file, temp)
        if STORAGE == "s3":
            await run_in_threadpool(
                client().upload_fileobj,
                temp,
                os.environ["S3_BUCKET"],
                object_key(asset_id),
                ExtraArgs={
                    "ServerSideEncryption": "AES256",
                    "ContentType": TYPES[suffix],
                    "ContentDisposition": "attachment",
                },
            )
        else:
            with (UPLOADS / asset_id).open("wb") as target:
                while chunk := temp.read(1024 * 1024):
                    target.write(chunk)
    return name, size, TYPES[suffix]


def delete_upload(asset_id):
    if STORAGE == "s3":
        client().delete_object(Bucket=os.environ["S3_BUCKET"], Key=object_key(asset_id))
    else:
        (UPLOADS / asset_id).unlink(missing_ok=True)


def download_url(asset):
    return client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": os.environ["S3_BUCKET"],
            "Key": object_key(asset.id),
            "ResponseContentDisposition": "attachment",
            "ResponseContentType": asset.mime,
        },
        ExpiresIn=60,
    )
