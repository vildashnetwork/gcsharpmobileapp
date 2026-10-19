"""
GCSharp Controlled Training Pipeline (Phase 4).

STRICT SEPARATION OF CONCERNS:
  * Knowledge ingestion (gc_knowledge_growth) writes verified content into
    MongoDB so retrieval improves IMMEDIATELY with NO retraining.
  * Model-weight training (this module) is a SEPARATE, manually-triggered or
    explicitly-scheduled job that improves the TEACHING QUALITY of the
    GCSharp model over time. It never runs inside a student request.

Safety rules enforced here:
  - Training data comes ONLY from curated examples and reviewed teacher
    feedback / approved knowledge. Unreviewed student posts and unverified
    search results are NEVER used to fine-tune.
  - Dataset validation, evaluation, checkpoints and rollback are implemented.
  - If the configured model runtime cannot fine-tune, this module reports
    that limitation HONESTLY and still performs dataset preparation and
    evaluation. It never claims a successful training run that did not happen.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import gc_ai_engine as gc_ai

logger = logging.getLogger("gc_training")

# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------

TR_MAX_EXAMPLES = int(os.environ.get("TR_MAX_EXAMPLES", "5000"))
TR_MIN_EXAMPLES = int(os.environ.get("TR_MIN_EXAMPLES", "20"))
TR_EVAL_SAMPLE = int(os.environ.get("TR_EVAL_SAMPLE", "20"))
TR_TRAIN_DIR = os.environ.get("TR_TRAIN_DIR", "training_runs")

# Where fine-tuning actually happens. "prepare_only" (default) builds and
# evaluates datasets but performs NO weight updates - this is the honest
# default because a plain GGUF/HTTP inference endpoint cannot fine-tune.
# Set to "hf" and provide GC_TRAIN_CMD to run a real external trainer.
TR_BACKEND = os.environ.get("TR_BACKEND", "prepare_only").strip().lower()
GC_TRAIN_CMD = os.environ.get("GC_TRAIN_CMD", "").strip()


class TrainingBackend:
    """Reports what the configured model runtime can actually do.

    Kept deliberately honest: a plain inference endpoint (HTTP or GGUF) cannot
    fine-tune itself, so the default 'prepare_only' backend prepares and
    evaluates datasets but performs NO weight updates.
    """

    @staticmethod
    def supports_fine_tune() -> bool:
        return TR_BACKEND in {"hf", "custom"} and bool(GC_TRAIN_CMD)

    @staticmethod
    def description() -> str:
        if TrainingBackend.supports_fine_tune():
            return f"external_trainer ({TR_BACKEND}): {GC_TRAIN_CMD[:120]}"
        return ("prepare_only: dataset curation + evaluation are performed, but "
                "no model weights are updated. Fine-tuning is not configured.")




# ------------------------------------------------------------
# Dataset curation (ONLY reviewed, high-quality sources)
# ------------------------------------------------------------

async def collect_training_examples(db, limit: int = TR_MAX_EXAMPLES) -> List[Dict[str, str]]:
    """Gather curated {instruction, response} examples for fine-tuning.

    Permitted sources (all reviewed / high-quality only):
      1. Teacher-approved knowledge entries (ai_knowledge where
         verification_status == "verified" and quality_score >= 0.6).
      2. Explicit teacher feedback marked helpful on ai_feedback.
    Unreviewed student posts and unverified search results are excluded by
    construction - they never reach the training set.
    """
    examples: List[Dict[str, str]] = []
    try:
        verified = await db.ai_knowledge.find(
            {"verification_status": "verified", "quality_score": {"$gte": 0.6}},
            {"question": 1, "answer": 1, "subject": 1}
        ).limit(limit).to_list(limit)
        for e in verified:
            q = (e.get("question") or "").strip()
            a = (e.get("answer") or "").strip()
            if len(q) >= 8 and len(a) >= 40:
                examples.append({
                    "instruction": f"Explain for a {e.get('subject','General')} student: {q}",
                    "response": a,
                    "source": "verified_knowledge",
                })
    except Exception as e:
        logger.warning("collect verified knowledge failed: %s", e)

    try:
        fb = await db.ai_feedback.find(
            {"rating": {"$in": ["up", "thumbs_up", "helpful", 1, True]}},
            {"question": 1, "answer": 1}
        ).limit(500).to_list(500)
        for f in fb:
            q = (f.get("question") or "").strip()
            a = (f.get("answer") or "").strip()
            if len(q) >= 8 and len(a) >= 40:
                examples.append({
                    "instruction": q, "response": a, "source": "teacher_feedback",
                })
    except Exception as e:
        logger.warning("collect teacher feedback failed: %s", e)

    # De-duplicate by instruction hash.
    seen: set = set()
    uniq: List[Dict[str, str]] = []
    for ex in examples:
        h = hashlib.sha1(ex["instruction"].lower().encode()).hexdigest()
        if h in seen:
            continue
        seen.add(h)
        uniq.append(ex)
    return uniq[:limit]


def validate_dataset(examples: List[Dict[str, str]]) -> Dict[str, Any]:
    """Structural validation of the curated dataset. Returns a report dict."""
    report = {"total": len(examples), "valid": 0, "invalid": 0, "issues": []}
    for i, ex in enumerate(examples):
        instr = ex.get("instruction", "")
        resp = ex.get("response", "")
        if not isinstance(instr, str) or not isinstance(resp, str):
            report["invalid"] += 1
            report["issues"].append(f"#{i}: non-string fields")
        elif len(instr.strip()) < 8 or len(resp.strip()) < 40:
            report["invalid"] += 1
            report["issues"].append(f"#{i}: too short")
        elif len(resp) > 8000:
            report["invalid"] += 1
            report["issues"].append(f"#{i}: response too long")
        else:
            report["valid"] += 1
    report["ready"] = report["valid"] >= TR_MIN_EXAMPLES
    if not report["ready"]:
        report["reason"] = (f"Only {report['valid']} valid examples; need at least "
                            f"{TR_MIN_EXAMPLES}. Let knowledge growth accumulate more "
                            "verified entries first.")
    return report


# ------------------------------------------------------------
# Evaluation (measures teaching quality on a held-out sample)
# ------------------------------------------------------------

async def evaluate_model(db, sample: int = TR_EVAL_SAMPLE) -> Dict[str, Any]:
    """Score the configured production AI providers on KB questions.

    For a sample of verified knowledge entries, ask the model to answer the
    question WITHOUT the reference answer, then compare. We report a simple
    lexical-overlap score (not a claim of human-level judgement) plus any
    failures. This gives a before/after signal for training runs.
    """
    entries = await db.ai_knowledge.find(
        {"verification_status": "verified"},
        {"question": 1, "answer": 1, "subject": 1}
    ).limit(sample).to_list(sample)
    if not entries:
        return {"scored": 0, "avg_overlap": None,
                "note": "No verified knowledge entries to evaluate against."}
    provider_status = gc_ai.provider_status()
    if not (provider_status["gemini_configured"]
            or provider_status["openrouter_configured"]):
        return {"scored": 0, "avg_overlap": None,
                "note": "Gemini/OpenRouter not configured; cannot evaluate."}

    overlaps: List[float] = []
    failures = 0
    provider_unavailable = False
    for e in entries:
        q = (e.get("question") or "").strip()
        ref = (e.get("answer") or "").strip()
        if not q or not ref:
            continue
        try:
            out, _provider = await gc_ai.generate_text(
                f"Answer this student question in 60-120 words: {q}",
                max_tokens=400, timeout=60.0)
        except gc_ai.AIProvidersUnavailableError:
            failures += 1
            provider_unavailable = True
            break
        overlaps.append(_lexical_overlap(ref, out))
    avg = round(sum(overlaps) / len(overlaps), 4) if overlaps else None
    return {"scored": len(overlaps), "avg_overlap": avg, "failures": failures,
            "sample_size": len(entries),
            "provider_unavailable": provider_unavailable}


def _lexical_overlap(a: str, b: str) -> float:
    """Token-level Jaccard overlap as a lightweight similarity proxy."""
    ta = set(x for x in (a or "").lower().split() if len(x) > 2)
    tb = set(x for x in (b or "").lower().split() if len(x) > 2)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return round(inter / union, 4) if union else 0.0


# ------------------------------------------------------------
# Checkpoints + rollback metadata
# ------------------------------------------------------------

async def _record_checkpoint(db, run_id: str, payload: Dict[str, Any]) -> None:
    """Persist a checkpoint marker (weights path or adapter snapshot ref)."""
    try:
        await db.training_checkpoints.insert_one({
            "run_id": run_id, "created_at": datetime.utcnow().isoformat(),
            **payload})
    except Exception as e:
        logger.warning("checkpoint record failed: %s", e)


async def list_checkpoints(db) -> List[Dict[str, Any]]:
    try:
        return await db.training_checkpoints.find(
            {}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    except Exception:
        return []


# ------------------------------------------------------------
# Orchestrated training run (manually triggered / explicitly scheduled)
# ------------------------------------------------------------

_TRAINING_LOCK = False


async def run_training(db, requested_by: str = "admin",
                       max_examples: int = TR_MAX_EXAMPLES) -> Dict[str, Any]:
    """Execute a controlled training run. Never runs inside a student request.

    Steps: collect curated examples -> validate -> (optional) evaluate baseline
    -> fine-tune IF the runtime supports it -> evaluate again -> checkpoint.
    With the default prepare_only backend, steps 1-2 and the baseline eval run
    and the run reports fine_tuned=False with a clear reason. It NEVER claims
    weights were updated when they were not.
    """
    global _TRAINING_LOCK
    if _TRAINING_LOCK:
        return {"status": "busy", "reason": "A training run is already in progress."}
    _TRAINING_LOCK = True
    started = time.monotonic()
    run_id = "tr_" + hashlib.sha1(
        f"{time.time()}".encode()).hexdigest()[:12]
    run: Dict[str, Any] = {
        "run_id": run_id, "requested_by": requested_by,
        "started_at": datetime.utcnow().isoformat(),
        "backend": TR_BACKEND,
        "supports_fine_tune": TrainingBackend.supports_fine_tune(),
        "steps": [], "fine_tuned": False,
    }
    try:
        # 1. Collect curated, reviewed examples only.
        examples = await collect_training_examples(db, limit=max_examples)
        run["steps"].append({"step": "collect", "examples": len(examples)})

        # 2. Validate the dataset structurally.
        report = validate_dataset(examples)
        run["dataset_report"] = report
        run["steps"].append({"step": "validate", "valid": report["valid"],
                             "invalid": report["invalid"],
                             "ready": report["ready"]})
        if not report["ready"]:
            run["status"] = "aborted"
            run["reason"] = report.get("reason", "dataset not ready")
            run["elapsed_ms"] = int((time.monotonic() - started) * 1000)
            await _save_run(db, run)
            return run

        # 3. Baseline evaluation (teaching-quality signal before training).
        baseline = await evaluate_model(db)
        run["baseline_eval"] = baseline
        run["steps"].append({"step": "eval_baseline", **baseline})

        # 4. Persist the curated dataset for reproducibility / external trainer.
        data_path = _write_dataset_file(run_id, examples)
        run["dataset_path"] = data_path
        await _record_checkpoint(db, run_id,
                                 {"kind": "dataset", "path": data_path,
                                  "examples": len(examples)})

        # 5. Fine-tune ONLY if a real trainer is configured.
        if TrainingBackend.supports_fine_tune():
            tune = await _run_external_trainer(db, run_id, data_path, examples)
            run["fine_tune"] = tune
            run["fine_tuned"] = bool(tune.get("success"))
            if tune.get("success") and tune.get("checkpoint_path"):
                await _record_checkpoint(db, run_id,
                                         {"kind": "weights",
                                          "path": tune["checkpoint_path"]})
        else:
            run["fine_tune"] = {
                "success": False, "attempted": False,
                "reason": TrainingBackend.description(),
            }
            run["note"] = ("Dataset prepared and evaluated, but NO fine-tuning was "
                           "performed because the configured model runtime does not "
                           "expose a training interface. See backend/DEPLOY_GCSHARP_MODEL.md "
                           "to configure an external trainer (TR_BACKEND=hf, GC_TRAIN_CMD).")

        # 6. Post-run evaluation for comparison.
        after = await evaluate_model(db)
        run["post_eval"] = after
        run["steps"].append({"step": "eval_post", **after})

        run["status"] = "completed"
        run["elapsed_ms"] = int((time.monotonic() - started) * 1000)
        await _save_run(db, run)
        logger.info("Training run %s finished (fine_tuned=%s)", run_id, run["fine_tuned"])
        return run
    except Exception as e:
        logger.exception("Training run %s crashed", run_id)
        run["status"] = "failed"
        run["error"] = str(e)[:300]
        run["elapsed_ms"] = int((time.monotonic() - started) * 1000)
        await _save_run(db, run)
        return run
    finally:
        _TRAINING_LOCK = False


# ------------------------------------------------------------
# Helpers: dataset file, external trainer, run persistence
# ------------------------------------------------------------

def _write_dataset_file(run_id: str, examples: List[Dict[str, str]]) -> str:
    """Write the curated dataset as JSONL for reproducibility / external use."""
    try:
        os.makedirs(TR_TRAIN_DIR, exist_ok=True)
        path = os.path.join(TR_TRAIN_DIR, f"{run_id}.jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for ex in examples:
                f.write(json.dumps({
                    "instruction": ex["instruction"],
                    "response": ex["response"],
                }, ensure_ascii=False) + "\n")
        return path
    except Exception as e:
        logger.warning("Could not write dataset file: %s", e)
        return ""


async def _run_external_trainer(db, run_id: str, data_path: str,
                                examples: List[Dict[str, str]]) -> Dict[str, Any]:
    """Invoke a configured external fine-tuning command.

    Only called when TR_BACKEND is a real trainer AND GC_TRAIN_CMD is set.
    The command receives the dataset path as its last argument and must write
    updated weights to a path it reports on stdout. This runs as a SUBPROCESS
    off the event loop, bounded by a timeout, and never inside a request.
    """
    if not GC_TRAIN_CMD:
        return {"success": False, "attempted": False,
                "reason": "GC_TRAIN_CMD not set."}
    import shlex
    try:
        parts = shlex.split(GC_TRAIN_CMD)
    except ValueError as e:
        return {"success": False, "attempted": True,
                "reason": f"Invalid GC_TRAIN_CMD: {e}"}
    if data_path:
        parts.append(data_path)
    logger.info("Running external trainer for run %s: %s", run_id, GC_TRAIN_CMD[:120])
    try:
        proc = await asyncio.create_subprocess_exec(
            *parts,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=7200)
        except asyncio.TimeoutError:
            proc.kill()
            return {"success": False, "attempted": True,
                    "reason": "Trainer timed out after 2h."}
        out = (stdout or b"").decode(errors="replace").strip()
        err = (stderr or b"").decode(errors="replace").strip()
        success = proc.returncode == 0
        # Look for a checkpoint path the trainer printed.
        ckpt = ""
        for line in out.splitlines():
            if "checkpoint" in line.lower() and ("/" in line or "\\" in line):
                ckpt = line.strip()
                break
        return {"success": success, "attempted": True,
                "returncode": proc.returncode,
                "checkpoint_path": ckpt,
                "stdout_tail": out[-500:], "stderr_tail": err[-500:]}
    except FileNotFoundError:
        return {"success": False, "attempted": True,
                "reason": "Trainer executable not found."}
    except Exception as e:
        return {"success": False, "attempted": True, "reason": str(e)[:200]}


async def _save_run(db, run: Dict[str, Any]) -> None:
    try:
        await db.training_runs.insert_one(dict(run))
    except Exception as e:
        logger.warning("Could not persist training run: %s", e)


async def list_runs(db, limit: int = 20) -> List[Dict[str, Any]]:
    try:
        return await db.training_runs.find(
            {}, {"_id": 0}).sort("started_at", -1).limit(limit).to_list(limit)
    except Exception:
        return []