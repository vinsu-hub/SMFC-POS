import os
from functools import lru_cache

import httpx
from dotenv import load_dotenv
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

load_dotenv()


@lru_cache
def get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SECRET_KEY"]
    # One process-wide client is shared by every request thread. supabase-py's default
    # HTTP/2 connection gets reset by the edge under concurrent load ("ConnectionTerminated"),
    # which surfaced as random 500s and false 401s (e.g. "Failed to load utility logs").
    # HTTP/1.1 with a real connection pool and connect retries avoids the shared-stream limit.
    http_client = httpx.Client(
        http2=False,
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        transport=httpx.HTTPTransport(retries=2, http2=False),
    )
    return create_client(url, key, options=SyncClientOptions(httpx_client=http_client))
