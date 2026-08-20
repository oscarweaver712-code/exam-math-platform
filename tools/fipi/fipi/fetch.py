"""Polite crawler for the ФИПИ question bank.

Every raw page is written to disk before anything parses it. The classifier gets
rewritten many times; the crawl should happen once. A second run reads the cache
and never touches the network unless asked to refresh.
"""

from __future__ import annotations

import gzip
import http.cookiejar
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import (
    ENCODING,
    INDEX_URL,
    QUESTIONS_URL,
    SOLVE_URL,
    USER_AGENT,
    FetchSettings,
)

QCOUNT_RE = re.compile(r"setQCount\((\d+)\)")


class FipiError(RuntimeError):
    pass


@dataclass
class Page:
    index: int
    html: str
    from_cache: bool


class FipiClient:
    """Session-aware client. Bootstraps PHPSESSID from the project page."""

    def __init__(self, settings: FetchSettings, cache_dir: Path) -> None:
        self.settings = settings
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._jar)
        )
        self._referer = f"{settings.index_url}?proj={settings.proj}"
        self._bootstrapped = False

    # -- low level ---------------------------------------------------------

    def _open(self, url: str, data: bytes | None = None, referer: str | None = None) -> bytes:
        request = urllib.request.Request(url, data=data)
        request.add_header("User-Agent", USER_AGENT)
        request.add_header("Accept-Encoding", "gzip")
        request.add_header("Referer", referer or self._referer)
        if data is not None:
            request.add_header("Content-Type", "application/x-www-form-urlencoded")

        last_error: Exception | None = None
        for attempt in range(self.settings.retries):
            try:
                with self._opener.open(request, timeout=self.settings.timeout) as response:
                    payload = response.read()
                    if response.headers.get("Content-Encoding") == "gzip":
                        payload = gzip.decompress(payload)
                    return payload
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last_error = error
                # Back off before retrying: the bank is a single Apache host.
                time.sleep(self.settings.delay * (attempt + 2))
        raise FipiError(f"{url} failed after {self.settings.retries} attempts: {last_error}")

    def _bootstrap(self) -> None:
        if self._bootstrapped:
            return
        self._open(f"{self.settings.index_url}?proj={self.settings.proj}", referer=self.settings.index_url)
        self._bootstrapped = True

    # -- pages -------------------------------------------------------------

    def _cache_path(self, page: int) -> Path:
        theme = "-".join(self.settings.themes) or "all"
        kind = self.settings.answer_kind or "any"
        return self.cache_dir / f"p{page:04d}_{theme}_{kind}_{self.settings.page_size}.html"

    def _payload(self, page: int, zid: str = "") -> bytes:
        fields = {
            "search": "1",
            "pagesize": str(self.settings.page_size),
            "proj": self.settings.proj,
            "theme": ",".join(self.settings.themes),
            "qlevel": "",
            "qkind": self.settings.answer_kind,
            "qsstruct": "",
            "qpos": "",
            "qid": "",
            "zid": zid,
            "solved": "",
            "favorite": "",
            "blind": "",
            "page": str(page),
        }
        return urllib.parse.urlencode(fields).encode("ascii")

    def page(self, index: int, refresh: bool = False) -> Page:
        """Return one page of questions, reading the on-disk cache when possible."""
        path = self._cache_path(index)
        if path.exists() and not refresh:
            return Page(index=index, html=path.read_text(encoding="utf-8"), from_cache=True)

        self._bootstrap()
        raw = self._open(self.settings.questions_url, data=self._payload(index))
        html = raw.decode(ENCODING, errors="replace")
        path.write_text(html, encoding="utf-8")
        return Page(index=index, html=html, from_cache=False)

    def group(self, zid: str, refresh: bool = False) -> str:
        """Fetch one question group by its id.

        A group is a shared text and drawing plus the questions derived from
        it — the practical block 1–5 of the exam. The shared block is only
        reachable this way: the ordinary listing returns the questions alone,
        which is why their plan appears to be missing.
        """
        path = self.cache_dir / f"group_{zid}.html"
        if path.exists() and not refresh:
            return path.read_text(encoding="utf-8")

        self._bootstrap()
        raw = self._open(self.settings.questions_url, data=self._payload(0, zid=zid))
        html = raw.decode(ENCODING, errors="replace")
        path.write_text(html, encoding="utf-8")
        time.sleep(self.settings.delay)
        return html

    def total(self) -> int:
        """Total number of questions matching the current filters."""
        first = self.page(0)
        match = QCOUNT_RE.search(first.html)
        if not match:
            raise FipiError("no setQCount(...) in response — the bank's markup changed")
        return int(match.group(1))

    def crawl(self, refresh: bool = False, limit: int | None = None):
        """Yield every page, sleeping between live requests only."""
        total = self.total()
        pages = -(-total // self.settings.page_size)  # ceil
        if limit is not None:
            pages = min(pages, limit)
        for index in range(pages):
            page = self.page(index, refresh=refresh)
            yield page, pages
            if not page.from_cache and index + 1 < pages:
                time.sleep(self.settings.delay)

    # -- answer oracle -----------------------------------------------------

    def check_answer(self, guid: str, answer: str) -> bool | None:
        """Ask the bank whether `answer` is right for `guid`.

        Returns True for a correct answer, False for a rejected one, and None
        when the bank replies with something we do not recognise.

        One call per task, used to confirm an answer we already computed. This
        is not a way to discover answers by enumeration: it does not work for
        anything but short numeric responses, and the traffic pattern of a
        search would be indistinguishable from an attack on a single-host
        public service.
        """
        self._bootstrap()
        boundary = "----fipi-oracle-boundary"
        parts = []
        for name, value in (
            ("guid", guid),
            ("answer", answer),
            ("ajax", "1"),
            ("proj", self.settings.proj),
            ("chkcode", ""),
        ):
            parts.append(f"--{boundary}\r\n")
            parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n')
            parts.append(f"{value}\r\n")
        parts.append(f"--{boundary}--\r\n")
        body = "".join(parts).encode("utf-8")

        request = urllib.request.Request(self.settings.solve_url, data=body)
        request.add_header("User-Agent", USER_AGENT)
        request.add_header("Referer", self.settings.questions_url)
        request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        with self._opener.open(request, timeout=self.settings.timeout) as response:
            verdict = response.read().decode("ascii", errors="replace").strip()

        if verdict in {"1", "3"}:
            return True
        if verdict == "2":
            return False
        return None


def download_image(url: str, destination: Path, timeout: float = 60.0) -> bool:
    """Fetch one question image. Returns False when it already exists."""
    if destination.exists() and destination.stat().st_size > 0:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url)
    request.add_header("User-Agent", USER_AGENT)
    request.add_header("Referer", QUESTIONS_URL)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
    if not payload:
        raise FipiError(f"empty image body: {url}")
    destination.write_bytes(payload)
    return True
