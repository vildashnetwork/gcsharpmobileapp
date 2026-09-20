# __SG_REST__
@api_router.get("/study-groups")
async def list_study_groups(user: dict = Depends(get_current_user)):
    mine = await db.study_groups.find(
        {"members.user_id": user["user_id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    level = (user.get("exam_level") or "").strip()
    discover = []
    if level:
        discover = await db.study_groups.find(
            {"exam_level": level, "members.user_id": {"$ne": user["user_id"]}},
            {"_id": 0},
        ).sort("updated_at", -1).to_list(50)
    pending_out, pending_in = [], []
    if user.get("role") != "teacher":
        pending_out = await db.study_group_requests.find(
            {"user_id": user["user_id"], "status": "pending"}, {"_id": 0}
        ).to_list(100)
    else:
        pending_in = await db.study_group_requests.find(
            {"status": "pending"}, {"_id": 0}
        ).sort("created_at", -1).to_list(100)
    return {
        "mine": [_study_group_public(g, user["user_id"]) for g in mine],
        "discover": [_study_group_public(g, user["user_id"]) for g in discover],
        "my_level": level,
        "pending_out": pending_out,
        "pending_in": pending_in,
    }


@api_router.post("/study-groups")
async def create_study_group(inp: StudyGroupIn, user: dict = Depends(get_current_user)):
    if user.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    name = (inp.name or "").strip()
    if not name:
        raise HTTPException(400, "Group name is required")
    level = (inp.exam_level or user.get("exam_level") or "").strip()
    if not level:
        raise HTTPException(400, "Set your exam level first (Profile > Edit)")
    now = datetime.utcnow().isoformat()
    doc = {
        "group_id": f"sg_{uuid.uuid4().hex[:12]}",
        "name": name[:80],
        "description": (inp.description or "")[:500],
        "exam_level": level,
        "avatar": inp.avatar,
        "created_by": user["user_id"],
        "members": [{
            "user_id": user["user_id"],
            "full_name": user.get("full_name", "Student"),
            "profile_photo": user.get("profile_photo"),
            "role": "admin",
            "status": "member",
            "joined_at": now,
        }],
        "last_message": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.study_groups.insert_one(dict(doc))
    # PART2
    return {"group": _study_group_public(doc, user["user_id"])}

    if kind == "voice":
        url = str(payload.get("audio_url") or "").strip()
        if not url:
            raise HTTPException(400, "audio_url is required for voice notes")
        try:
            meta["duration_sec"] = max(1, int(float(payload.get("duration_sec") or 0)))
        except Exception:
            meta["duration_sec"] = 0
        meta["audio_url"] = url
        meta["transcript"] = str(payload.get("transcript") or "")[:2000]
    elif kind == "paper":
        paper_id = str(payload.get("paper_id") or "").strip()
        if not paper_id:
            raise HTTPException(400, "paper_id is required")
        paper = await db.papers.find_one({"paper_id": paper_id}, {"_id": 0})
        if not paper:
            raise HTTPException(404, "Paper not found")
        meta.update({
            "paper_id": paper.get("paper_id"),
            "paper_title": paper.get("title", "Past paper"),
            "subject": paper.get("subject", ""),
            "year": paper.get("year"),
            "paper_number": paper.get("paper_number"),
            "level": paper.get("level", ""),
            "pdf_url": paper.get("pdf_url", ""),
        })
    elif kind in ("highlight", "question"):
        qtext = text or str(payload.get("question") or "").strip()
        if not qtext:
            raise HTTPException(400, "Question text is required")
        text = qtext[:2000]
        if payload.get("paper_id"):
            paper = await db.papers.find_one(
                {"paper_id": str(payload["paper_id"])}, {"_id": 0})
            if paper:
                meta.update({
                    "paper_id": paper.get("paper_id"),
                    "paper_title": paper.get("title", "Past paper"),
                    "subject": paper.get("subject", ""),
                    "year": paper.get("year"),
                    "paper_number": paper.get("paper_number"),
                })
        if payload.get("page") is not None:
            try:
                meta["page"] = int(payload["page"])
            except Exception:
                pass
    now = datetime.utcnow().isoformat()
    doc = {
        "message_id": f"sgm_{uuid.uuid4().hex[:12]}",
        "group_id": group["group_id"],
        "kind": kind,
        "sender_id": sender.get("user_id", "gc_ai") if kind != "ai_answer" else "gc_ai",
        "sender_name": sender.get("full_name", "Student") if kind != "ai_answer" else "GC AI",
        "sender_photo": sender.get("profile_photo") if kind != "ai_answer" else None,
        "text": text,
        "meta": meta,
        "created_at": now,
    }
    await db.study_group_messages.insert_one(dict(doc))
    preview = text[:80] if text else {
        "voice": "Voice note", "paper": "Shared a past paper",
        "highlight": "Shared a highlighted question",
        "question": "Asked a question",
        "ai_answer": "GC AI answered",
    }.get(kind, "New message")
    await db.study_groups.update_one(
        {"group_id": group["group_id"]},
        {"$set": {"updated_at": now,
                  "last_message": {"kind": kind, "text": preview,
                                   "sender_name": doc["sender_name"],
                                   "created_at": now}}})
    return serialize(doc)
