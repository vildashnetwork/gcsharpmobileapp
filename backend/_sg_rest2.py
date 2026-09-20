# __SG_REST__ part 2/5: detail + messages
@api_router.get("/study-groups/{group_id}")
async def get_study_group(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    if not any(isinstance(m, dict) and m.get("user_id") == user["user_id"]
               for m in g.get("members") or []):
        if (g.get("exam_level") or "") != (user.get("exam_level") or ""):
            raise HTTPException(403, "This group is for another exam level")
    return {"group": _study_group_public(g, user["user_id"])}


@api_router.get("/study-groups/{group_id}/messages")
async def list_group_messages(group_id: str, limit: int = 60,
                              before: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    q: dict = {"group_id": group_id}
    if before:
        q["created_at"] = {"$lt": before}
    docs = await db.study_group_messages.find(q, {"_id": 0}).sort(
        "created_at", -1).to_list(min(max(limit, 1), 100))
    docs.reverse()
    return {"items": [serialize(m) for m in docs]}


@api_router.post("/study-groups/{group_id}/messages")
async def post_group_message_http(group_id: str, payload: dict,
                                  user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    msg = await _store_group_message(g, user, payload or {})
    await _broadcast_group(group_id, {"type": "message", "message": msg})
    asyncio.create_task(_maybe_answer_group_ai(group_id, msg, dict(user)))
    return {"message": msg}


@api_router.post("/study-groups/{group_id}/ask-ai")
async def ask_group_ai_http(group_id: str, payload: dict,
                            user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_member(g, user["user_id"])
    question = str((payload or {}).get("question") or (payload or {}).get("text") or "").strip()
    if not question:
        raise HTTPException(400, "Question is required")
    qmsg = await _store_group_message(g, user, {"kind": "text", "text": question})
    await _broadcast_group(group_id, {"type": "message", "message": qmsg})
    fresh = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    answer = await _reply_group_ai(fresh or g, qmsg, dict(user))
    return {"question": qmsg, "answer": answer}

