# __SG_REST__ part 3a/5: join requests
@api_router.get("/study-groups/{group_id}/requests")
async def list_group_requests(group_id: str, user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    items = await db.study_group_requests.find(
        {"group_id": group_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": items}


@api_router.post("/study-groups/{group_id}/requests")
async def request_join_group(group_id: str, user: dict = Depends(get_current_user)):
    if user.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    if any(isinstance(m, dict) and m.get("user_id") == user["user_id"]
           for m in g.get("members") or []):
        return {"ok": True, "status": "member"}
    if (g.get("exam_level") or "") != (user.get("exam_level") or ""):
        raise HTTPException(403, "This group is for another exam level")
    existing = await db.study_group_requests.find_one(
        {"group_id": group_id, "user_id": user["user_id"]}, {"_id": 0})
    if existing and existing.get("status") == "pending":
        return {"ok": True, "status": "pending"}
    now = datetime.utcnow().isoformat()
    req = {
        "request_id": f"sgr_{uuid.uuid4().hex[:12]}",
        "group_id": group_id,
        "group_name": g.get("name", "Study group"),
        "user_id": user["user_id"],
        "full_name": user.get("full_name", "Student"),
        "profile_photo": user.get("profile_photo"),
        "exam_level": user.get("exam_level", ""),
        "status": "pending",
        "created_at": now,
    }
    await db.study_group_requests.update_one(
        {"group_id": group_id, "user_id": user["user_id"]},
        {"$set": req}, upsert=True)
    admins = [m.get("user_id") for m in g.get("members") or []
              if isinstance(m, dict) and m.get("role") == "admin"]
    await _broadcast_group(group_id, {"type": "join_request", "request": req})
    asyncio.create_task(_notify_group_event(
        admins, f"{req['full_name']} wants to join '{g.get('name')}'",
        "group_join_request", f"/study-groups/{group_id}"))
    return {"ok": True, "status": "pending"}
