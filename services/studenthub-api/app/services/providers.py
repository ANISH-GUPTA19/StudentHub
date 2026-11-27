from typing import Protocol


class StorageProvider(Protocol):
    async def create_presigned_upload(self, upload_type: str, filename: str, content_type: str) -> dict: ...


class BlobStorageProvider:
    def __init__(self, connection_string: str | None) -> None:
        self.connection_string = connection_string

    async def create_presigned_upload(self, upload_type: str, filename: str, content_type: str) -> dict:
        if not self.connection_string:
            raise RuntimeError("Storage endpoint is not configured")
        return {
            "uploadUrl": f"https://storage.local/presign/{filename}",
            "objectUrl": f"https://storage.local/{upload_type}/{filename}",
        }


class OpenAIProvider:
    def __init__(self, endpoint: str | None) -> None:
        self.endpoint = endpoint

    async def explain_match(self, student_name: str) -> str:
        if not self.endpoint:
            return f"Recommended based on shared preferences and schedule compatibility for {student_name}."
        return f"AI-assisted match explanation available for {student_name}."
