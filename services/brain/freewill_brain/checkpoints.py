from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

import torch
from safetensors.torch import load_file, save_file


@dataclass(frozen=True)
class GenomeRecord:
    brain_id: str
    artifact_hash: str
    path: Path
    parent_ids: tuple[str, ...]
    generation: int


class CheckpointStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or Path(os.environ.get("FREEWILL_BRAIN_DATA", "data/brains"))
        self.genome_dir = self.root / "genomes"
        self.manifest_dir = self.root / "manifests"
        self.lifetime_dir = self.root / "lifetimes"
        self.genome_dir.mkdir(parents=True, exist_ok=True)
        self.manifest_dir.mkdir(parents=True, exist_ok=True)
        self.lifetime_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _manifest_name(brain_id: str) -> str:
        return f"{hashlib.sha256(brain_id.encode('utf8')).hexdigest()}.json"

    @staticmethod
    def _atomic_json(path: Path, payload: dict) -> None:
        with NamedTemporaryFile("w", dir=path.parent, suffix=".json", delete=False, encoding="utf8") as output:
            json.dump(payload, output, separators=(",", ":"), sort_keys=True)
            temporary = Path(output.name)
        temporary.replace(path)

    def save_genome(self, brain_id: str, tensors: dict[str, torch.Tensor], *, parent_ids: tuple[str, ...] = (), generation: int = 0) -> GenomeRecord:
        cpu_tensors = {key: value.detach().cpu().contiguous() for key, value in sorted(tensors.items())}
        with NamedTemporaryFile(dir=self.genome_dir, suffix=".safetensors", delete=False) as temp:
            temp_path = Path(temp.name)
        try:
            save_file(cpu_tensors, str(temp_path))
            payload = temp_path.read_bytes()
            digest = hashlib.sha256(payload).hexdigest()
            final_path = self.genome_dir / f"{digest}.safetensors"
            if final_path.exists():
                temp_path.unlink()
            else:
                temp_path.replace(final_path)
            manifest = {
                "brainId": brain_id,
                "artifactHash": digest,
                "parentIds": list(parent_ids),
                "generation": generation,
                "format": "safetensors",
            }
            manifest_path = self.manifest_dir / self._manifest_name(brain_id)
            self._atomic_json(manifest_path, manifest)
            return GenomeRecord(brain_id, digest, final_path, parent_ids, generation)
        finally:
            if temp_path.exists():
                temp_path.unlink()

    def load_genome(self, brain_id: str) -> tuple[GenomeRecord, dict[str, torch.Tensor]] | None:
        manifest_path = self.manifest_dir / self._manifest_name(brain_id)
        if not manifest_path.exists():
            return None
        manifest = json.loads(manifest_path.read_text("utf8"))
        digest = str(manifest["artifactHash"])
        path = self.genome_dir / f"{digest}.safetensors"
        if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Genome artifact for {brain_id} is missing or corrupt")
        record = GenomeRecord(brain_id, digest, path, tuple(manifest.get("parentIds", [])), int(manifest.get("generation", 0)))
        return record, load_file(str(path), device="cpu")

    def save_lifetime(self, episode_id: str, tensors: dict[str, torch.Tensor], metadata: dict) -> dict:
        cpu_tensors = {key: value.detach().cpu().contiguous() for key, value in sorted(tensors.items())}
        with NamedTemporaryFile(dir=self.lifetime_dir, suffix=".safetensors", delete=False) as temp:
            temp_path = Path(temp.name)
        try:
            save_file(cpu_tensors, str(temp_path))
            payload = temp_path.read_bytes()
            digest = hashlib.sha256(payload).hexdigest()
            final_path = self.lifetime_dir / f"{digest}.safetensors"
            if final_path.exists():
                temp_path.unlink()
            else:
                temp_path.replace(final_path)
            manifest = {"episodeId": episode_id, "artifactHash": digest, "format": "safetensors", **metadata}
            self._atomic_json(self.lifetime_dir / f"{digest}.json", manifest)
            return manifest
        finally:
            if temp_path.exists():
                temp_path.unlink()

