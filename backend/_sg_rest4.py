# __SG_REST__ part 3b/5: decide + invite
@api_router.post("/study-groups/{group_id}/requests/{request_id}")
async def decide_join_request(group_id: str, request_id: str, payload: dict,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    req = await db.study_group_requests.find_one(
        {"request_id": request_id, "group_id": group_id}, {"_id": 0})
    if not req or req.get("status") != "pending":
        raise HTTPException(404, "Request not found")
    action = str((payload or {}).get("action") or "").lower()
    if action not in ("approve", "reject"):
        raise HTTPException(400, "action must be approve or reject")
    if action == "reject":
        await db.study_group_requests.update_one(
            {"request_id": request_id}, {"$set": {"status": "rejected"}})
        await _broadcast_group(group_id, {"type": "request_decided",
                                          "request_id": request_id, "action": "reject"})
        return {"ok": True, "action": "reject"}
    now = datetime.utcnow().isoformat()
    await db.study_group_requests.update_one(
        {"request_id": request_id}, {"$set": {"status": "approved"}})
    if not any(isinstance(m, dict) and m.get("user_id") == req["user_id"]
               for m in g.get("members") or []):
        await db.study_groups.update_one(
            {"group_id": group_id},
            {"$push": {"members": {
                "user_id": req["user_id"],
                "full_name": req.get("full_name", "Student"),
                "profile_photo": req.get("profile_photo"),
                "role": "member", "status": "member", "joined_at": now}},
             "$set": {"updated_at": now}})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {
        "type": "member_joined",
        "member": {"user_id": req["user_id"],
                   "full_name": req.get("full_name", "Student"),
                   "profile_photo": req.get("profile_photo")},
        "group": _study_group_public(g, None),
    })
    asyncio.create_task(_notify_group_event(
        [req["user_id"]], f"You joined '{g.get('name')}'", "group_joined",
        f"/study-groups/{group_id}"))
    return {"ok": True, "action": "approve"}


@api_router.post("/study-groups/{group_id}/invite")
async def invite_group_member(group_id: str, payload: dict,
                              user: dict = Depends(get_current_user)):
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    if not g:
        raise HTTPException(404, "Group not found")
    _require_group_admin(g, user["user_id"], user.get("role", ""))
    target_id = str((payload or {}).get("user_id") or "").strip()
    if not target_id:
        raise HTTPException(400, "user_id is required")
    target = await db.users.find_one({"user_id": target_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Student not found")
    if target.get("role") == "teacher":
        raise HTTPException(403, "Study groups are for students")
    if (target.get("exam_level") or "") != (g.get("exam_level") or ""):
        raise HTTPException(403, "That student is in a different exam level")
    if any(isinstance(m, dict) and m.get("user_id") == target_id
           for m in g.get("members") or []):
        return {"ok": True, "status": "member"}
    now = datetime.utcnow().isoformat()
    await db.study_groups.update_one(
        {"group_id": group_id},
        {"$push": {"members": {
            "user_id": target_id,
            "full_name": target.get("full_name", "Student"),
            "profile_photo": target.get("profile_photo"),
            "role": "member", "status": "member", "joined_at": now}},
         "$set": {"updated_at": now}})
    g = await db.study_groups.find_one({"group_id": group_id}, {"_id": 0})
    await _broadcast_group(group_id, {
        "type": "member_joined",
        "member": {"user_id": target_id,
                   "full_name": target.get("full_name", "Student"),
                   "profile_photo": target.get("profile_photo")},
        "group": _study_group_public(g, None),
    })
    asyncio.create_task(_notify_group_event(
        [target_id], f"You were added to '{g.get('name')}'", "group_joined",
        f"/study-groups/{group_id}"))
    return {"ok": True, "status": "member"}

